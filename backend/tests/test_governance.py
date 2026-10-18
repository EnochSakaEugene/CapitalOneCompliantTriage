"""Governance API tests (mock mode, synthetic data)."""
import os
import subprocess
import sys
from pathlib import Path

import pytest

os.environ["OPENAI_API_KEY"] = ""
os.environ["GOOGLE_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import engine, init_db  # noqa: E402
from app.main import app  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def client():
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS few_shot_examples, audit_events, triage, policy_chunks, complaints, risk_register CASCADE"))
    init_db()
    run = lambda *a: subprocess.run([sys.executable, "-m", *a], cwd=BACKEND, check=True, capture_output=True)
    run("scripts.load_cfpb", "--csv", "tests/fixtures/synthetic_complaints.csv", "--test-frac", "1.0")
    run("scripts.ingest_policies")
    with TestClient(app) as c:
        c.post("/api/triage-batch?limit=20")
        yield c


def test_override_is_counted_when_human_escalates_an_auto_draft_case(client):
    before = client.get("/api/governance").json()["oversight"]
    assert before["overrides"] == 0 and before["ai_escalated"] == 4
    client.post("/api/cases/900000001/escalate", json={"reviewer": "analyst1", "reason": "looks like fraud"})
    client.post("/api/cases/900000003/approve", json={"reviewer": "analyst1"})
    after = client.get("/api/governance").json()["oversight"]
    assert after["overrides"] == 1 and after["ai_escalated"] == 4
    assert after["approved"] == 1 and after["approve_without_edit_rate"] == 1.0
    assert after["pii_redactions"] >= 1


def test_model_card_and_fairness(client):
    g = client.get("/api/governance").json()
    assert g["model_card"]["provider"] == "mock" and g["model_card"]["evaluation"]["n"] == 8
    tags = {row["group"] for row in g["fairness"]["by_tag"]}
    assert {"Servicemember", "No tag"} <= tags
    assert all(row["small_sample"] for row in g["fairness"]["by_tag"])


def test_risk_register_seed_edit_and_create(client):
    risks = client.get("/api/governance/risks").json()
    assert len(risks) == 14  # 9 original + 5 added (copyright, misuse, hallucination, language, data age)
    r = risks[0]
    upd = client.put(f"/api/governance/risks/{r['id']}", json={**r, "status": "monitoring", "owner": "Team lead"}).json()
    assert upd["status"] == "monitoring" and upd["owner"] == "Team lead"
    new = client.post("/api/governance/risks", json={"risk": "Test risk item", "category": "operational"}).json()
    assert new["id"] and new["status"] == "open"
    assert client.put(f"/api/governance/risks/{r['id']}", json={**r, "impact": "huge"}).status_code == 400
