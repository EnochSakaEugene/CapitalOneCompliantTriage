"""SQLAlchemy models: complaints, AI triage results, policy chunks (RAG) and the audit log."""
from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import get_settings
from app.db import Base

settings = get_settings()

if settings.is_postgres:
    from pgvector.sqlalchemy import Vector

    EmbeddingType = Vector(settings.embedding_dim)
else:  # SQLite fallback for quick tests: embeddings stored as JSON lists
    EmbeddingType = JSON


class Complaint(Base):
    """One CFPB complaint. Ground-truth labels (product, issue) come from the CFPB data
    and are hidden from the agents; they are used only for evaluation."""

    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # CFPB Complaint ID
    date_received: Mapped[date | None] = mapped_column(Date)
    product: Mapped[str | None] = mapped_column(String(200))
    sub_product: Mapped[str | None] = mapped_column(String(200))
    issue: Mapped[str | None] = mapped_column(String(300))
    sub_issue: Mapped[str | None] = mapped_column(String(300))
    narrative: Mapped[str] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(String(10))
    submitted_via: Mapped[str | None] = mapped_column(String(50))
    tags: Mapped[str | None] = mapped_column(String(100))
    company_response: Mapped[str | None] = mapped_column(String(200))
    split: Mapped[str] = mapped_column(String(10), default="test")  # train | test
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    # new -> awaiting_review | escalated -> approved | closed
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    triage: Mapped["Triage | None"] = relationship(back_populates="complaint", uselist=False)


class Triage(Base):
    """Output of the agent pipeline for one complaint."""

    __tablename__ = "triage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id"), unique=True, index=True)
    pred_product: Mapped[str | None] = mapped_column(String(200))
    pred_issue: Mapped[str | None] = mapped_column(String(300))
    sentiment: Mapped[str | None] = mapped_column(String(20))
    urgency: Mapped[str | None] = mapped_column(String(20))
    risk_level: Mapped[str] = mapped_column(String(10), default="low", index=True)  # low|medium|high
    risk_flags: Mapped[list] = mapped_column(JSON, default=list)
    risk_reason: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    summary: Mapped[str | None] = mapped_column(Text)
    route: Mapped[str | None] = mapped_column(String(30))  # auto_draft | compliance
    deadline: Mapped[date | None] = mapped_column(Date)
    prior_similar: Mapped[int] = mapped_column(Integer, default=0)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    draft_reply: Mapped[str | None] = mapped_column(Text)
    final_reply: Mapped[str | None] = mapped_column(Text)
    reviewer: Mapped[str | None] = mapped_column(String(100))
    model_info: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    complaint: Mapped[Complaint] = relationship(back_populates="triage")


class PolicyChunk(Base):
    """A chunk of a regulation or policy document, embedded for retrieval (RAG)."""

    __tablename__ = "policy_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_file: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    url: Mapped[str | None] = mapped_column(String(500))
    text: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(EmbeddingType)


class AuditEvent(Base):
    """Append-only log of every agent step and human decision (governance)."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int | None] = mapped_column(ForeignKey("complaints.id"), index=True)
    actor: Mapped[str] = mapped_column(String(100))   # e.g. agent:classify, user:analyst
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
