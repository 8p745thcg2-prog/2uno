#!/usr/bin/env python3
"""Kasdien paruošia įmonių žinyną iš Registrų centro atvirų duomenų.

Šaltiniai (CC BY 4.0, VĮ Registrų centras, atnaujinama kiekvieną dieną):
  https://www.registrucentras.lt/aduomenys/?byla=JAR_IREGISTRUOTI.csv – įmonės, pavadinimas, forma
  https://www.registrucentras.lt/aduomenys/?byla=JAR_ADRESAI.csv      – buveinių adresai (susieta pagal ja_kodas)
JAR_IREGISTRUOTI.csv savo "adresas" stulpelį dažnai turi tuščią – tikrasis buveinės adresas
gyvena atskirame JAR_ADRESAI.csv faile, todėl jis atsisiunčiamas ir sujungiamas papildomai.
Jei adreso faile stulpeliai pasirodytų kitokie, nei numatyta žemiau (ADDR_COL_CANDIDATES /
ADDR_PART_CANDIDATES), skriptas tiesiog adreso neprijungs (neklius su klaida) – pamatysite tai
per sumažėjusį "su adresu" skaičių meta.json faile, ir reikės patikrinti tikrą stulpelių sąrašą
(struktūros failas: https://www.registrucentras.lt/aduomenys/?byla=JAR_ADRESAI_STR.xlsx).
Išvestis: out/jar/<pirmi 4 kodo skaitmenys>.tsv (kodas, pavadinimas, adresas, formos kodas) –
paprastas tekstas (ne gzip), kad tiktų ir rankiniam įkėlimui per GitHub API, kuris priima
tik tekstinį turinį – ir out/jar/meta.json (data, įrašų skaičius, formų pavadinimai, su adresu rasta).
"""
import csv, io, json, os, sys, urllib.request, datetime

URL = "https://www.registrucentras.lt/aduomenys/?byla=JAR_IREGISTRUOTI.csv"
ADDR_URL = "https://www.registrucentras.lt/aduomenys/?byla=JAR_ADRESAI.csv"
OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "out", "jar")
MIN_ROWS = 100_000  # apsauga: jei failas nepilnas, nieko neatnaujiname

# registrucentras.lt blokuoja GitHub Actions (ir, matyt, kitų debesijos/CI paslaugų) IP adresus
# (HTTP 403). Kol tai nepasikeis, naujausius CSV failus reikia atsisiųsti rankiniu būdu per
# naršyklę (kurios IP neblokuojamas), suskaidyti į <10MB dalis ir įkelti kaip GitHub release
# "assets" (tie patalpinti github.com infrastruktūroje, kurios Actions tikrai pasiekia).
# Žemiau surašytos tų dalių nuorodos – prireikus naujo duomenų atnaujinimo, pakeiskite jas
# naujo release'o nuorodomis ir paleiskite "Įmonių žinyno atnaujinimas" workflow rankiniu būdu
# (Actions → Run workflow). Likus tuščiam sąrašui, skriptas vėl bandys fetch(URL)/fetch(ADDR_URL)
# tiesiai iš registrucentras.lt (tai, ko gero, ir toliau neveiks iš Actions, bet nekenkia bandyti).
RELEASE_BASE = "https://github.com/8p745thcg2-prog/2uno/releases/download/jar-data-raw-20261116/"
IREGISTRUOTI_CHUNK_URLS = [
    RELEASE_BASE + "iregistruoti_00",
    RELEASE_BASE + "iregistruoti_01",
    RELEASE_BASE + "iregistruoti_02",
    RELEASE_BASE + "iregistruoti_03",
    RELEASE_BASE + "iregistruoti_04",
]
ADRESAI_CHUNK_URLS = [
    RELEASE_BASE + "adresai_00",
    RELEASE_BASE + "adresai_01",
    RELEASE_BASE + "adresai_02",
]

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

def fetch_raw(url):
    req = urllib.request.Request(url, headers={"User-Agent": "2uno.lt jar-sync"})
    return urllib.request.urlopen(req, timeout=300).read()

def decode(raw):
    for enc in ("utf-8-sig", "cp1257"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")

def fetch(url, chunk_urls=()):
    """Jei chunk_urls nurodyti – surenka failą iš jų dalių (žr. komentarą prie
    IREGISTRUOTI_CHUNK_URLS); kitaip – tiesiai iš url."""
    if chunk_urls:
        raw = b"".join(fetch_raw(u) for u in chunk_urls)
    else:
        raw = fetch_raw(url)
    return decode(raw)

def pick(header, names):
    for n in names:
        if n in header:
            return header.index(n)
    return None

def load_addresses():
    """Grąžina {ja_kodas: adresas} iš JAR_ADRESAI.csv. Tyliai grąžina {}, jei nepavyksta –
    tada liekame su (tikėtina tuščiu) JAR_IREGISTRUOTI.csv adreso stulpeliu."""
    try:
        text = fetch(ADDR_URL, ADRESAI_CHUNK_URLS)
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
    addr_by_code = load_addresses()
    try:
        text = fetch(URL, IREGISTRUOTI_CHUNK_URLS)
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
        shards.setdefault(code[:4], []).append(line)
        rows += 1
    if rows < MIN_ROWS:
        sys.exit(f"Per mažai įrašų ({rows}) – atnaujinimas nutrauktas")
    os.makedirs(OUT, exist_ok=True)
    # Įrašomi tik pasikeitę failai: jei įmonių duomenys nepasikeitė, failas neliečiamas,
    # todėl kasdien atnaujinama tik tai, kas nauja ar pakeista (be dubliavimo).
    total, changed = 0, 0
    for key, lines in shards.items():
        path = os.path.join(OUT, f"{key}.tsv")
        data = ("\n".join(sorted(lines)) + "\n").encode("utf-8")
        total += len(data)
        old = open(path, "rb").read() if os.path.exists(path) else None
        if old != data:
            with open(path, "wb") as f:
                f.write(data)
            changed += 1
    for name in os.listdir(OUT):  # išregistruotų įmonių grupės, kurių nebeliko
        if name.endswith(".tsv") and name != "meta.json" and name[:-4] not in shards:
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
    print(f"Įrašų: {rows}, su adresu: {with_addr}, failų: {len(shards)}, pakeista: {changed}, dydis: {total/1e6:.1f} MB")

if __name__ == "__main__":
    main()
