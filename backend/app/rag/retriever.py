"""Policy ingestion and retrieval (RAG).

Policy documents are Markdown files in app/rag/policies/. Each file starts with
front matter lines `title:` and `url:`, followed by the text. Files are split on
`## ` headings into chunks, embedded, and stored in policy_chunks.
"""
from pathlib import Path

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.llm import embed
from app.models import PolicyChunk

settings = get_settings()
POLICY_DIR = Path(__file__).parent / "policies"


def split_front_matter(raw: str) -> tuple[dict, str]:
    """Return ({title, url, ...}, body) from a policy file's text."""
    lines = raw.splitlines()
    meta, body_start = {}, 0
    if lines and lines[0].strip() == "---":
        for i, line in enumerate(lines[1:], start=1):
            if line.strip() == "---":
                body_start = i + 1
                break
            if ":" in line:
                key, val = line.split(":", 1)
                meta[key.strip().lower()] = val.strip()
    return meta, "\n".join(lines[body_start:]).strip()


def parse_text(name: str, raw: str) -> list[dict]:
    """Split one policy file into chunks on '## ' headings."""
    meta, body = split_front_matter(raw)
    doc_title = meta.get("title", Path(name).stem)
    chunks, current_head, buf = [], doc_title, []
    for line in body.splitlines():
        if line.startswith("## "):
            if "".join(buf).strip():
                chunks.append((current_head, "\n".join(buf).strip()))
            current_head, buf = f"{doc_title}: {line[3:].strip()}", []
        else:
            buf.append(line)
    if "".join(buf).strip():
        chunks.append((current_head, "\n".join(buf).strip()))
    return [{"source_file": name, "title": head, "url": meta.get("url"), "text": text} for head, text in chunks]


def _parse(path: Path) -> list[dict]:
    return parse_text(path.name, path.read_text(encoding="utf-8"))


def ingest_policies(db: Session, only: str | None = None) -> int:
    """(Re)embed policy files: all of them, or just the file named `only`.
    Returns the number of chunks stored."""
    paths = [POLICY_DIR / only] if only else sorted(POLICY_DIR.glob("*.md"))
    records = [c for p in paths if p.exists() for c in _parse(p)]
    q = delete(PolicyChunk)
    db.execute(q.where(PolicyChunk.source_file == only) if only else q)
    if records:
        vectors = embed([f"{r['title']}\n{r['text']}" for r in records])
        for rec, vec in zip(records, vectors):
            db.add(PolicyChunk(**rec, embedding=vec))
    db.commit()
    return len(records)


def retrieve(db: Session, query: str, k: int | None = None) -> list[dict]:
    """Return the top-k most similar policy chunks with cosine similarity scores."""
    k = k or settings.rag_top_k
    qvec = embed([query], kind="query")[0]
    if settings.is_postgres:
        dist = PolicyChunk.embedding.cosine_distance(qvec)
        rows = db.execute(select(PolicyChunk, dist.label("d")).order_by(dist).limit(k)).all()
        scored = [(chunk, 1 - float(d)) for chunk, d in rows]
    else:
        chunks = db.scalars(select(PolicyChunk)).all()
        q = np.array(qvec)
        scored = sorted(
            ((c, float(np.dot(q, np.array(c.embedding)))) for c in chunks),
            key=lambda x: x[1],
            reverse=True,
        )[:k]
    return [
        {
            "chunk_id": c.id,
            "title": c.title,
            "url": c.url,
            "snippet": c.text[:400],
            "score": round(score, 3),
        }
        for c, score in scored
    ]
