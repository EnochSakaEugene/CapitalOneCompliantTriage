"""Database engine, session factory and initialisation."""
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


MIGRATIONS = [
    "ALTER TABLE eval_cases ADD COLUMN IF NOT EXISTS alt_issue VARCHAR(300)",
    "ALTER TABLE complaints ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'cfpb'",
    f"ALTER TABLE complaints ADD COLUMN IF NOT EXISTS embedding vector({settings.embedding_dim})",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS grounding JSON",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS injection JSON",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS language VARCHAR(10)",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS translation TEXT",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS corrected_product VARCHAR(200)",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS corrected_issue VARCHAR(300)",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS corrected_by VARCHAR(100)",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS edit_ratio DOUBLE PRECISION",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS total_ms INTEGER",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS tokens_in INTEGER DEFAULT 0",
    "ALTER TABLE triage ADD COLUMN IF NOT EXISTS tokens_out INTEGER DEFAULT 0",
]


def init_db() -> None:
    """Create the pgvector extension (Postgres only) and all tables."""
    from app import models  # noqa: F401  (registers models on Base)

    if settings.is_postgres:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)
    # Lightweight migrations for columns added after a table already existed.
    if settings.is_postgres:
        with engine.begin() as conn:
            for stmt in MIGRATIONS:
                conn.execute(text(stmt))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
