"""Shared pytest fixtures: isolated SQLite database + authenticated clients."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
for extra in (str(BACKEND_DIR), str(BACKEND_DIR / "vendor")):
    if extra not in sys.path:
        sys.path.insert(0, extra)

from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def app(tmp_path):
    from app.main import create_app

    return create_app(tmp_path / "app.db")


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def admin_token(client) -> str:
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin123"}
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


@pytest.fixture()
def auth_headers(admin_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture()
def demo_api_key() -> str:
    return "sk-demo-admin-2026"
