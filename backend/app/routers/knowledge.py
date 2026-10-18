"""Knowledge Base API: browse, test, edit and re-index the RAG policy documents."""
import re
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_event
from app.db import get_db
from app.models import PolicyChunk, Triage
from app.rag.retriever import POLICY_DIR, ingest_policies, parse_text, retrieve, split_front_matter

router = APIRouter(prefix="/policies")
FILE_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]{0,80}\.md$")


class PolicyIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    url: str | None = Field(default=None, max_length=500)
    body: str = Field(min_length=20, max_length=50_000)
    reviewer: str = "analyst"


class NewPolicyIn(PolicyIn):
    filename: str | None = None


class SearchIn(BaseModel):
    query: str = Field(min_length=3, max_length=5000)
    k: int = Field(default=5, ge=1, le=10)


def _path(filename: str):
    if not FILE_RE.match(filename):
        raise HTTPException(400, "Filename must be lowercase letters, numbers, - or _, ending in .md")
    return POLICY_DIR / filename


def _render(title: str, url: str | None, body: str) -> str:
    title = title.replace("\n", " ").strip()
    url = (url or "").replace("\n", " ").strip()
    return f"---\ntitle: {title}\nurl: {url}\n---\n{body.strip()}\n"


def _usage(db: Session) -> Counter:
    """How many triaged cases cited each policy section title."""
    counts: Counter = Counter()
    for cites in db.scalars(select(Triage.citations)).all():
        for c in cites or []:
            counts[c.get("title")] += 1
    return counts


def _index_state(db: Session, filename: str, chunks: list[dict]) -> str:
    stored = db.scalars(select(PolicyChunk.text).where(PolicyChunk.source_file == filename)).all()
    if not stored:
        return "not_indexed"
    return "indexed" if sorted(stored) == sorted(c["text"] for c in chunks) else "stale"


@router.get("")
def list_policies(db: Session = Depends(get_db)):
    usage = _usage(db)
    docs = []
    for path in sorted(POLICY_DIR.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        meta, _ = split_front_matter(raw)
        chunks = parse_text(path.name, raw)
        docs.append({
            "filename": path.name,
            "title": meta.get("title", path.stem),
            "url": meta.get("url") or None,
            "sections": len(chunks),
            "cited": sum(usage.get(c["title"], 0) for c in chunks),
            "index_state": _index_state(db, path.name, chunks),
        })
    total_chunks = len(db.scalars(select(PolicyChunk.id)).all())
    return {"documents": docs, "indexed_chunks": total_chunks}


@router.get("/{filename}")
def get_policy(filename: str, db: Session = Depends(get_db)):
    path = _path(filename)
    if not path.exists():
        raise HTTPException(404, "Policy not found")
    raw = path.read_text(encoding="utf-8")
    meta, body = split_front_matter(raw)
    usage = _usage(db)
    chunks = parse_text(filename, raw)
    return {
        "filename": filename,
        "title": meta.get("title", path.stem),
        "url": meta.get("url") or None,
        "body": body,
        "index_state": _index_state(db, filename, chunks),
        "sections": [{"title": c["title"], "text": c["text"], "cited": usage.get(c["title"], 0)} for c in chunks],
    }


@router.put("/{filename}")
def update_policy(filename: str, body: PolicyIn, db: Session = Depends(get_db)):
    path = _path(filename)
    if not path.exists():
        raise HTTPException(404, "Policy not found")
    path.write_text(_render(body.title, body.url, body.body), encoding="utf-8")
    n = ingest_policies(db, only=filename)
    log_event(db, f"user:{body.reviewer}", "policy_update", None, filename=filename, chunks=n)
    db.commit()
    return get_policy(filename, db)


@router.post("")
def create_policy(body: NewPolicyIn, db: Session = Depends(get_db)):
    if body.filename:
        filename = body.filename
    else:
        slug = re.sub(r"[^a-z0-9]+", "_", body.title.lower()).strip("_")[:60] or "policy"
        existing = sorted(POLICY_DIR.glob("*.md"))
        nums = [int(m.group(1)) for p in existing if (m := re.match(r"^(\d+)_", p.name))]
        filename = f"{(max(nums) + 1 if nums else 1):02d}_{slug}.md"
    path = _path(filename)
    if path.exists():
        raise HTTPException(409, "A policy with this filename already exists")
    path.write_text(_render(body.title, body.url, body.body), encoding="utf-8")
    n = ingest_policies(db, only=filename)
    log_event(db, f"user:{body.reviewer}", "policy_create", None, filename=filename, chunks=n)
    db.commit()
    return get_policy(filename, db)


@router.post("/reindex")
def reindex_all(db: Session = Depends(get_db)):
    n = ingest_policies(db)
    log_event(db, "user:admin", "policy_reindex", None, chunks=n)
    db.commit()
    return {"indexed_chunks": n}


@router.post("/search")
def search(body: SearchIn, db: Session = Depends(get_db)):
    """Run the research agent's retrieval step on any text (RAG test bench)."""
    return {"query": body.query, "results": retrieve(db, body.query, k=body.k)}
