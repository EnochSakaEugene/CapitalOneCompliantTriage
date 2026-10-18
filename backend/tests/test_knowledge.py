"""Knowledge Base API tests (mock mode). Edits happen in a temporary copy of the policy folder."""
import os
import shutil

import pytest

os.environ["OPENAI_API_KEY"] = ""
os.environ["GOOGLE_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.rag import retriever  # noqa: E402
from app.routers import knowledge  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    tmp = tmp_path / "policies"
    shutil.copytree(retriever.POLICY_DIR, tmp)
    monkeypatch.setattr(retriever, "POLICY_DIR", tmp)
    monkeypatch.setattr(knowledge, "POLICY_DIR", tmp)
    init_db()
    with SessionLocal() as db:
        retriever.ingest_policies(db)
    with TestClient(app) as c:
        yield c


def test_list_shows_all_documents_indexed(client):
    d = client.get("/api/policies").json()
    assert len(d["documents"]) >= 12
    assert all(doc["index_state"] == "indexed" for doc in d["documents"])


def test_search_finds_auto_loan_policy(client):
    r = client.post("/api/policies/search", json={"query": "auto loan repossession title lien release", "k": 3}).json()
    assert any("Auto Loan" in x["title"] for x in r["results"])


def test_edit_reindexes_only_that_document(client):
    name = "09_auto_loan_servicing.md"
    doc = client.get(f"/api/policies/{name}").json()
    body = doc["body"] + "\n\n## Test section\nA brand new section about test widgets."
    out = client.put(f"/api/policies/{name}", json={"title": doc["title"], "url": doc["url"], "body": body}).json()
    assert out["index_state"] == "indexed"
    assert any(s["title"].endswith("Test section") for s in out["sections"])


def test_create_and_reject_bad_filename(client):
    new = client.post("/api/policies", json={"title": "Test Policy", "url": "", "body": "## One\nSome policy text here."}).json()
    assert new["filename"].endswith("_test_policy.md") and new["index_state"] == "indexed"
    assert client.get("/api/policies/..%2Fsecrets.md").status_code in (400, 404)
    assert client.put("/api/policies/BAD.md", json={"title": "abc", "body": "x" * 30}).status_code == 400
