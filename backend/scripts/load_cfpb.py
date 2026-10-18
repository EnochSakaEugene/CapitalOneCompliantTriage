"""Load Capital One complaints from the public CFPB Consumer Complaint Database.

Usage (run from the backend/ folder):
  # Option A - download straight from the CFPB API (needs internet access to consumerfinance.gov)
  python -m scripts.load_cfpb --download --limit 8000

  # Option B - use a CSV you downloaded from
  #   https://www.consumerfinance.gov/data-research/consumer-complaints/
  #   (full complaints.csv, or a filtered export)
  python -m scripts.load_cfpb --csv ../data/complaints.csv --limit 8000

Only complaints whose company contains "CAPITAL ONE" and that include a consumer
narrative are kept. A random test_frac share is marked split="test": these form the
"incoming" queue and the held-out evaluation set. The rest are split="train"
(few-shot examples / fine-tuning data).
"""
import argparse
import io
import sys

import httpx
import pandas as pd
from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import Complaint

API = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"
COLS = {
    "Complaint ID": "id",
    "Date received": "date_received",
    "Product": "product",
    "Sub-product": "sub_product",
    "Issue": "issue",
    "Sub-issue": "sub_issue",
    "Consumer complaint narrative": "narrative",
    "Company": "company",
    "State": "state",
    "Submitted via": "submitted_via",
    "Tags": "tags",
    "Company response to consumer": "company_response",
}


def _filter(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns=COLS)[list(COLS.values())]
    df = df[df["company"].fillna("").str.upper().str.contains("CAPITAL ONE")]
    return df[df["narrative"].fillna("").str.strip().str.len() > 30]


def from_csv(path: str) -> pd.DataFrame:
    parts = []
    for chunk in pd.read_csv(path, chunksize=200_000, dtype=str, usecols=lambda c: c in COLS):
        parts.append(_filter(chunk))
        print(f"  scanned chunk, kept {sum(len(p) for p in parts)} so far", file=sys.stderr)
    return pd.concat(parts) if parts else pd.DataFrame(columns=list(COLS.values()))


def from_api(limit: int) -> pd.DataFrame:
    params = {
        "company": "CAPITAL ONE FINANCIAL CORPORATION",
        "has_narrative": "true",
        "format": "csv",
        "no_aggs": "true",
        "size": str(limit),
        "sort": "created_date_desc",
    }
    print("Downloading from the CFPB API ...", file=sys.stderr)
    r = httpx.get(API, params=params, timeout=300, follow_redirects=True)
    r.raise_for_status()
    return _filter(pd.read_csv(io.StringIO(r.text), dtype=str))


def main() -> None:
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", help="Path to a CFPB complaints CSV")
    src.add_argument("--download", action="store_true", help="Download from the CFPB API")
    ap.add_argument("--limit", type=int, default=8000, help="Max complaints to load")
    ap.add_argument("--test-frac", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    df = from_csv(args.csv) if args.csv else from_api(args.limit)
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
        cid = int(row["id"])
        if cid in existing:
            continue
        clean = {k: (None if pd.isna(v) else v) for k, v in row.items() if k != "company"}
        clean["id"] = cid
        db.add(Complaint(**clean, status="new"))
        added += 1
        if added % 1000 == 0:
            db.commit()
    db.commit()
    print(f"Loaded {added} new complaints ({n_test} marked test). Skipped {len(df) - added} duplicates.")


if __name__ == "__main__":
    main()
