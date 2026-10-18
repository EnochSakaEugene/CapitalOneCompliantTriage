"""End-to-end test of the API and agent pipeline in mock mode (no OpenAI key needed).

Run from backend/ with a Postgres+pgvector database available:
  DATABASE_URL=postgresql+psycopg://triage:triage@localhost:5432/triage_test pytest -q
The test data is SYNTHETIC (tests/fixtures/synthetic_complaints.csv), not real CFPB records.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

os.environ["OPENAI_API_KEY"] = ""  # force mock mode
os.environ["GOOGLE_API_KEY"] = ""
os.environ["LLM_PROVIDER"] = "auto"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import engine, init_db  # noqa: E402
from app.main import app  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def client():
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS audit_events, triage, policy_chunks, complaints CASCADE"))
    init_db()
    run = lambda *a: subprocess.run([sys.executable, "-m", *a], cwd=BACKEND, check=True, capture_output=True)
    run("scripts.load_cfpb", "--csv", "tests/fixtures/synthetic_complaints.csv", "--test-frac", "1.0")
    run("scripts.ingest_policies")
    with TestClient(app) as c:
        yield c


def test_only_capital_one_loaded(client):
    assert client.get("/api/health").json()["complaints"] == 8  # the OTHER BANK row is filtered out


def test_batch_triage_routes_high_risk_to_compliance(client):
    r = client.post("/api/triage-batch?limit=20").json()
    assert len(r["triaged"]) == 8 and not r["errors"]
    fraud = client.get("/api/complaints/900000002").json()
    assert fraud["status"] == "escalated" and fraud["triage"]["route"] == "compliance"
    assert "fraud_or_unauthorized" in fraud["triage"]["risk_flags"]
    routine = client.get("/api/complaints/900000001").json()
    assert routine["status"] == "awaiting_review" and routine["triage"]["draft_reply"]
    assert routine["triage"]["days_left"] == 15


def test_trace_and_citations(client):
    d = client.get("/api/complaints/900000001").json()
    agents = [s["agent"] for s in d["triage"]["trace"]]
    assert agents == ["classify", "research", "route", "draft"]
    assert len(d["triage"]["citations"]) == 3


def test_pii_redacted_before_llm(client):
    d = client.get("/api/complaints/900000006").json()
    pii = next(a for a in d["audit"] if a["actor"] == "system:pii")
    assert pii["detail"]["redactions"].get("EMAIL") == 1


def test_human_approval_is_audited(client):
    d = client.post("/api/cases/900000001/approve", json={"reviewer": "analyst1", "final_reply": "Edited"}).json()
    assert d["status"] == "approved" and d["triage"]["final_reply"] == "Edited"
    assert any(a["action"] == "approve" and a["detail"]["edited"] for a in d["audit"])


def test_evaluation_and_insights(client):
    ev = client.get("/api/evaluation").json()
    assert ev["n"] == 8 and 0 <= ev["product_accuracy"] <= 1
    assert client.get("/api/insights").json()["triaged"] == 8
