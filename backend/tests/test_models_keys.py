"""模型渠道与 API Key 测试：CRUD/掩码/唯一性、Key 明文一次性、用量与吊销轮换。"""

from __future__ import annotations

from app import db, security
from app.utils import day_key, month_key


def _login(client, username, password="admin123"):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _db_row(app, sql, params=()):
    conn = db.connect(app.state.db_path)
    try:
        return conn.execute(sql, params).fetchone()
    finally:
        conn.close()


def _model_names(client, headers):
    response = client.get("/api/models", headers=headers)
    assert response.status_code == 200, response.text
    return [item["name"] for item in response.json()["items"]]


# ---------------------------------------------------------------------------
# 模型渠道
# ---------------------------------------------------------------------------
def test_list_models(client, auth_headers):
    response = client.get("/api/models", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 4
    names = [item["name"] for item in items]
    assert names == ["GPT-4o", "Claude-3.5", "Qwen-Max", "DeepSeek-V3"]
    item = items[0]
    assert set(item) >= {
        "id",
        "name",
        "displayName",
        "provider",
        "upstreamBaseUrl",
        "hasUpstreamKey",
        "upstreamKeyMasked",
        "inputPrice",
        "outputPrice",
        "weight",
        "status",
        "description",
        "createdAt",
    }
    assert item["hasUpstreamKey"] is False
    assert "upstreamApiKey" not in response.text


def test_model_crud_and_key_masking(client, auth_headers, app):
    created = client.post(
        "/api/models",
        json={
            "name": "Mixtral",
            "displayName": "Mixtral 8x7B",
            "provider": "Mistral",
            "upstreamBaseUrl": "https://api.example.com/v1",
            "upstreamApiKey": "sk-upstream-secret-1234",
            "inputPrice": 0.001,
            "outputPrice": 0.002,
            "weight": 7,
            "description": "测试渠道",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    model = created.json()["model"]
    assert model["name"] == "Mixtral"
    assert model["hasUpstreamKey"] is True
    assert "****" in model["upstreamKeyMasked"]
    assert "sk-upstream-secret-1234" not in created.text

    model_id = model["id"]
    updated = client.put(
        f"/api/models/{model_id}",
        json={"weight": 9, "status": "disabled", "inputPrice": 0.003},
        headers=auth_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["model"]["weight"] == 9
    assert updated.json()["model"]["status"] == "disabled"

    # 编辑时 upstreamApiKey 传空串不会清空已配置密钥
    kept = client.put(
        f"/api/models/{model_id}",
        json={"upstreamApiKey": ""},
        headers=auth_headers,
    )
    assert kept.json()["model"]["hasUpstreamKey"] is True

    status = client.post(
        f"/api/models/{model_id}/status", json={"status": "enabled"}, headers=auth_headers
    )
    assert status.status_code == 200
    assert status.json()["model"]["status"] == "enabled"


def test_model_validation(client, auth_headers):
    duplicate = client.post(
        "/api/models",
        json={"name": "GPT-4o", "provider": "OpenAI"},
        headers=auth_headers,
    )
    assert duplicate.status_code == 409

    negative = client.post(
        "/api/models",
        json={"name": "Negative-Weight", "provider": "Test", "weight": -1},
        headers=auth_headers,
    )
    assert negative.status_code == 400

    empty_name = client.post(
        "/api/models", json={"name": "  ", "provider": "Test"}, headers=auth_headers
    )
    assert empty_name.status_code == 400
    assert client.put("/api/models/9999", json={}, headers=auth_headers).status_code == 404


def test_model_delete_keeps_history(client, auth_headers, app):
    assert "DeepSeek-V3" in _model_names(client, auth_headers)
    before = _db_row(
        app,
        "SELECT COUNT(*) AS c FROM usage_buckets WHERE model = 'DeepSeek-V3'",
    )["c"]
    assert before > 0

    response = client.delete("/api/models/4", headers=auth_headers)
    assert response.status_code == 204
    names = _model_names(client, auth_headers)
    assert len(names) == 3 and "DeepSeek-V3" not in names

    after = _db_row(
        app,
        "SELECT COUNT(*) AS c FROM usage_buckets WHERE model = 'DeepSeek-V3'",
    )["c"]
    assert after == before


def test_model_permissions(client, auth_headers):
    assert client.get("/api/models").status_code == 401
    developer_headers = _login(client, "alice")  # developer: models.view 无 manage
    assert client.get("/api/models", headers=developer_headers).status_code == 200
    forbidden = client.post(
        "/api/models",
        json={"name": "Forbidden-Model", "provider": "Test"},
        headers=developer_headers,
    )
    assert forbidden.status_code == 403


# ---------------------------------------------------------------------------
# API Key
# ---------------------------------------------------------------------------
def _user_id(app, username):
    row = _db_row(app, "SELECT id FROM users WHERE username = ?", (username,))
    assert row is not None
    return row["id"]


def test_create_key_plaintext_only_once(client, auth_headers, app):
    user_id = _user_id(app, "user123")
    response = client.post(
        "/api/keys",
        json={
            "userId": user_id,
            "name": "CI Key",
            "rpmLimit": 10,
            "tpmLimit": 1000,
            "dailyQuota": 5000,
            "monthlyQuota": 50000,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    api_key = body["apiKey"]
    key = body["key"]
    assert api_key.startswith("sk-")
    assert key["keyPrefix"] == api_key[:11]
    assert key["rpmLimit"] == 10 and key["dailyQuota"] == 5000
    assert key["username"] == "user123"

    listed = client.get("/api/keys", headers=auth_headers)
    assert listed.status_code == 200
    assert api_key not in listed.text
    assert "apiKey" not in listed.text
    filtered = client.get(
        "/api/keys", params={"userId": user_id}, headers=auth_headers
    ).json()
    assert len(filtered["items"]) == 2  # 种子演示 Key + 新建 Key
    assert all(item["userId"] == user_id for item in filtered["items"])

    # 默认值回填：不传限额时使用设置默认值
    fallback = client.post(
        "/api/keys", json={"userId": user_id, "name": "Default Key"}, headers=auth_headers
    ).json()["key"]
    assert fallback["dailyQuota"] == 2_000_000
    assert fallback["monthlyQuota"] == 50_000_000
    assert fallback["rpmLimit"] == 30  # 继承 user123 的用户级策略


def test_key_detail_usage(client, auth_headers, app):
    key_id = _db_row(
        app, "SELECT id FROM api_keys WHERE user_id = 1 ORDER BY id LIMIT 1"
    )["id"]
    conn = db.connect(app.state.db_path)
    try:
        conn.execute(
            "INSERT OR REPLACE INTO token_usage(scope, target_id, period, tokens, requests) "
            "VALUES('key', ?, ?, 1234, 2)",
            (key_id, f"day:{day_key()}"),
        )
        conn.execute(
            "INSERT OR REPLACE INTO token_usage(scope, target_id, period, tokens, requests) "
            "VALUES('key', ?, ?, 2345, 3)",
            (key_id, f"month:{month_key()}"),
        )
        conn.commit()
    finally:
        conn.close()

    response = client.get(f"/api/keys/{key_id}", headers=auth_headers)
    assert response.status_code == 200
    usage = response.json()["usage"]
    assert set(usage) == {
        "dayUsed",
        "dayQuota",
        "monthUsed",
        "monthQuota",
        "dayRemaining",
        "monthRemaining",
    }
    assert usage["dayUsed"] == 1234
    assert usage["monthUsed"] == 2345
    assert usage["dayRemaining"] == usage["dayQuota"] - 1234
    assert usage["monthRemaining"] == usage["monthQuota"] - 2345
    assert usage["dayQuota"] == 5_000_000  # 种子 admin Key 的日配额
    assert client.get("/api/keys/9999", headers=auth_headers).status_code == 404


def test_key_revoke_and_rotate(client, auth_headers, app):
    user_id = _user_id(app, "alice")
    created = client.post(
        "/api/keys", json={"userId": user_id, "name": "Rotate Key"}, headers=auth_headers
    ).json()
    key_id = created["key"]["id"]
    old_plain = created["apiKey"]
    assert (
        _db_row(app, "SELECT key_hash FROM api_keys WHERE id = ?", (key_id,))["key_hash"]
        == security.hash_api_key(old_plain)
    )

    revoked = client.delete(f"/api/keys/{key_id}", headers=auth_headers)
    assert revoked.status_code == 204
    detail = client.get(f"/api/keys/{key_id}", headers=auth_headers).json()
    assert detail["key"]["status"] == "revoked"

    rotated = client.post(f"/api/keys/{key_id}/rotate", headers=auth_headers)
    assert rotated.status_code == 200, rotated.text
    new_plain = rotated.json()["apiKey"]
    assert new_plain.startswith("sk-")
    assert new_plain != old_plain
    assert rotated.json()["key"]["status"] == "active"
    stored = _db_row(app, "SELECT key_hash, key_prefix FROM api_keys WHERE id = ?", (key_id,))
    assert stored["key_hash"] == security.hash_api_key(new_plain)
    assert stored["key_hash"] != security.hash_api_key(old_plain)
    assert stored["key_prefix"] == new_plain[:11]


def test_create_key_validation(client, auth_headers):
    missing_user = client.post(
        "/api/keys", json={"userId": 99999, "name": "x"}, headers=auth_headers
    )
    assert missing_user.status_code == 404
    empty_name = client.post(
        "/api/keys", json={"userId": 1, "name": "  "}, headers=auth_headers
    )
    assert empty_name.status_code == 400
    negative = client.post(
        "/api/keys",
        json={"userId": 1, "name": "neg", "dailyQuota": -5},
        headers=auth_headers,
    )
    assert negative.status_code == 400


def test_key_permissions(client, auth_headers):
    assert client.get("/api/keys").status_code == 401
    viewer_headers = _login(client, "user123")  # viewer 没有 keys.view
    assert client.get("/api/keys", headers=viewer_headers).status_code == 403
    operator_headers = _login(client, "peter")  # operator: keys.view 无 keys.manage
    assert client.get("/api/keys", headers=operator_headers).status_code == 200
    forbidden = client.post(
        "/api/keys", json={"userId": 1, "name": "forbidden"}, headers=operator_headers
    )
    assert forbidden.status_code == 403
