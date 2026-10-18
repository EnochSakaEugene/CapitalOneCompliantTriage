"""TriageIQ API entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers.api import router
from app.routers.auth import router as auth_router
from app.routers.evals import router as evals_router
from app.routers.governance import router as governance_router
from app.routers.business import router as business_router
from app.routers.intake import router as intake_router
from app.routers.knowledge import router as knowledge_router
from app.routers.ops import router as ops_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    # An evaluation run still marked "running" when the API starts was killed by a restart.
    from sqlalchemy import update

    from app.db import SessionLocal
    from app.models import EvalRun

    with SessionLocal() as db:
        db.execute(update(EvalRun).where(EvalRun.status == "running", EvalRun.variant.not_like("draft-%"))
                   .values(status="stopped", metrics={"note": "stopped by a server restart"}))
        # RAG-ablation runs keep their partial results (resumable), only the status changes.
        db.execute(update(EvalRun).where(EvalRun.status == "running", EvalRun.variant.like("draft-%"))
                   .values(status="stopped"))
        db.commit()
        # First start: create the demo users so the team can log in.
        from scripts.seed_users import seed

        if seed(db):
            print("Created demo users (see backend/scripts/seed_users.py).")
    if settings.auth_secret.startswith("dev-only"):
        print("WARNING: AUTH_SECRET is not set; using an insecure development secret.")
    yield


app = FastAPI(title="TriageIQ API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix="/api")
app.include_router(router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(governance_router, prefix="/api")
app.include_router(evals_router, prefix="/api")
app.include_router(intake_router, prefix="/api")
app.include_router(ops_router, prefix="/api")
app.include_router(business_router, prefix="/api")


@app.get("/api/ping")
def ping():
    """Public liveness check (no login needed)."""
    return {"ok": True}
