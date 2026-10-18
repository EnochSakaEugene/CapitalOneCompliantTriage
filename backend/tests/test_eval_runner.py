"""Evaluation runner tests. The LLM is replaced by a fake so no API key is needed."""
import os
import subprocess
import sys
from pathlib import Path

import pytest

os.environ["OPENAI_API_KEY"] = ""
os.environ["GOOGLE_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402
from langchain_core.messages import AIMessage  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.agents import classifier  # noqa: E402
from app.agents.prompts import classify_messages  # noqa: E402
from app.agents.schemas import Classification, ClassificationV4  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from scripts import run_eval  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def db():
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS few_shot_examples, eval_cases, eval_runs, audit_events, triage, policy_chunks, "
                          "complaints, risk_register CASCADE"))
    init_db()
    subprocess.run([sys.executable, "-m", "scripts.load_cfpb", "--csv", "tests/fixtures/synthetic_complaints.csv",
                    "--test-frac", "1.0"], cwd=BACKEND, check=True, capture_output=True)
    s = SessionLocal()
    yield s
    s.close()


class FakeLLM:
    """Stands in for structured(Classification, include_raw=True)."""

    def invoke(self, messages):
        system = messages[0][1]
        free_text = "short CFPB-style issue label" in system  # prompt v1
        v4 = "Disambiguation rules" in system
        extra = {"issue_alt": "Fees or interest"} if v4 else {}
        parsed = (ClassificationV4 if v4 else Classification)(**extra,
            product="Credit card",
            issue="Billing problem" if free_text else "Problem with a purchase shown on your statement",
            sentiment="negative", urgency="low", risk_flags=[], risk_level="low",
            risk_reason="test", confidence=0.9, summary="test",
        )
        raw = AIMessage(content="{}", usage_metadata={"input_tokens": 1000, "output_tokens": 100, "total_tokens": 1100})
        return {"raw": raw, "parsed": parsed, "parsing_error": None}


def test_prompt_versions_differ():
    tax = {"Credit card": ["Problem with a purchase shown on your statement"]}
    v1 = classify_messages("v1", "x", tax)[0][1]
    v2 = classify_messages("v2", "x", tax)[0][1]
    v3 = classify_messages("v3", "x", tax, [{"narrative": "ex", "product": "Credit card", "issue": "Problem with a purchase shown on your statement"}])[0][1]
    assert "short CFPB-style issue label" in v1 and "taxonomy" in v2 and "Labelled examples" in v3


def test_rules_and_llm_variants_on_same_sample(db, monkeypatch):
    settings = get_settings()
    taxonomy = run_eval.load_taxonomy(db)
    ids = run_eval.sample_ids(db, 8, 42)
    rules = run_eval.run_variant(db, "rules", ids, taxonomy, "t", 42, 0, 0)
    assert rules.status == "done" and rules.metrics["n"] == 8 and rules.metrics["consistency"] is None

    monkeypatch.setattr(settings, "google_api_key", "fake-key")
    monkeypatch.setattr(classifier, "structured", lambda *a, **k: FakeLLM())
    v1 = run_eval.run_variant(db, "v1", ids, taxonomy, "t", 42, 0, 3)
    v2 = run_eval.run_variant(db, "v2", ids, taxonomy, "t", 42, 0, 3)
    assert v1.metrics["label_valid_rate"] == 0.0           # free-text labels are not CFPB labels
    assert v2.metrics["label_valid_rate"] == 1.0
    assert v2.metrics["consistency"] == 1.0 and v2.metrics["consistency_n"] == 3
    assert v2.metrics["input_tokens_mean"] == 1000 and v2.n_planned == 8 + 6
    assert v1.config["complaint_ids"] == v2.config["complaint_ids"] == rules.config["complaint_ids"]
    assert v2.metrics["issue_top2_accuracy"] is None
    v4 = run_eval.run_variant(db, "v4", ids, taxonomy, "t", 42, 0, 0)
    # top-2 counts a case right if the CFPB issue is either the first or second choice
    assert v4.metrics["issue_top2_accuracy"] >= v4.metrics["issue_accuracy"]
    assert v4.metrics["issue_top2_accuracy"] > v2.metrics["issue_accuracy"]


def test_api_lists_runs_and_exports(db):
    with TestClient(app) as c:
        runs = c.get("/api/eval/runs").json()
        assert {r["variant"] for r in runs} >= {"rules", "v1", "v2"}
        detail = c.get(f"/api/eval/runs/{runs[0]['id']}").json()
        assert "per_product" in detail and "misses" in detail
        assert c.get(f"/api/eval/runs/{runs[0]['id']}/cases.csv").text.startswith("complaint_id,")
        batches = c.get("/api/eval/batches").json()
        assert batches[0]["name"] == "t" and batches[0]["done"] >= 4
        md = c.get("/api/eval/report.md").text
        assert md.startswith("| Variant") and "v2 zero-shot" in md and "Issue top-2" in md


class QuotaLLM:
    """Fails with a daily-quota error after `ok` successful calls."""

    def __init__(self, ok):
        self.ok, self.calls = ok, 0

    def invoke(self, messages):
        self.calls += 1
        if self.calls > self.ok:
            raise RuntimeError("429 RESOURCE_EXHAUSTED: Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel")
        return FakeLLM().invoke(messages)


def test_daily_quota_stops_cleanly_and_resume_finishes(db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_api_key", "fake-key")
    taxonomy = run_eval.load_taxonomy(db)
    ids = run_eval.sample_ids(db, 8, 7)
    quota = QuotaLLM(ok=3)
    monkeypatch.setattr(classifier, "structured", lambda *a, **k: quota)
    with pytest.raises(run_eval.StopBatch, match="daily quota"):
        run_eval.run_variant(db, "v2", ids, taxonomy, "resume-test", 7, 0, 0)
    stopped = db.scalars(run_eval.select(run_eval.EvalRun).where(run_eval.EvalRun.name == "resume-test")).one()
    assert stopped.status == "stopped" and stopped.n_done == 3

    monkeypatch.setattr(classifier, "structured", lambda *a, **k: FakeLLM())
    done = run_eval.run_variant(db, "v2", ids, taxonomy, "resume-test", 7, 0, 0, resume=True)
    assert done.id == stopped.id and done.status == "done" and done.metrics["n"] == 8


def test_max_calls_budget_stops_batch(db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_api_key", "fake-key")
    monkeypatch.setattr(classifier, "structured", lambda *a, **k: FakeLLM())
    taxonomy = run_eval.load_taxonomy(db)
    ids = run_eval.sample_ids(db, 8, 9)
    with pytest.raises(run_eval.StopBatch, match="max-calls"):
        run_eval.run_variant(db, "v2", ids, taxonomy, "budget-test", 9, 0, 0, budget=run_eval.Budget(5))
