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
        "grounding": t.grounding,
        "injection": t.injection,
        "language": t.language or "en",
        "translation": t.translation,
        "corrected_product": t.corrected_product,
        "corrected_issue": t.corrected_issue,
        "corrected_by": t.corrected_by,
        "edit_ratio": t.edit_ratio,
        "total_ms": t.total_ms,
        "tokens": {"in": t.tokens_in or 0, "out": t.tokens_out or 0},
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
        "source": c.source or "cfpb",
        "language": (t.language or "en") if t else None,
        "grounding_score": (t.grounding or {}).get("score") if t else None,
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
        "source": c.source or "cfpb",
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
