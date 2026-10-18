"""TriageIQ API entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers.api import router
from app.routers.governance import router as governance_router
from app.routers.knowledge import router as knowledge_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
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
