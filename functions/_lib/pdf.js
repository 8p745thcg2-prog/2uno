// Mažas PDF generatorius be išorinių bibliotekų: A4, Liberation Serif su lietuviškomis
// raidėmis (įterptas šriftas, Identity-H), automatinis eilučių laužymas ir puslapiavimas.
import { FONT_META, FONT_B64 } from './fonts-data.js';

const A4 = { w: 595.28, h: 841.89 };
const enc = new TextEncoder();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deflate(bytes) {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class Font {
  constructor(key, def, fakeBold = false) {
    this.key = key;
    this.def = def;
    this.fakeBold = fakeBold;
    this.cmap = new Map(def.cmap);
    this.fallback = this.cmap.get(63); // '?'
    this.used = new Map(); // gid -> unicode
  }
  gid(cp) {
    if (cp === 0x00a0) cp = 0x20;
    const g = this.cmap.get(cp);
    return g === undefined ? this.fallback : g;
  }
  width(text, size) {
    let w = 0;
    for (const ch of text) w += this.def.widths[this.gid(ch.codePointAt(0))];
    return (w * size) / this.def.upm;
  }
  hex(text) {
    let s = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const g = this.gid(cp);
      if (!this.used.has(g)) this.used.set(g, cp === 0x00a0 ? 0x20 : cp);
      s += g.toString(16).padStart(4, '0');
    }
    return s;
  }
}

function pdfString(s) {
  return '(' + String(s).replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '') + ')';
}

export class PdfDoc {
  constructor({ margin = 56.7, title = '', footer = '' } = {}) {
    // Vienas įterptas šriftas; paryškinimas – tuo pačiu šriftu su kontūru (mažesnis PDF).
    const regular = new Font('F1', FONT_META);
    const bold = new Font('F1', FONT_META, true);
    bold.used = regular.used;
    this.fonts = { regular, bold };
    this.margin = margin;
    this.title = title;
    this.footer = footer;
    this.pages = [];
    this.newPage();
  }

  get contentWidth() {
    return A4.w - 2 * this.margin;
  }

  newPage() {
    this.page = { ops: [] };
    this.pages.push(this.page);
    this.y = A4.h - this.margin;
  }

  ensure(height) {
    if (this.y - height < this.margin + 20) this.newPage();
  }

  drawText(text, x, y, font, size) {
    const mode = font.fakeBold ? `2 Tr ${(size * 0.03).toFixed(3)} w ` : '0 Tr ';
    this.page.ops.push(`BT ${mode}/${font.key} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td <${font.hex(text)}> Tj ET`);
  }

  wrap(text, font, size, width) {
    const lines = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/ +/);
      let line = '';
      for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (font.width(candidate, size) <= width || !line) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  // Pastraipa. Pasirinktinai: bold, size, align ('left' | 'center' | 'justify'), indent, label (numeris kairėje).
  paragraph(text, { bold = false, size = 11, align = 'justify', indent = 0, label = '', spaceBefore = 0, spaceAfter = 6, lineHeight = 1.32 } = {}) {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const lh = size * lineHeight;
    const x0 = this.margin + indent;
    const width = this.contentWidth - indent;
    const lines = this.wrap(text, font, size, width);
    this.y -= spaceBefore;
    lines.forEach((line, i) => {
      this.ensure(lh);
      this.y -= lh;
      const baseline = this.y + (lh - size) / 2;
      if (i === 0 && label) {
        const lf = this.fonts.bold;
        this.drawText(label, this.margin + indent - lf.width(label + ' ', size) - 2, baseline, lf, size);
      }
      const isLast = i === lines.length - 1;
      if (align === 'center') {
        this.drawText(line, this.margin + (this.contentWidth - font.width(line, size)) / 2, baseline, font, size);
      } else if (align === 'justify' && !isLast && line.includes(' ')) {
        this.justified(line, x0, baseline, font, size, width);
      } else {
        this.drawText(line, x0, baseline, font, size);
      }
    });
    this.y -= spaceAfter;
  }

  justified(line, x, y, font, size, width) {
    const words = line.split(' ');
    const wordsWidth = words.reduce((s, w) => s + font.width(w, size), 0);
    const gap = (width - wordsWidth) / (words.length - 1);
    let cx = x;
    for (const w of words) {
      this.drawText(w, cx, y, font, size);
      cx += font.width(w, size) + gap;
    }
  }

