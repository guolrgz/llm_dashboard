"""告警接口与告警生成测试。"""

from __future__ import annotations

from app import db

ADMIN_KEY = "sk-demo-admin-2026"
USER_KEY = "sk-demo-user123-2026"
SMALL_BODY = {"model": "GPT-4o", "messages": [{"role": "user", "content": "hi"}]}

ALERT_FIELDS = {
    "id",
    "type",
    "level",
    "title",
    "message",
    "userId",
    "username",
    "read",
    "createdAt",
}


def connect(app):
    return db.connect(app.state.db_path)


def test_alert_list_and_unread_count(client, auth_headers):
    body = client.get("/api/alerts", headers=auth_headers).json()
    assert body["total"] == 5
    assert body["unread"] == 3
    assert body["page"] == 1 and body["pageSize"] == 10
    assert len(body["items"]) == 5
    for item in body["items"]:
        assert ALERT_FIELDS <= set(item)
    assert any(item["username"] == "user123" for item in body["items"])
    assert any(item["read"] is False for item in body["items"])

    unread = client.get("/api/alerts?unreadOnly=true", headers=auth_headers).json()
    assert unread["total"] == 3
    assert unread["unread"] == 3
    assert all(item["read"] is False for item in unread["items"])

    count = client.get("/api/alerts/unread-count", headers=auth_headers).json()
    assert count == {"unread": 3}


def test_mark_read_and_read_all(client, auth_headers):
    unread = client.get("/api/alerts?unreadOnly=true", headers=auth_headers).json()
    alert_id = unread["items"][0]["id"]

    response = client.post(f"/api/alerts/{alert_id}/read", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["alert"]["id"] == alert_id
    assert response.json()["alert"]["read"] is True
    assert client.get(
        "/api/alerts/unread-count", headers=auth_headers
    ).json()["unread"] == 2

    # 重复标记应幂等
    again = client.post(f"/api/alerts/{alert_id}/read", headers=auth_headers)
    assert again.status_code == 200
    assert client.get(
        "/api/alerts/unread-count", headers=auth_headers
    ).json()["unread"] == 2

    read_all = client.post("/api/alerts/read-all", headers=auth_headers)
    assert read_all.status_code == 200
    assert read_all.json() == {"ok": True, "affected": 2}
    assert client.get(
        "/api/alerts/unread-count", headers=auth_headers
    ).json()["unread"] == 0
    assert client.get(
        "/api/alerts?unreadOnly=true", headers=auth_headers
    ).json()["total"] == 0


def test_mark_missing_alert_returns_404(client, auth_headers):
    response = client.post("/api/alerts/999999/read", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_alert_permissions(client):
    assert client.get("/api/alerts").status_code == 401

    login = client.post(
        "/api/auth/login", json={"username": "alice", "password": "admin123"}
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    # 开发者角色没有 alerts.view / alerts.manage
    assert client.get("/api/alerts", headers=headers).status_code == 403
    assert client.post("/api/alerts/read-all", headers=headers).status_code == 403
    # 未读数是登录即可访问的轻量接口
    assert client.get("/api/alerts/unread-count", headers=headers).status_code == 200


def test_rate_limit_generates_alert(client, auth_headers):
    codes = [
        client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {USER_KEY}"},
            json=SMALL_BODY,
        ).status_code
        for _ in range(31)
    ]
    assert codes[-1] == 429
    assert codes.count(200) == 30

    body = client.get(
        "/api/alerts?unreadOnly=true&pageSize=100", headers=auth_headers
    ).json()
    assert body["unread"] >= 4
    assert any(item["type"] == "rate_limit" for item in body["items"])


def test_quota_exceeded_generates_alert(client, auth_headers, app):
    conn = connect(app)
    try:
        user_id = conn.execute(
            "SELECT id FROM users WHERE username = 'user123'"
        ).fetchone()["id"]
        conn.execute(
            "UPDATE api_keys SET daily_quota = 1850000 WHERE user_id = ?", (user_id,)
        )
        conn.commit()
    finally:
        conn.close()

    rejected = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {USER_KEY}"},
        json=SMALL_BODY,
    )
    assert rejected.status_code == 429
    assert rejected.json()["error"]["code"] == "quota_exceeded"

    body = client.get(
        "/api/alerts?unreadOnly=true&pageSize=100", headers=auth_headers
    ).json()
    assert any(item["type"] == "quota.exceeded" for item in body["items"])
    assert body["unread"] >= 4


def test_quota_threshold_generates_warning_alert(client, auth_headers, app):
    # user123 种子已用 92.5% 日配额，一次成功请求后应生成阈值告警
    response = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {USER_KEY}"},
        json=SMALL_BODY,
    )
    assert response.status_code == 200

    body = client.get(
        "/api/alerts?unreadOnly=true&pageSize=100", headers=auth_headers
    ).json()
    assert any(item["type"] == "quota.warning" for item in body["items"])
    assert body["unread"] >= 4
