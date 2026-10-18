"""REST API used by the Next.js front end."""
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.agents.graph import run_triage
from app.audit import log_event
from app.config import get_settings
from app.db import get_db
from app.models import AuditEvent, Complaint, PolicyChunk, Triage
from app.serializers import audit_dict, complaint_detail, complaint_row

router = APIRouter()
settings = get_settings()


class ReviewIn(BaseModel):
    reviewer: str = "analyst"
    final_reply: str | None = None
    reason: str | None = None


def _get(db: Session, complaint_id: int) -> Complaint:
    c = db.get(Complaint, complaint_id, options=[selectinload(Complaint.triage)])
    if not c:
        raise HTTPException(404, "Complaint not found")
    return c


@router.get("/health")
def health(db: Session = Depends(get_db)):
    return {
        "status": "ok",
        "mock_llm": settings.mock_llm,
        "complaints": db.scalar(select(func.count()).select_from(Complaint)),
        "policy_chunks": db.scalar(select(func.count()).select_from(PolicyChunk)),
    }


@router.get("/complaints")
def list_complaints(
    status: str | None = None,
    risk: str | None = None,
    product: str | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = select(Complaint).options(selectinload(Complaint.triage)).outerjoin(Triage)
    if status:
        q = q.where(Complaint.status == status)
    if risk:
        q = q.where(Triage.risk_level == risk)
    if product:
        q = q.where(Triage.pred_product == product)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    # Most urgent first: high risk, then earliest deadline; untriaged last.
    risk_order = case({"high": 0, "medium": 1, "low": 2}, value=Triage.risk_level, else_=3)
    q = q.order_by(risk_order, Triage.deadline.asc().nulls_last(), Complaint.id).limit(limit).offset(offset)
    return {"total": total, "items": [complaint_row(c) for c in db.scalars(q).all()]}


@router.get("/complaints/{complaint_id}")
def get_complaint(complaint_id: int, db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    events = db.scalars(
        select(AuditEvent).where(AuditEvent.complaint_id == complaint_id).order_by(AuditEvent.id)
    ).all()
    return {**complaint_detail(c), "audit": [audit_dict(e) for e in events]}


@router.post("/triage/{complaint_id}")
def triage_one(complaint_id: int, db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    run_triage(db, c)
    return get_complaint(complaint_id, db)


@router.post("/triage-batch")
def triage_batch(limit: int = Query(10, le=200), db: Session = Depends(get_db)):
    """Triage the next N untriaged complaints from the test split (the 'incoming' queue)."""
    ids = db.scalars(
        select(Complaint.id).outerjoin(Triage).where(Triage.id.is_(None), Complaint.split == "test")
        .order_by(Complaint.date_received.desc()).limit(limit)
    ).all()
    done, errors = [], []
    for cid in ids:
        try:
            run_triage(db, _get(db, cid))
            done.append(cid)
        except Exception as exc:  # keep going; record the failure
            db.rollback()
            errors.append({"id": cid, "error": str(exc)[:300]})
    return {"triaged": done, "errors": errors}


@router.post("/cases/{complaint_id}/approve")
def approve(complaint_id: int, body: ReviewIn, db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    if not c.triage:
        raise HTTPException(400, "Complaint has not been triaged")
    edited = body.final_reply is not None and body.final_reply != c.triage.draft_reply
    c.triage.final_reply = body.final_reply or c.triage.draft_reply
    c.triage.reviewer = body.reviewer
    c.status = "approved"
    log_event(db, f"user:{body.reviewer}", "approve", complaint_id, edited=edited)
    db.commit()
    return get_complaint(complaint_id, db)


@router.post("/cases/{complaint_id}/escalate")
def escalate(complaint_id: int, body: ReviewIn, db: Session = Depends(get_db)):
    c = _get(db, complaint_id)
    c.status = "escalated"
    if c.triage:
        c.triage.route = "compliance"
    log_event(db, f"user:{body.reviewer}", "escalate", complaint_id, reason=body.reason)
    db.commit()
    return get_complaint(complaint_id, db)


@router.post("/cases/{complaint_id}/close")
def close(complaint_id: int, body: ReviewIn, db: Session = Depends(get_db)):
    """Compliance closes an escalated case after handling it."""
    c = _get(db, complaint_id)
    c.status = "closed"
    if c.triage and body.final_reply:
        c.triage.final_reply = body.final_reply
        c.triage.reviewer = body.reviewer
    log_event(db, f"user:{body.reviewer}", "close", complaint_id, reason=body.reason)
    db.commit()
    return get_complaint(complaint_id, db)


@router.get("/insights")
def insights(db: Session = Depends(get_db)):
    rows = db.execute(select(Triage.pred_product, Triage.pred_issue, Triage.risk_level, Triage.risk_flags)).all()
    by_status = dict(db.execute(select(Complaint.status, func.count()).group_by(Complaint.status)).all())
    flags = Counter(f for r in rows for f in (r.risk_flags or []))
    return {
        "triaged": len(rows),
        "by_status": by_status,
        "by_product": Counter(r.pred_product for r in rows).most_common(),
        "by_risk": Counter(r.risk_level for r in rows),
        "top_issues": Counter(f"{r.pred_product} | {r.pred_issue}" for r in rows).most_common(10),
        "flags": flags.most_common(),
    }


@router.get("/evaluation")
def evaluation(db: Session = Depends(get_db)):
    """Compare predicted product/issue with the CFPB's own labels on triaged complaints."""
    rows = db.execute(
        select(Complaint.product, Complaint.issue, Triage.pred_product, Triage.pred_issue).join(Triage)
    ).all()
    n = len(rows)
    if not n:
        return {"n": 0}
    prod_ok = sum(r[0] == r[2] for r in rows)
    issue_ok = sum(r[1] == r[3] for r in rows)
    confusion = Counter((r[0], r[2]) for r in rows)
    per_product: dict[str, dict] = {}
    for actual, _, pred, _ in rows:
        d = per_product.setdefault(actual or "Unknown", {"n": 0, "correct": 0})
        d["n"] += 1
        d["correct"] += int(actual == pred)
    return {
        "n": n,
        "model": "mock-rules" if settings.mock_llm else settings.llm_model_fast,
        "product_accuracy": round(prod_ok / n, 3),
        "issue_accuracy": round(issue_ok / n, 3),
        "per_product": per_product,
        "confusion": [{"actual": a, "predicted": p, "count": k} for (a, p), k in confusion.most_common(30)],
    }


@router.get("/audit")
def audit(limit: int = Query(100, le=1000), db: Session = Depends(get_db)):
    events = db.scalars(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(limit)).all()
    return [audit_dict(e) for e in events]


@router.get("/meta/products")
def products(db: Session = Depends(get_db)):
    return db.scalars(select(Triage.pred_product).distinct()).all()
