"""Convert ORM rows to JSON-friendly dicts for the API."""
from datetime import date

from app.models import AuditEvent, Complaint, Triage


def days_left(deadline: date | None) -> int | None:
    return (deadline - date.today()).days if deadline else None


def triage_dict(t: Triage | None) -> dict | None:
    if t is None:
        return None
    return {
        "pred_product": t.pred_product,
        "pred_issue": t.pred_issue,
        "sentiment": t.sentiment,
        "urgency": t.urgency,
        "risk_level": t.risk_level,
        "risk_flags": t.risk_flags or [],
        "risk_reason": t.risk_reason,
        "confidence": t.confidence,
        "summary": t.summary,
        "route": t.route,
        "deadline": t.deadline.isoformat() if t.deadline else None,
        "days_left": days_left(t.deadline),
        "prior_similar": t.prior_similar,
        "citations": t.citations or [],
        "draft_reply": t.draft_reply,
        "final_reply": t.final_reply,
        "reviewer": t.reviewer,
        "model_info": {k: v for k, v in (t.model_info or {}).items() if k != "trace"},
        "trace": (t.model_info or {}).get("trace", []),
    }


def complaint_row(c: Complaint) -> dict:
    """Compact row for the queue table."""
    t = c.triage
    return {
        "id": c.id,
        "date_received": c.date_received.isoformat() if c.date_received else None,
        "status": c.status,
        "preview": c.narrative[:160],
        "product": t.pred_product if t else None,
        "issue": t.pred_issue if t else None,
        "risk_level": t.risk_level if t else None,
        "risk_flags": (t.risk_flags or []) if t else [],
        "confidence": t.confidence if t else None,
        "deadline": t.deadline.isoformat() if t and t.deadline else None,
        "days_left": days_left(t.deadline) if t else None,
    }


def complaint_detail(c: Complaint) -> dict:
    return {
        "id": c.id,
        "date_received": c.date_received.isoformat() if c.date_received else None,
        "status": c.status,
        "narrative": c.narrative,
        "state": c.state,
        "submitted_via": c.submitted_via,
        "tags": c.tags,
        # Ground truth from CFPB, shown separately so reviewers can compare.
        "cfpb_labels": {"product": c.product, "issue": c.issue, "sub_product": c.sub_product},
        "triage": triage_dict(c.triage),
    }


def audit_dict(e: AuditEvent) -> dict:
    return {
        "id": e.id,
        "complaint_id": e.complaint_id,
        "actor": e.actor,
        "action": e.action,
        "detail": e.detail,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
