"""Embed complaint narratives (PII-redacted) for similar-case search and the embedding classifier.

  python -m scripts.embed_complaints                 # all complaints without an embedding
  python -m scripts.embed_complaints --limit 500 --rpm 10

Train complaints are embedded first (the embedding classifier is trained on them), then test.
Resumable: only complaints with no embedding are processed, so just run it again after a
stop or quota error. Needs a Gemini or OpenAI key (mock embeddings are not stored, so they
can never be mixed with real ones).
"""
import argparse
import sys
import time

from sqlalchemy import case, select

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.llm import embed
from app.models import Complaint
from app.pii import redact

settings = get_settings()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="max complaints to embed this run")
    ap.add_argument("--batch", type=int, default=20, help="texts per API request")
    ap.add_argument("--rpm", type=int, default=10, help="max requests per minute")
    args = ap.parse_args()
    if settings.mock_llm:
        raise SystemExit("No Gemini/OpenAI key set: embeddings need a real model (mock ones are not stored).")
    init_db()
    db = SessionLocal()
    train_first = case((Complaint.split == "train", 0), else_=1)
    q = select(Complaint).where(Complaint.embedding.is_(None)).order_by(train_first, Complaint.id)
    if args.limit:
        q = q.limit(args.limit)
    todo = db.scalars(q).all()
    print(f"{len(todo)} complaints to embed with {settings.provider}.", file=sys.stderr)
    interval, done = 60.0 / max(1, args.rpm), 0
    for i in range(0, len(todo), args.batch):
        chunk = todo[i:i + args.batch]
        texts = [redact(c.narrative)[0][:3000] for c in chunk]  # ~750 tokens each keeps per-minute token use low
        for attempt in range(8):
            try:
                t0 = time.monotonic()
                vectors = embed(texts, kind="document")
                break
            except Exception as exc:  # noqa: BLE001
                msg = str(exc).lower()
                if "per day" in msg or "perday" in msg.replace(" ", ""):
                    raise SystemExit(f"Daily quota reached after {done} complaints. Run again tomorrow.") from exc
                limited = any(m in msg for m in ("429", "quota", "rate", "exhausted"))
                if not limited:
                    raise SystemExit(f"Stopped after {done} complaints: {str(exc)[:300]}") from exc
                if attempt == 7:
                    raise SystemExit(f"Still rate limited after {done} complaints. Wait a few minutes and run "
                                     "the same command again (it continues where it stopped).") from exc
                wait = min(90, 10 * 2 ** attempt)
                print(f"  rate limited, waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
        for c, v in zip(chunk, vectors):
            c.embedding = v
        db.commit()
        done += len(chunk)
        print(f"  {done}/{len(todo)}", file=sys.stderr)
        time.sleep(max(0.0, interval - (time.monotonic() - t0)))
    print("Done. Similar-case search and the 'embed' evaluation variant can now use embeddings.")


if __name__ == "__main__":
    main()
