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


def _parse(path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8").splitlines()
    meta, body_start = {}, 0
    for i, line in enumerate(lines):
        if line.strip() == "---" and i > 0:
            body_start = i + 1
            break
        if ":" in line and line.strip() != "---":
            key, val = line.split(":", 1)
            meta[key.strip().lower()] = val.strip()
    body = "\n".join(lines[body_start:])
    chunks, current_head, buf = [], meta.get("title", path.stem), []
    for line in body.splitlines():
        if line.startswith("## "):
            if "".join(buf).strip():
                chunks.append((current_head, "\n".join(buf).strip()))
            current_head, buf = f"{meta.get('title', path.stem)}: {line[3:].strip()}", []
        else:
            buf.append(line)
    if "".join(buf).strip():
        chunks.append((current_head, "\n".join(buf).strip()))
    return [
        {"source_file": path.name, "title": head, "url": meta.get("url"), "text": text}
        for head, text in chunks
    ]


def ingest_policies(db: Session) -> int:
    """(Re)load every policy file. Returns the number of chunks stored."""
    records = [c for p in sorted(POLICY_DIR.glob("*.md")) for c in _parse(p)]
    db.execute(delete(PolicyChunk))
    if records:
        vectors = embed([f"{r['title']}\n{r['text']}" for r in records])
        for rec, vec in zip(records, vectors):
            db.add(PolicyChunk(**rec, embedding=vec))
    db.commit()
    return len(records)


def retrieve(db: Session, query: str, k: int | None = None) -> list[dict]:
    """Return the top-k most similar policy chunks with cosine similarity scores."""
    k = k or settings.rag_top_k
    qvec = embed([query])[0]
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
