"""TriageIQ API entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers.api import router
from app.routers.evals import router as evals_router
from app.routers.governance import router as governance_router
from app.routers.knowledge import router as knowledge_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    # An evaluation run still marked "running" when the API starts was killed by a restart.
    from sqlalchemy import update

    from app.db import SessionLocal
    from app.models import EvalRun

    with SessionLocal() as db:
        db.execute(update(EvalRun).where(EvalRun.status == "running")
                   .values(status="stopped", metrics={"note": "stopped by a server restart"}))
        db.commit()
    yield


app = FastAPI(title="TriageIQ API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(governance_router, prefix="/api")
app.include_router(evals_router, prefix="/api")
