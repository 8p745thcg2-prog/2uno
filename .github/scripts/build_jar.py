#!/usr/bin/env python3
"""Kasdien paruošia suspaustą įmonių žinyną iš Registrų centro atvirų duomenų.

Šaltiniai (CC BY 4.0, VĮ Registrų centras, atnaujinama kiekvieną dieną):
  https://www.registrucentras.lt/aduomenys/?byla=JAR_IREGISTRUOTI.csv – įmonės, pavadinimas, forma
  https://www.registrucentras.lt/aduomenys/?byla=JAR_ADRESAI.csv      – buveinių adresai (susieta pagal ja_kodas)
JAR_IREGISTRUOTI.csv savo "adresas" stulpelį dažnai turi tuščią – tikrasis buveinės adresas
gyvena atskirame JAR_ADRESAI.csv faile, todėl jis atsisiunčiamas ir sujungiamas papildomai.
Jei adreso faile stulpeliai pasirodytų kitokie, nei numatyta žemiau (ADDR_COL_CANDIDATES /
ADDR_PART_CANDIDATES), skriptas tiesiog adreso neprijungs (neklius su klaida) – pamatysite tai
per sumažėjusį "su adresu" skaičių meta.json faile, ir reikės patikrinti tikrą stulpelių sąrašą
(struktūros failas: https://www.registrucentras.lt/aduomenys/?byla=JAR_ADRESAI_STR.xlsx).
Išvestis: out/jar/<pirmi 5 kodo skaitmenys>.tsv.gz (kodas, pavadinimas, adresas, formos kodas)
ir out/jar/meta.json (data, įrašų skaičius, formų pavadinimai, su adresu rasta).
"""
import csv, gzip, io, json, os, sys, urllib.request, datetime

URL = "https://www.registrucentras.lt/aduomenys/?byla=JAR_IREGISTRUOTI.csv"
ADDR_URL = "https://www.registrucentras.lt/aduomenys/?byla=JAR_ADRESAI.csv"
OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "out", "jar")
MIN_ROWS = 100_000  # apsauga: jei failas nepilnas, nieko neatnaujiname

# Pirmenybės tvarka ieškant pilno adreso stulpelio adresų faile.
ADDR_COL_CANDIDATES = ("pilnas_adresas", "adresas", "buveines_adresas")
# Jei pilno adreso stulpelio nėra – surenkama iš dalių šia tvarka.
ADDR_PART_CANDIDATES = (
    ("gatves_pavadinimas", "gatve"),
    ("namo_nr",),
    ("korpuso_nr",),
    ("buto_nr",),
    ("gyvenvietes_pavadinimas", "miesto_pavadinimas", "miestas"),
    ("savivaldybes_pavadinimas", "savivaldybe"),
    ("pasto_kodas",),
)

