"""配额策略与系统设置测试：读取、更新、持久化、权限与校验。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import db


def _login(client, username, password="admin123"):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _user_id(app, username):
    conn = db.connect(app.state.db_path)
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    return row["id"]


# ---------------------------------------------------------------------------
# 系统设置
# ---------------------------------------------------------------------------
def test_get_settings(client, auth_headers):
    response = client.get("/api/settings", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "siteName",
        "defaultDailyQuota",
        "defaultMonthlyQuota",
        "defaultRpm",
        "defaultTpm",
        "alertThreshold",
        "systemStartedAt",
        "uptimeDays",
    }
    assert body["defaultDailyQuota"] == 2_000_000
    assert body["defaultMonthlyQuota"] == 50_000_000
    assert body["defaultRpm"] == 60 and body["defaultTpm"] == 120_000
    assert body["alertThreshold"] == 0.8
    assert body["uptimeDays"] == 15
    assert len(body["systemStartedAt"]) == 19


def test_update_settings_and_persist(client, auth_headers, app):
    response = client.put(
        "/api/settings",
        json={
            "siteName": "测试站点",
            "defaultDailyQuota": 1_000_000,
            "defaultRpm": 30,
            "alertThreshold": 0.9,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["siteName"] == "测试站点"
    assert body["defaultDailyQuota"] == 1_000_000
    assert body["defaultRpm"] == 30
    assert body["alertThreshold"] == 0.9
    assert body["defaultMonthlyQuota"] == 50_000_000  # 未提交的字段保持原值

    conn = db.connect(app.state.db_path)
    try:
        assert (
            conn.execute(
                "SELECT value FROM settings WHERE key = 'default_daily_quota'"
            ).fetchone()["value"]
            == "1000000"
        )
    finally:
        conn.close()

    # “重启”应用（同一数据库重新 create_app）后仍为新值
    from app.main import create_app

    restarted = create_app(app.state.db_path)
    with TestClient(restarted) as restarted_client:
        token = restarted_client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        ).json()["token"]
        again = restarted_client.get(
            "/api/settings", headers={"Authorization": f"Bearer {token}"}
        ).json()
    assert again["defaultDailyQuota"] == 1_000_000
    assert again["alertThreshold"] == 0.9


def test_settings_validation(client, auth_headers):
    assert (
        client.put(
            "/api/settings", json={"defaultDailyQuota": -1}, headers=auth_headers
        ).status_code
        == 400
    )
    assert (
        client.put(
            "/api/settings", json={"alertThreshold": 2}, headers=auth_headers
        ).status_code
        == 400
    )
    assert (
        client.put(
            "/api/settings", json={"alertThreshold": "abc"}, headers=auth_headers
        ).status_code
        == 400
    )
    assert (
        client.put("/api/settings", json={"siteName": ""}, headers=auth_headers).status_code
        == 400
    )


def test_settings_permissions(client, auth_headers):
    assert client.get("/api/settings").status_code == 401
    developer_headers = _login(client, "alice")  # developer 无 settings.view
    assert client.get("/api/settings", headers=developer_headers).status_code == 403
    operator_headers = _login(client, "peter")  # operator 无 settings.view
    assert client.get("/api/settings", headers=operator_headers).status_code == 403

    # 管理员（admin 角色）可读写
    admin_role_headers = _login(client, "victor")
    assert client.get("/api/settings", headers=admin_role_headers).status_code == 200
    response = client.put(
        "/api/settings",
        json={"defaultMonthlyQuota": 60_000_000},
        headers=admin_role_headers,
    )
    assert response.status_code == 200
    assert response.json()["defaultMonthlyQuota"] == 60_000_000


# ---------------------------------------------------------------------------
# 配额 / 限流策略
# ---------------------------------------------------------------------------
def test_quota_policies(client, auth_headers):
    response = client.get("/api/quota/policies", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    defaults = body["defaults"]
    assert defaults["dailyQuota"] == 2_000_000
    assert defaults["monthlyQuota"] == 50_000_000
    assert defaults["rpm"] == 60 and defaults["tpm"] == 120_000
    assert defaults["alertThreshold"] == 0.8

    items = body["items"]
    assert len(items) == 2
    names = {item["targetName"] for item in items}
    assert names == {"admin", "user123"}
    item = items[0]
    assert set(item) == {
        "id",
        "scope",
        "targetId",
        "targetName",
        "dailyQuota",
        "monthlyQuota",
        "rpmLimit",
        "tpmLimit",
        "updatedAt",
    }


def test_update_quota_policy(client, auth_headers, app):
    user_id = _user_id(app, "user123")
    response = client.put(
        f"/api/quota/policies/user/{user_id}",
        json={"dailyQuota": 100_000, "rpmLimit": 10},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    policy = response.json()["policy"]
    assert policy["scope"] == "user"
    assert policy["targetId"] == user_id
    assert policy["dailyQuota"] == 100_000
    assert policy["rpmLimit"] == 10
    assert policy["monthlyQuota"] == 50_000_000  # 未提交字段保持原值

    policies = client.get("/api/quota/policies", headers=auth_headers).json()["items"]
    updated = next(item for item in policies if item["targetId"] == user_id)
    assert updated["dailyQuota"] == 100_000

    usage = client.get("/api/quota/usage", headers=auth_headers).json()["items"]
    user123 = next(item for item in usage if item["userId"] == user_id)
    assert user123["dailyQuota"] == 100_000  # 修改立即生效于用量视图

    # 角色维度新建策略
    role_response = client.put(
        "/api/quota/policies/role/5",
        json={"monthlyQuota": 1_234_567},
        headers=auth_headers,
    )
    assert role_response.status_code == 200
    role_policy = role_response.json()["policy"]
    assert role_policy["scope"] == "role"
    assert role_policy["targetName"] == "普通用户"

    # 校验
    assert (
        client.put(
            "/api/quota/policies/bogus/1", json={}, headers=auth_headers
        ).status_code
        == 400
    )
    assert (
        client.put(
            "/api/quota/policies/user/99999", json={}, headers=auth_headers
        ).status_code
        == 404
    )
    assert (
        client.put(
            f"/api/quota/policies/user/{user_id}",
            json={"dailyQuota": -5},
            headers=auth_headers,
        ).status_code
        == 400
    )


def test_quota_usage(client, auth_headers):
    response = client.get("/api/quota/usage", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    items = body["items"]
    assert len(items) == 128
    item = items[0]
    assert set(item) >= {
        "userId",
        "username",
        "dailyQuota",
        "dayUsed",
        "monthlyQuota",
        "monthUsed",
        "percent",
    }
    user123 = next(entry for entry in items if entry["username"] == "user123")
    assert user123["dayUsed"] == 1_850_000
    assert user123["dailyQuota"] == 2_000_000
    assert user123["percent"] == 92.5
    assert user123["monthUsed"] > user123["dayUsed"]
    assert items[0]["username"] == "user123"  # 按使用率倒序


def test_quota_permissions(client, auth_headers):
    assert client.get("/api/quota/policies").status_code == 401
    developer_headers = _login(client, "alice")  # developer: quota.view 无 manage
    assert (
        client.get("/api/quota/policies", headers=developer_headers).status_code == 200
    )
    forbidden = client.put(
        "/api/quota/policies/user/1",
        json={"dailyQuota": 1},
        headers=developer_headers,
    )
    assert forbidden.status_code == 403
    viewer_headers = _login(client, "user123")  # viewer 无 quota.view
    assert (
        client.get("/api/quota/policies", headers=viewer_headers).status_code == 403
    )
