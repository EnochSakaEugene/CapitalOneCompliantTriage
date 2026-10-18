"""Similar past cases: the closest resolved complaints to the one being reviewed, so the
analyst can reuse how similar cases were handled and keep answers consistent.

Candidates are complaints with a known outcome: cases approved or closed in TriageIQ (with the
reply that was sent) and historical CFPB complaints in the train split (with the company's
public response category). Uses stored embeddings when available (semantic search with
pgvector), otherwise TF-IDF cosine similarity (keyword overlap, computed locally).
"""
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload, undefer

from app.models import Complaint

RESOLVED = ("approved", "closed")
_tfidf_cache: dict = {}


def _candidate_filter():
    return or_(Complaint.split == "train", Complaint.status.in_(RESOLVED))


def _row(c: Complaint, score: float, method: str) -> dict:
    t = c.triage
    resolved_here = c.status in RESOLVED and t is not None
    return {
        "id": c.id,
        "similarity": round(float(score), 3),
        "method": method,
        "date_received": c.date_received.isoformat() if c.date_received else None,
        "product": (t.corrected_product or t.pred_product) if resolved_here else c.product,
        "issue": (t.corrected_issue or t.pred_issue) if resolved_here else c.issue,
        "status": c.status,
        "outcome": ("Reply approved in TriageIQ" if c.status == "approved" else "Closed by Compliance")
        if resolved_here else (c.company_response or "Outcome not recorded"),
        "reply": (t.final_reply or "")[:700] if resolved_here else None,
        "preview": c.narrative[:220],
    }


def _by_embedding(db: Session, complaint: Complaint, k: int) -> list[dict] | None:
    vec = complaint.embedding
    if vec is None:
        return None
    dist = Complaint.embedding.cosine_distance(vec)
    rows = db.execute(
        select(Complaint, dist.label("d")).options(selectinload(Complaint.triage))
        .where(Complaint.id != complaint.id, Complaint.embedding.is_not(None), _candidate_filter())
        .order_by(dist).limit(k)
    ).all()
    return [_row(c, 1 - d, "embeddings") for c, d in rows] if rows else None


def _by_tfidf(db: Session, complaint: Complaint, k: int) -> list[dict]:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel

    ids = db.scalars(select(Complaint.id).where(_candidate_filter()).order_by(Complaint.id)).all()
    key = (len(ids), ids[-1] if ids else 0, sum(ids[-50:]))
    if _tfidf_cache.get("key") != key:
        texts = db.execute(select(Complaint.id, Complaint.narrative).where(Complaint.id.in_(ids))
                           .order_by(Complaint.id)).all()
        vec = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=60000, sublinear_tf=True,
                              stop_words="english")
        matrix = vec.fit_transform([t.narrative for t in texts]) if texts else None
        _tfidf_cache.update(key=key, vec=vec, matrix=matrix, ids=[t.id for t in texts])
    if _tfidf_cache.get("matrix") is None:
        return []
    q = _tfidf_cache["vec"].transform([complaint.narrative])
    scores = linear_kernel(q, _tfidf_cache["matrix"]).ravel()
    order = scores.argsort()[::-1]
    picked = [(_tfidf_cache["ids"][i], scores[i]) for i in order[: k + 1] if _tfidf_cache["ids"][i] != complaint.id][:k]
    by_id = {c.id: c for c in db.scalars(select(Complaint).options(selectinload(Complaint.triage))
                                           .where(Complaint.id.in_([i for i, _ in picked]))).all()}
    return [_row(by_id[i], s, "keywords (TF-IDF)") for i, s in picked if i in by_id and s > 0]


def similar_cases(db: Session, complaint_id: int, k: int = 3) -> list[dict]:
    complaint = db.scalars(select(Complaint).options(undefer(Complaint.embedding))
                           .where(Complaint.id == complaint_id)).first()
    if not complaint:
        return []
    try:
        found = _by_embedding(db, complaint, k)
    except Exception:  # noqa: BLE001 - e.g. SQLite tests without pgvector
        db.rollback()
        found = None
    return found if found else _by_tfidf(db, complaint, k)