def clean(s):
    return " ".join((s or "").replace("\t", " ").split())

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "2uno.lt jar-sync"})
    raw = urllib.request.urlopen(req, timeout=300).read()
    for enc in ("utf-8-sig", "cp1257"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")

def pick(header, names):
    for n in names:
        if n in header:
            return header.index(n)
    return None

def diag_check_govlt():
    """LAIKINA (pašalinti, kai klausimas išsiaiškintas): patikrina, ar get.data.gov.lt API
    (kitas serveris nei registrucentras.lt raw CSV) pasiekiamas iš GitHub Actions."""
    try:
        u = "https://get.data.gov.lt/datasets/gov/rc/jar/iregistruoti/JuridinisAsmuo?ja_kodas=308188308&format(json)"
        req = urllib.request.Request(u, headers={"User-Agent": "2uno.lt jar-sync", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read(1500).decode("utf-8", errors="replace")
            print(f"DIAG get.data.gov.lt: HTTP {r.status} :: {body}")
    except Exception as e:
        print(f"DIAG get.data.gov.lt: KLAIDA {e}")

def load_addresses():
    """Grąžina {ja_kodas: adresas} iš JAR_ADRESAI.csv. Tyliai grąžina {}, jei nepavyksta –
    tada liekame su (tikėtina tuščiu) JAR_IREGISTRUOTI.csv adreso stulpeliu."""
    try:
        text = fetch(ADDR_URL)
        reader = csv.reader(io.StringIO(text), delimiter="|")
        header = [h.strip().lower() for h in next(reader)]
        code_i = pick(header, ("ja_kodas",))
        full_i = pick(header, ADDR_COL_CANDIDATES)
        part_idx = [pick(header, names) for names in ADDR_PART_CANDIDATES] if full_i is None else None
        if code_i is None or (full_i is None and not any(i is not None for i in part_idx)):
            print(f"JAR_ADRESAI.csv: nepažįstami stulpeliai ({header[:12]}...) – adresas neprijungtas")
            return {}
        out = {}
        for r in reader:
            if len(r) <= code_i:
                continue
            code = r[code_i].strip()
            if not (code.isdigit() and len(code) == 9):
                continue
            if full_i is not None:
                addr = clean(r[full_i]) if full_i < len(r) else ""
            else:
                addr = clean(" ".join(clean(r[i]) for i in part_idx if i is not None and i < len(r) and r[i]))
            if addr:
                out[code] = addr
        return out
    except Exception as e:
        print(f"JAR_ADRESAI.csv nepasiekiamas ({e}) – adresas neprijungtas")
        return {}

def main():
    diag_check_govlt()
    addr_by_code = load_addresses()
    try:
        text = fetch(URL)
    except Exception as e:
        # Žinoma priežastis: registrucentras.lt atmeta automatines (ne naršyklės) užklausas iš
        # GitHub Actions (HTTP 403). Reikia kito vykdymo būdo (pvz. Cloudflare Workers).
        sys.exit(f"JAR_IREGISTRUOTI.csv nepasiekiamas ({e}) – atnaujinimas nutrauktas")
    reader = csv.reader(io.StringIO(text), delimiter="|")
    header = [h.strip().lower() for h in next(reader)]
    col = {name: header.index(name) for name in ("ja_kodas", "ja_pavadinimas", "adresas", "form_kodas", "form_pavadinimas")}
    shards, forms, rows, with_addr = {}, {}, 0, 0
    for r in reader:
        if len(r) < len(header):
            continue
        code = r[col["ja_kodas"]].strip()
        if not (code.isdigit() and len(code) == 9):
            continue
        form = r[col["form_kodas"]].strip()
        forms[form] = clean(r[col["form_pavadinimas"]])
        # Adresas: pirmenybė JAR_ADRESAI.csv (buveinės registras), nes JAR_IREGISTRUOTI.csv
        # savąjį adreso stulpelį dažnai palieka tuščią; jei ir jo nėra, liekame su tuo, kas yra.
        address = addr_by_code.get(code) or clean(r[col["adresas"]])
        if address:
            with_addr += 1
        line = "\t".join([code, clean(r[col["ja_pavadinimas"]]), address, form])
        shards.setdefault(code[:5], []).append(line)
        rows += 1
    if rows < MIN_ROWS:
        sys.exit(f"Per mažai įrašų ({rows}) – atnaujinimas nutrauktas")
    os.makedirs(OUT, exist_ok=True)
    # Įrašomi tik pasikeitę failai: jei įmonių duomenys nepasikeitė, failas neliečiamas,
    # todėl kasdien atnaujinama tik tai, kas nauja ar pakeista (be dubliavimo).
    total, changed = 0, 0
    for key, lines in shards.items():
        path = os.path.join(OUT, f"{key}.tsv.gz")
        data = gzip.compress(("\n".join(sorted(lines)) + "\n").encode("utf-8"), compresslevel=9, mtime=0)
        total += len(data)
        old = open(path, "rb").read() if os.path.exists(path) else None
        if old != data:
            with open(path, "wb") as f:
                f.write(data)
            changed += 1
    for name in os.listdir(OUT):  # išregistruotų įmonių grupės, kurių nebeliko
        if name.endswith(".tsv.gz") and name[:-7] not in shards:
            os.remove(os.path.join(OUT, name))
            changed += 1
    meta_path = os.path.join(OUT, "meta.json")
    if changed == 0 and os.path.exists(meta_path):
        print(f"Pakeitimų nėra ({rows} įrašų)")
        return
    meta = {"updated": datetime.date.today().isoformat(), "rows": rows, "withAddress": with_addr,
            "shards": len(shards), "bytes": total, "forms": forms,
            "sources": [URL, ADDR_URL], "license": "CC BY 4.0, VĮ Registrų centras"}
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    print(f"Įrašų: {rows}, su adresu: {with_addr}, failų: {len(shards)}, pakeista: {changed}, suspausta: {total/1e6:.1f} MB")

if __name__ == "__main__":
    main()
