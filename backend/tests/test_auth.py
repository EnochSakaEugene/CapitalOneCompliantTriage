"""Login, roles, password change, lockout and route protection (real auth, no override)."""
import os

import pytest

os.environ["OPENAI_API_KEY"] = ""
os.environ["GOOGLE_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app.db import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from scripts.seed_users import seed  # noqa: E402

@pytest.fixture(scope="module")
def client():
    from app.security import current_user

    saved = app.dependency_overrides.pop(current_user, None)   # use real authentication here
    init_db()
    with SessionLocal() as db:
        db.execute(delete(User))
        db.commit()
        seed(db)
    with TestClient(app) as c:
        yield c
    if saved:
        app.dependency_overrides[current_user] = saved


def login(c, email, password):
    return c.post("/api/auth/login", json={"email": email, "password": password})


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_routes_need_login(client):
    assert client.get("/api/complaints").status_code == 401
    assert client.get("/api/policies").status_code == 401
    assert client.get("/api/ping").status_code == 200


def test_login_and_profile(client):
    r = login(client, "Analyst@TriageIQ.demo", "Analyst#2026")   # email is case-insensitive
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "analyst" and "password" not in str(body["user"]).lower().replace("password_changed_at", "")
    me = client.get("/api/auth/me", headers=auth(body["token"])).json()
    assert me["email"] == "analyst@triageiq.demo" and me["role_label"] == "Complaint Analyst"


def test_wrong_password_is_generic(client):
    r = login(client, "analyst@triageiq.demo", "nope")
    assert r.status_code == 401 and r.json()["detail"] == "Email or password is incorrect."
    assert login(client, "nobody@triageiq.demo", "x").json()["detail"] == "Email or password is incorrect."


def test_roles_are_enforced(client):
    cx = login(client, "cx@triageiq.demo", "Insight#2026").json()["token"]
    analyst = login(client, "analyst@triageiq.demo", "Analyst#2026").json()["token"]
    compliance = login(client, "compliance@triageiq.demo", "Comply#2026").json()["token"]
    assert client.get("/api/governance", headers=auth(cx)).status_code == 200
    # Every role can view governance and the audit log; changes stay restricted.
    assert client.get("/api/governance", headers=auth(analyst)).status_code == 200
    assert client.get("/api/audit", headers=auth(cx)).status_code == 200
    assert client.post("/api/governance/risks", json={"title": "x"}, headers=auth(cx)).status_code == 403
    assert client.get("/api/audit", headers=auth(compliance)).status_code == 200
    assert client.post("/api/triage-batch?limit=1", headers=auth(cx)).status_code == 403
    assert client.post("/api/policies/reindex", headers=auth(analyst)).status_code == 403


def test_password_change_invalidates_old_token(client):
    old = login(client, "admin@triageiq.demo", "Admin#Triage26").json()["token"]
    weak = client.post("/api/auth/change-password", headers=auth(old),
                       json={"current_password": "Admin#Triage26", "new_password": "short"})
    assert weak.status_code == 400 and "10 characters" in weak.json()["detail"]
    ok = client.post("/api/auth/change-password", headers=auth(old),
                     json={"current_password": "Admin#Triage26", "new_password": "New!Passw0rd22"})
    assert ok.status_code == 200
    assert client.get("/api/auth/me", headers=auth(old)).status_code == 401        # old session ended
    assert client.get("/api/auth/me", headers=auth(ok.json()["token"])).status_code == 200
    assert login(client, "admin@triageiq.demo", "New!Passw0rd22").status_code == 200


def test_lockout_after_five_failures(client):
    for _ in range(5):
        login(client, "cx@triageiq.demo", "wrong")
    assert login(client, "cx@triageiq.demo", "Insight#2026").status_code == 423


def test_tampered_token_rejected(client):
    tok = login(client, "compliance@triageiq.demo", "Comply#2026").json()["token"]
    body, sig = tok.split(".")
    assert client.get("/api/auth/me", headers=auth(body + "x." + sig)).status_code == 401
