"""Policy ingestion and retrieval (RAG).

Policy documents are Markdown files in app/rag/policies/. Each file starts with
front matter lines `title:` and `url:`, followed by the text. Files are split on
`## ` headings into chunks, embedded, and stored in policy_chunks.
"""
import logging
from pathlib import Path

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.llm import embed
from app.models import PolicyChunk

settings = get_settings()
log = logging.getLogger(__name__)
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


def _keyword_scores(db: Session, query: str, k: int) -> list[tuple[PolicyChunk, float]]:
    """TF-IDF keyword match over the policy chunks: no API call, used when embeddings fail."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel

    chunks = db.scalars(select(PolicyChunk).order_by(PolicyChunk.id)).all()
    if not chunks:
        return []
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    matrix = vec.fit_transform([f"{c.title}\n{c.text}" for c in chunks])
    scores = linear_kernel(vec.transform([query]), matrix).ravel()
    order = scores.argsort()[::-1][:k]
    return [(chunks[i], float(scores[i])) for i in order]


def retrieve(db: Session, query: str, k: int | None = None, allow_fallback: bool = True) -> list[dict]:
    """Return the top-k most similar policy chunks with similarity scores.

    Normal path: embedding similarity (pgvector). If the embedding call fails (for example the
    Gemini free tier's daily embedding quota), fall back to keyword (TF-IDF) retrieval so triage
    keeps working; each citation records which method was used. Experiments pass
    allow_fallback=False so one run never mixes retrieval methods.
    """
    k = k or settings.rag_top_k
    method = "embeddings"
    try:
        qvec = embed([query], kind="query")[0]
    except Exception as exc:  # noqa: BLE001
        if not allow_fallback:
            raise
        log.warning("Embedding failed (%s); using keyword retrieval.", str(exc)[:120])
        scored, method = _keyword_scores(db, query, k), "keywords (fallback)"
    else:
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
            "method": method,
        }
        for c, score in scored
    ]
