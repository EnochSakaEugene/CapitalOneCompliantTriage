"""Load Capital One complaints (with consumer narratives) into TriageIQ.

Background: on August 14, 2026 the CFPB stopped publishing complaint narratives in
the live Consumer Complaint Database, and its search API / CSV export no longer
include them. All narratives published before that date are in the CFPB's
"Consumer Complaint Database Narratives Archive" (FOIA Electronic Reading Room):
  https://www.consumerfinance.gov/foia-requests/foia-electronic-reading-room/cfpb-consumer-complaint-database-narratives-archive/
The archive is a set of .zip files, one per month or date range.

Usage (from backend/, or via `docker compose exec backend ...`):

  # A) Download archive files straight from the CFPB (default: January-July 2026)
  python -m scripts.load_cfpb --download --limit 8000

  # B) Download specific archive files (copy links from the archive page)
  python -m scripts.load_cfpb --download \
      --archive-url https://files.consumerfinance.gov/f/documents/CCDB_Export_20_July_2026.zip \
      --archive-url https://files.consumerfinance.gov/f/documents/CCDB_Export_14_November_2025_through_December_2025.zip

  # C) Use files you downloaded yourself into the data/ folder (.zip or .csv)
  python -m scripts.load_cfpb --csv /data/CCDB_Export_20_July_2026.zip --csv /data/other.zip

Only complaints whose company contains "CAPITAL ONE" and that include a narrative are
kept. A random --test-frac share is marked split="test" (the incoming queue and the
held-out evaluation set); the rest are split="train".
"""
import argparse
import io
import sys
import zipfile
from pathlib import Path

import httpx
import pandas as pd
from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import Complaint

# Default: January-July 2026 (the August 2026 file has almost no narratives).
# Older files are listed on the archive page and can be added with --archive-url.
_BASE = "https://files.consumerfinance.gov/f/documents/"
DEFAULT_ARCHIVES = [
    _BASE + "CCDB_Export_20_July_2026.zip",
    _BASE + "CCDB_Export_19_June_2026.zip",
    _BASE + "CCDB_Export_18_May_2026.zip",
    _BASE + "CCDB_Export_17_April_2026.zip",
    _BASE + "CCDB_Export_16_March_2026.zip",
    _BASE + "CCDB_Export_15_January_2026_through_February_2026.zip",
]

# Our column name -> accepted source header spellings (lower-cased).
ALIASES: dict[str, list[str]] = {
    "id": ["complaint id", "complaint_id"],
    "date_received": ["date received", "date_received"],
    "product": ["product"],
    "sub_product": ["sub-product", "sub_product", "subproduct"],
    "issue": ["issue"],
    "sub_issue": ["sub-issue", "sub_issue", "subissue"],
    "narrative": ["consumer complaint narrative", "complaint_what_happened", "narrative"],
    "company": ["company"],
    "state": ["state"],
    "submitted_via": ["submitted via", "submitted_via"],
    "tags": ["tags"],
    "company_response": ["company response to consumer", "company_response"],
}
REQUIRED = ["id", "narrative", "company"]


def data_dir() -> Path:
    d = Path("/data") if Path("/data").is_dir() else Path(__file__).resolve().parents[2] / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _column_map(headers: list[str]) -> dict[str, str]:
    """Map source headers to our names; fall back to any header containing 'narrative'."""
    lower = {h.strip().lower(): h for h in headers}
    mapping = {}
    for ours, options in ALIASES.items():
        for opt in options:
            if opt in lower:
                mapping[lower[opt]] = ours
                break
    if "narrative" not in mapping.values():
        for h_low, h in lower.items():
            if "narrative" in h_low or "what_happened" in h_low:
                mapping[h] = "narrative"
                break
    missing = [c for c in REQUIRED if c not in mapping.values()]
    if missing:
        raise SystemExit(
            f"Could not find required columns {missing}.\nHeaders in file: {headers}\n"
            "Share this message so the column aliases in load_cfpb.py can be updated."
        )
    return mapping


