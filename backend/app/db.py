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
            conn.execute(text("ALTER TABLE eval_cases ADD COLUMN IF NOT EXISTS alt_issue VARCHAR(300)"))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
