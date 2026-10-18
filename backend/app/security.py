"""Password hashing, signed session tokens and role checks (standard library only).

- Passwords: PBKDF2-HMAC-SHA256, 600,000 iterations, random 16-byte salt per user.
- Tokens: base64url(JSON payload) + "." + HMAC-SHA256 signature using AUTH_SECRET.
  The payload holds the user id, the user's password_version and an expiry, so a
  password change immediately invalidates every older token.
Production note: put tokens in httpOnly cookies and use an identity provider / SSO.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User

settings = get_settings()
ITERATIONS = 600_000
ROLES = {"analyst", "compliance", "cx_leader", "admin"}
ROLE_LABELS = {"analyst": "Complaint Analyst", "compliance": "Compliance Officer",
               "cx_leader": "CX Leader", "admin": "Administrator"}


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def password_problems(password: str) -> list[str]:
    problems = []
    if len(password) < 10:
        problems.append("at least 10 characters")
    if not re.search(r"[A-Z]", password) or not re.search(r"[a-z]", password):
        problems.append("upper- and lower-case letters")
    if not re.search(r"\d", password):
        problems.append("a number")
    if not re.search(r"[^A-Za-z0-9]", password):
        problems.append("a symbol")
    return problems


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(settings.auth_secret.encode(), body.encode(), hashlib.sha256).digest())


def make_token(user: User) -> str:
    payload = {"uid": user.id, "ver": user.password_version, "exp": int(time.time()) + settings.session_hours * 3600}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{_sign(body)}"


def read_token(token: str) -> dict | None:
    try:
        body, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(body)):
            return None
        payload = json.loads(_unb64(body))
        return payload if payload.get("exp", 0) > time.time() else None
    except (ValueError, json.JSONDecodeError):
        return None


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: the logged-in user, or 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not logged in")
    payload = read_token(authorization.split(" ", 1)[1].strip())
    user = db.get(User, payload["uid"]) if payload else None
    if not user or user.password_version != payload["ver"]:
        raise HTTPException(401, "Session expired. Please log in again.")
    return user


def require_roles(*roles: str):
    """FastAPI dependency factory: allow only these roles (admin is always allowed)."""
    allowed = set(roles) | {"admin"}

    def check(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, f"Your role ({ROLE_LABELS.get(user.role, user.role)}) cannot do this.")
        return user

    return check


def is_locked(user: User) -> bool:
    return bool(user.locked_until and user.locked_until > datetime.now())
