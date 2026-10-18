"""Shared test setup: tests act as a logged-in admin by default, so they don't each need to log in.
tests/test_auth.py switches this off (see its `client` fixture) to test the real login flow."""
import pytest

from app.main import app
from app.models import User
from app.security import current_user

TEST_ADMIN = User(id=0, username="test-admin", email="test-admin@triageiq.demo", full_name="Test Admin",
                  role="admin", password_hash="x", password_version=1)


@pytest.fixture(scope="session", autouse=True)
def logged_in_admin():
    app.dependency_overrides[current_user] = lambda: TEST_ADMIN
    yield
    app.dependency_overrides.pop(current_user, None)
