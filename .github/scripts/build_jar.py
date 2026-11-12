#!/usr/bin/env python3
"""Kasdien paruošia suspaustą įmonių žinyną iš Registrų centro atvirų duomenų.

Šaltinis: https://www.registrucentras.lt/aduomenys/?byla=JAR_IREGISTRUOTI.csv (CC BY 4.0).
Išvestis: out/jar/<pirmi 5 kodo skaitmenys>.tsv.gz (kodas, pavadinimas, adresas, formos kodas)
ir out/jar/meta.json (data, įrašų skaičius, formų pavadinimai).
"""
import csv, gzip, io, json, os, sys, urllib.request, datetime

URL = "https://www.registrucentras.lt/aduomenys/?byla=JAR_IREGISTRUOTI.csv"
OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "out", "jar")
MIN_ROWS = 100_000  # apsauga: jei failas nepilnas, nieko neatnaujiname

def clean(s):
    return " ".join((s or "").replace("\t", " ").split())

def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "2uno.lt jar-sync"})
    raw = urllib.request.urlopen(req, timeout=300).read()
    for enc in ("utf-8-sig", "cp1257"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    reader = csv.reader(io.StringIO(text), delimiter="|")
    header = [h.strip().lower() for h in next(reader)]
    col = {name: header.index(name) for name in ("ja_kodas", "ja_pavadinimas", "adresas", "form_kodas", "form_pavadinimas")}
    shards, forms, rows = {}, {}, 0
    for r in reader:
        if len(r) < len(header):
            continue
        code = r[col["ja_kodas"]].strip()
        if not (code.isdigit() and len(code) == 9):
            continue
        form = r[col["form_kodas"]].strip()
        forms[form] = clean(r[col["form_pavadinimas"]])
        line = "\t".join([code, clean(r[col["ja_pavadinimas"]]), clean(r[col["adresas"]]), form])
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
    meta = {"updated": datetime.date.today().isoformat(), "rows": rows, "shards": len(shards), "bytes": total, "forms": forms,
            "source": URL, "license": "CC BY 4.0, VĮ Registrų centras"}
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    print(f"Įrašų: {rows}, failų: {len(shards)}, pakeista: {changed}, suspausta: {total/1e6:.1f} MB")

if __name__ == "__main__":
    main()