def _read_csv_stream(fh, label: str) -> pd.DataFrame:
    header = pd.read_csv(fh, nrows=0, dtype=str).columns.tolist()
    fh.seek(0)
    mapping = _column_map(header)
    parts, scanned = [], 0
    for chunk in pd.read_csv(fh, chunksize=200_000, dtype=str, usecols=list(mapping)):
        scanned += len(chunk)
        chunk = chunk.rename(columns=mapping)
        chunk = chunk[chunk["company"].fillna("").str.upper().str.contains("CAPITAL ONE")]
        chunk = chunk[chunk["narrative"].fillna("").str.strip().str.len() > 30]
        parts.append(chunk)
        print(f"  {label}: scanned {scanned:,} rows, kept {sum(len(p) for p in parts):,}", file=sys.stderr)
    df = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
    for col in ALIASES:
        if col not in df.columns:
            df[col] = None
    return df[list(ALIASES)]


def read_file(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as zf:
            members = [m for m in zf.namelist() if m.lower().endswith(".csv")]
            if not members:
                raise SystemExit(f"No .csv inside {path.name}. Contents: {zf.namelist()[:20]}")
            frames = []
            for m in members:
                with zf.open(m) as raw:
                    frames.append(_read_csv_stream(io.BufferedReader(raw), f"{path.name}/{m}"))
            return pd.concat(frames, ignore_index=True)
    with open(path, "rb") as fh:
        return _read_csv_stream(fh, path.name)


def download(url: str) -> Path:
    dest = data_dir() / url.rsplit("/", 1)[-1]
    if dest.exists() and dest.stat().st_size > 0:
        print(f"Using cached {dest}", file=sys.stderr)
        return dest
    print(f"Downloading {url} ...", file=sys.stderr)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with httpx.stream("GET", url, timeout=600, follow_redirects=True) as r:
        if r.status_code != 200:
            raise SystemExit(
                f"CFPB returned HTTP {r.status_code} for {url}.\n"
                "Check the file name on the archive page (links change each month), or download it "
                "in your browser into the data/ folder and use --csv."
            )
        with open(tmp, "wb") as f:
            for block in r.iter_bytes(1 << 20):
                f.write(block)
    tmp.rename(dest)
    print(f"Saved {dest} ({dest.stat().st_size / 1e6:.1f} MB)", file=sys.stderr)
    return dest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", action="append", help="Local .zip or .csv file (repeatable)")
    src.add_argument("--download", action="store_true", help="Download CFPB narrative archive files")
    ap.add_argument("--archive-url", action="append", help="Archive .zip URL to download (repeatable)")
    ap.add_argument("--limit", type=int, default=8000, help="Max complaints to load")
    ap.add_argument("--test-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    paths = [Path(p) for p in args.csv] if args.csv else [download(u) for u in (args.archive_url or DEFAULT_ARCHIVES)]
    df = pd.concat([read_file(p) for p in paths], ignore_index=True)
    df = df.dropna(subset=["id"]).drop_duplicates(subset="id")
    if df.empty:
        raise SystemExit("No Capital One complaints with narratives found in these files.")
    if len(df) > args.limit:
        df = df.sample(n=args.limit, random_state=args.seed)
    df = df.sample(frac=1, random_state=args.seed).reset_index(drop=True)
    n_test = int(len(df) * args.test_frac)
    df["split"] = ["test"] * n_test + ["train"] * (len(df) - n_test)
    df["date_received"] = pd.to_datetime(df["date_received"], errors="coerce").dt.date

    init_db()
    db = SessionLocal()
    existing = set(db.scalars(select(Complaint.id)).all())
    added = 0
    for row in df.to_dict("records"):
        try:
            cid = int(float(row["id"]))
        except (TypeError, ValueError):
            continue
        if cid in existing:
            continue
        clean = {k: (None if pd.isna(v) else v) for k, v in row.items() if k != "company"}
        clean["id"] = cid
        db.add(Complaint(**clean, status="new"))
        existing.add(cid)
        added += 1
        if added % 1000 == 0:
            db.commit()
    db.commit()
    print(f"Loaded {added} new Capital One complaints ({n_test} marked test).")


if __name__ == "__main__":
    main()
