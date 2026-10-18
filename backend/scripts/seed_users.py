"""Create the demo users (one per role) if they don't exist yet.

Usage (from backend/):  python -m scripts.seed_users [--reset]
--reset sets every demo user's password back to the default below.

Demo accounts (DEMO ONLY - change the passwords after first login):
  analyst@triageiq.demo     Analyst#2026     Complaint Analyst
  compliance@triageiq.demo  Comply#2026      Compliance Officer
  cx@triageiq.demo          Insight#2026     CX Leader
  admin@triageiq.demo       Admin#Triage26   Administrator
"""
import argparse

from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import User
from app.security import hash_password

DEMO_USERS = [
    ("analyst", "analyst@triageiq.demo", "Avery Analyst", "analyst", "Analyst#2026"),
    ("compliance", "compliance@triageiq.demo", "Casey Compliance", "compliance", "Comply#2026"),
    ("cxlead", "cx@triageiq.demo", "Jordan CX Lead", "cx_leader", "Insight#2026"),
    ("admin", "admin@triageiq.demo", "Taylor Admin", "admin", "Admin#Triage26"),
]


def seed(db, reset: bool = False) -> int:
    created = 0
    for username, email, name, role, password in DEMO_USERS:
        user = db.scalars(select(User).where(User.email == email)).first()
        if user is None:
            db.add(User(username=username, email=email, full_name=name, role=role,
                        password_hash=hash_password(password)))
            created += 1
        elif reset:
            user.password_hash = hash_password(password)
            user.password_version += 1
            user.failed_attempts, user.locked_until = 0, None
    db.commit()
    return created


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    init_db()
    with SessionLocal() as db:
        n = seed(db, args.reset)
    print(f"Created {n} demo user(s).{' Passwords reset.' if args.reset else ''}")