  // Dviejų stulpelių blokas (rekvizitams): kiekviena eilutė [kairė, dešinė]; { bold: true } eilutei.
  columns(rows, { size = 10, gap = 24, lineHeight = 1.35 } = {}) {
    const colW = (this.contentWidth - gap) / 2;
    const lh = size * lineHeight;
    for (const row of rows) {
      const font = row.bold ? this.fonts.bold : this.fonts.regular;
      const left = this.wrap(row.cells[0] || '', font, size, colW);
      const right = this.wrap(row.cells[1] || '', font, size, colW);
      const n = Math.max(left.length, right.length);
      this.ensure(n * lh + (row.spaceBefore || 0));
      this.y -= row.spaceBefore || 0;
      for (let i = 0; i < n; i++) {
        this.y -= lh;
        const baseline = this.y + (lh - size) / 2;
        if (left[i]) this.drawText(left[i], this.margin, baseline, font, size);
        if (right[i]) this.drawText(right[i], this.margin + colW + gap, baseline, font, size);
      }
    }
  }

  line(x1, y1, x2, y2, width = 0.6) {
    this.page.ops.push(`${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  space(h) {
    this.y -= h;
  }

  async save() {
    const total = this.pages.length;
    if (this.footer || total > 1) {
      this.pages.forEach((p, i) => {
        this.page = p;
        const txt = `${this.footer ? this.footer + '   ' : ''}${i + 1} / ${total}`;
        const f = this.fonts.regular;
        this.drawText(txt, A4.w - this.margin - f.width(txt, 8), this.margin / 2, f, 8);
      });
    }

    const objects = []; // index = obj number - 1
    const add = (body) => {
      objects.push(body);
      return objects.length;
    };
    const reserve = () => add(null);

    const catalogId = reserve();
    const pagesId = reserve();

    const fontIds = {};
    for (const font of [this.fonts.regular]) {
      const ttf = b64ToBytes(FONT_B64);
      if (FONT_META.sha256 && (await sha256Hex(ttf)) !== FONT_META.sha256) throw new Error('Šrifto failas pažeistas');
      const ttfZ = await deflate(ttf);
      const fileId = add({ dict: `<< /Length ${ttfZ.length} /Length1 ${ttf.length} /Filter /FlateDecode >>`, stream: ttfZ });
      const s = 1000 / font.def.upm;
      const [x0, y0, x1, y1] = font.def.bbox.map((v) => Math.round(v * s));
      const descId = add(
        `<< /Type /FontDescriptor /FontName /${font.def.name} /Flags 34 /FontBBox [${x0} ${y0} ${x1} ${y1}] /ItalicAngle 0 ` +
          `/Ascent ${Math.round(font.def.ascent * s)} /Descent ${Math.round(font.def.descent * s)} /CapHeight ${Math.round(font.def.capHeight * s)} /StemV 80 /FontFile2 ${fileId} 0 R >>`
      );
      const used = [...font.used.keys()].sort((a, b) => a - b);
      const w = used.map((g) => `${g} [${Math.round(font.def.widths[g] * s)}]`).join(' ');
      const cidId = add(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.def.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
          `/FontDescriptor ${descId} 0 R /DW 500 /W [${w}] /CIDToGIDMap /Identity >>`
      );
      const bf = used.map((g) => `<${g.toString(16).padStart(4, '0')}> <${font.used.get(g).toString(16).padStart(4, '0')}>`);
      let cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n';
      for (let i = 0; i < bf.length; i += 100) {
        const chunk = bf.slice(i, i + 100);
        cmap += `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar\n`;
      }
      cmap += 'endcmap CMapName currentdict /CMap defineresource pop end end';
      const cmapBytes = await deflate(enc.encode(cmap));
      const toUniId = add({ dict: `<< /Length ${cmapBytes.length} /Filter /FlateDecode >>`, stream: cmapBytes });
      fontIds[font.key] = add(`<< /Type /Font /Subtype /Type0 /BaseFont /${font.def.name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${toUniId} 0 R >>`);
    }
    const fontRes = Object.entries(fontIds).map(([k, id]) => `/${k} ${id} 0 R`).join(' ');

    const pageIds = [];
    for (const p of this.pages) {
      const content = await deflate(enc.encode(p.ops.join('\n')));
      const cId = add({ dict: `<< /Length ${content.length} /Filter /FlateDecode >>`, stream: content });
      pageIds.push(
        add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << ${fontRes} >> >> /Contents ${cId} 0 R >>`)
      );
    }
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    const d = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const infoId = add(`<< /Title ${pdfString(this.title)} /Producer (2uno.lt) /CreationDate (D:${d}Z) >>`);

    const chunks = [];
    let offset = 0;
    const push = (x) => {
      const b = typeof x === 'string' ? enc.encode(x) : x;
      chunks.push(b);
      offset += b.length;
    };
    push('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
    const offsets = [];
    objects.forEach((obj, i) => {
      offsets.push(offset);
      push(`${i + 1} 0 obj\n`);
      if (typeof obj === 'string') {
        push(obj + '\nendobj\n');
      } else {
        push(obj.dict + '\nstream\n');
        push(obj.stream);
        push('\nendstream\nendobj\n');
      }
    });
    const xref = offset;
    push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    push(offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join(''));
    push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const out = new Uint8Array(offset);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}
