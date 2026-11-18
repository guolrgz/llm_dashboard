"""认证与令牌会话测试（登录 3 类分支 + me/logout 生命周期）。"""

from __future__ import annotations

import re

from app import db


def _login(client, username="admin", password="admin123"):
    return client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )


def test_login_success(client):
    response = _login(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["token"]
    assert body["tokenType"] == "Bearer"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", body["expiresAt"])
    user = body["user"]
    assert user["username"] == "admin"
    assert user["role"] == "super_admin"
    assert "*" in user["permissions"]
    assert "password" not in response.text
    assert "password_hash" not in response.text


def test_login_wrong_credentials(client):
    assert _login(client, password="wrong-pass").status_code == 401
    body = _login(client, username="no-such-user").json()
    assert body["error"]["code"] == "unauthorized"


def test_login_disabled_user(client):
    # 种子数据中 bob 为停用状态
    response = _login(client, username="bob")
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "user_disabled"


def test_me_requires_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    bad = client.get("/api/auth/me", headers={"Authorization": "Bearer broken.token"})
    assert bad.status_code == 401
    prefixed = client.get("/api/auth/me", headers={"Authorization": "Token abc"})
    assert prefixed.status_code == 401


def test_me_returns_current_user(client, auth_headers):
    response = client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    user = response.json()["user"]
    assert user["username"] == "admin"
    assert set(user) >= {
        "id",
        "username",
        "nickname",
        "userNo",
        "email",
        "status",
        "roleId",
        "role",
        "roleName",
        "permissions",
        "createdAt",
        "lastLoginAt",
    }


def test_logout_revokes_token(client, auth_headers):
    assert client.post("/api/auth/logout", headers=auth_headers).json() == {"ok": True}
    after = client.get("/api/auth/me", headers=auth_headers)
    assert after.status_code == 401
    assert after.json()["error"]["code"] == "token_revoked"


def test_logout_writes_revoked_token_row(client, auth_headers, app):
    client.post("/api/auth/logout", headers=auth_headers)
    conn = db.connect(app.state.db_path)
    try:
        count = conn.execute("SELECT COUNT(*) AS c FROM revoked_tokens").fetchone()["c"]
    finally:
        conn.close()
    assert count == 1
