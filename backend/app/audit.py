"""Helper for writing audit events."""
from sqlalchemy.orm import Session

from app.models import AuditEvent


def log_event(db: Session, actor: str, action: str, complaint_id: int | None = None, **detail) -> None:
    db.add(AuditEvent(complaint_id=complaint_id, actor=actor, action=action, detail=detail))
