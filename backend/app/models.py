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


class RiskItem(Base):
    """One row of the AI risk register shown on the Governance page."""

    __tablename__ = "risk_register"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    risk: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(50))        # accuracy | fairness | privacy | security | oversight | operational
    likelihood: Mapped[str] = mapped_column(String(10))      # low | medium | high
    impact: Mapped[str] = mapped_column(String(10))          # low | medium | high
    mitigation: Mapped[str] = mapped_column(Text)
    indicator: Mapped[str | None] = mapped_column(String(50))  # key of a live metric, if any
    owner: Mapped[str] = mapped_column(String(100), default="Unassigned")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | monitoring | mitigated
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class EvalRun(Base):
    """One evaluation run: a classifier variant scored on a fixed set of held-out complaints."""

    __tablename__ = "eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    variant: Mapped[str] = mapped_column(String(20))         # rules | v1 | v2 | v3
    model: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running | done | failed
    n_planned: Mapped[int] = mapped_column(Integer, default=0)
    n_done: Mapped[int] = mapped_column(Integer, default=0)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class EvalCase(Base):
    """One complaint scored in an evaluation run (repeat > 0 = consistency re-run)."""

    __tablename__ = "eval_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("eval_runs.id"), index=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id"))
    repeat: Mapped[int] = mapped_column(Integer, default=0)
    true_product: Mapped[str | None] = mapped_column(String(200))
    true_issue: Mapped[str | None] = mapped_column(String(300))
    pred_product: Mapped[str | None] = mapped_column(String(200))
    pred_issue: Mapped[str | None] = mapped_column(String(300))
    raw_issue: Mapped[str | None] = mapped_column(String(300))      # model's label before snapping
    alt_issue: Mapped[str | None] = mapped_column(String(300))      # second-choice issue (v4+)
    in_taxonomy: Mapped[bool | None] = mapped_column()
    risk_level: Mapped[str | None] = mapped_column(String(10))
    risk_flags: Mapped[list] = mapped_column(JSON, default=list)
    ms: Mapped[int | None] = mapped_column(Integer)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)


class User(Base):
    """A TriageIQ user. Passwords are stored only as salted PBKDF2 hashes."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))           # analyst | compliance | cx_leader | admin
    password_hash: Mapped[str] = mapped_column(String(300))
    password_version: Mapped[int] = mapped_column(Integer, default=1)   # bump to invalidate old tokens
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
