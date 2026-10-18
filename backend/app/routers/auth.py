"""Login, profile, password change and logout."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import log_event
from app.db import get_db
from app.models import User
from app.security import (ROLE_LABELS, current_user, hash_password, is_locked, make_token,
                          password_problems, verify_password)

router = APIRouter(prefix="/auth")
MAX_FAILURES = 5
LOCK_MINUTES = 15


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


def user_dict(u: User) -> dict:
    return {
        "id": u.id, "username": u.username, "email": u.email, "full_name": u.full_name,
        "role": u.role, "role_label": ROLE_LABELS.get(u.role, u.role),
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "password_changed_at": u.password_changed_at.isoformat() if u.password_changed_at else None,
    }


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.scalars(select(User).where(func.lower(User.email) == email)).first()
    generic = HTTPException(401, "Email or password is incorrect.")
    if not user:
        log_event(db, "system:auth", "login_failed", None, email_domain=email.split("@")[-1][:60])
        db.commit()
        raise generic
    if is_locked(user):
        raise HTTPException(423, f"Account locked after {MAX_FAILURES} failed attempts. Try again later.")
    if not verify_password(body.password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= MAX_FAILURES:
            user.locked_until = datetime.now() + timedelta(minutes=LOCK_MINUTES)
            user.failed_attempts = 0
        log_event(db, f"user:{user.username}", "login_failed", None, locked=is_locked(user))
        db.commit()
        raise generic
    user.failed_attempts, user.locked_until, user.last_login_at = 0, None, datetime.now()
    log_event(db, f"user:{user.username}", "login", None, role=user.role)
    db.commit()
    return {"token": make_token(user), "user": user_dict(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_dict(user)


@router.post("/change-password")
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    problems = password_problems(body.new_password)
    if problems:
        raise HTTPException(400, "New password needs " + ", ".join(problems) + ".")
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(400, "New password must be different from the current one.")
    user.password_hash = hash_password(body.new_password)
    user.password_version += 1                 # logs out every other session
    user.password_changed_at = datetime.now()
    log_event(db, f"user:{user.username}", "password_change", None)
    db.commit()
    return {"token": make_token(user), "user": user_dict(user)}


@router.post("/logout")
def logout(user: User = Depends(current_user), db: Session = Depends(get_db)):
    log_event(db, f"user:{user.username}", "logout", None)
    db.commit()
    return {"ok": True}
