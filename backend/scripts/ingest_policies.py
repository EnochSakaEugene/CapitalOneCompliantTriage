"""Embed the policy documents in app/rag/policies/ into the vector store.

Usage (from backend/):  python -m scripts.ingest_policies
"""
from app.db import SessionLocal, init_db
from app.rag.retriever import ingest_policies

if __name__ == "__main__":
    init_db()
    with SessionLocal() as db:
        n = ingest_policies(db)
    print(f"Stored {n} policy chunks.")
