"""用户管理测试：列表/筛选/统计、CRUD、启停、批量与权限边界。"""

from __future__ import annotations

from app import db


def _login(client, username, password="admin123"):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _find_user(client, headers, username):
    response = client.get(
        "/api/users",
        params={"keyword": username, "pageSize": 100},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    for item in response.json()["items"]:
        if item["username"] == username:
            return item
    return None


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


def _create_user(client, headers, username, **extra):
    payload = {
        "username": username,
        "password": "pass123456",
        "email": f"{username}@example.com",
        "roleId": 5,
        **extra,
    }
    response = client.post("/api/users", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["user"]


def test_list_users_pagination(client, auth_headers):
    response = client.get(
        "/api/users", params={"page": 1, "pageSize": 10}, headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 128
    assert body["page"] == 1 and body["pageSize"] == 10
    assert len(body["items"]) == 10
    assert body["items"][0]["username"] == "admin"
    item = body["items"][0]
    assert set(item) >= {
        "id",
        "username",
        "userNo",
        "nickname",
        "email",
        "role",
        "roleName",
        "roleId",
        "status",
        "createdAt",
        "lastLoginAt",
        "keyCount",
    }
    assert "password" not in response.text and "password_hash" not in response.text

    page2 = client.get(
        "/api/users", params={"page": 2, "pageSize": 10}, headers=auth_headers
    ).json()
    assert page2["items"][0]["id"] != body["items"][0]["id"]

    # pageSize 超过上限被夹到 100
    clamped = client.get(
        "/api/users", params={"pageSize": 500}, headers=auth_headers
    ).json()
    assert clamped["pageSize"] == 100
    assert len(clamped["items"]) == 100


def test_list_users_filters(client, auth_headers):
    by_keyword = client.get(
        "/api/users", params={"keyword": "alice"}, headers=auth_headers
    ).json()
    assert by_keyword["total"] == 1
    assert by_keyword["items"][0]["username"] == "alice"

    by_user_no = client.get(
        "/api/users", params={"keyword": "10001"}, headers=auth_headers
    ).json()
    assert [item["username"] for item in by_user_no["items"]] == ["admin"]

    disabled = client.get(
        "/api/users", params={"status": "disabled", "pageSize": 100}, headers=auth_headers
    ).json()
    assert disabled["total"] > 0
    assert all(item["status"] == "disabled" for item in disabled["items"])
    assert disabled["total"] < 128

    by_role = client.get(
        "/api/users", params={"role": "developer", "pageSize": 100}, headers=auth_headers
    ).json()
    assert by_role["total"] > 0
    assert all(item["role"] == "developer" for item in by_role["items"])

    by_role_name = client.get(
        "/api/users", params={"role": "开发者", "pageSize": 100}, headers=auth_headers
    ).json()
    assert by_role_name["total"] == by_role["total"]

    empty = client.get(
        "/api/users", params={"keyword": "no-such-user-xyz"}, headers=auth_headers
    ).json()
    assert empty["total"] == 0 and empty["items"] == []


def test_user_stats(client, auth_headers):
    response = client.get("/api/users/stats", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 128
    assert body["enabled"] + body["disabled"] == 128
    assert len(body["byRole"]) == 5
    assert sum(item["count"] for item in body["byRole"]) == 128
    assert {item["role"] for item in body["byRole"]} == {
        "super_admin",
        "admin",
        "operator",
        "developer",
        "viewer",
    }


def test_create_user_and_duplicates(client, auth_headers):
    created = _create_user(client, auth_headers, "test_crud_user")
    assert created["username"] == "test_crud_user"
    assert created["role"] == "viewer"
    assert created["status"] == "enabled"
    assert created["userNo"].isdigit()

    # 新密码哈希生效：可用新账号登录
    login = client.post(
        "/api/auth/login",
        json={"username": "test_crud_user", "password": "pass123456"},
    )
    assert login.status_code == 200

    duplicate_username = client.post(
        "/api/users",
        json={"username": "test_crud_user", "password": "pass123456"},
        headers=auth_headers,
    )
    assert duplicate_username.status_code == 409

    _create_user(client, auth_headers, "test_crud_user2", userNo="90001")
    duplicate_user_no = client.post(
        "/api/users",
        json={"username": "test_crud_user3", "password": "pass123456", "userNo": "90001"},
        headers=auth_headers,
    )
    assert duplicate_user_no.status_code == 409

    # 中文角色名解析
    as_name = _create_user(
        client, auth_headers, "test_role_name", roleId=None, role="开发者"
    )
    assert as_name["role"] == "developer"


def test_update_user_and_reset_password(client, auth_headers):
    created = _create_user(client, auth_headers, "test_update_user")
    response = client.put(
        f"/api/users/{created['id']}",
        json={"nickname": "改过的昵称", "email": "changed@example.com", "roleId": 4},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    user = response.json()["user"]
    assert user["nickname"] == "改过的昵称"
    assert user["email"] == "changed@example.com"
    assert user["role"] == "developer"

    reset = client.put(
        f"/api/users/{created['id']}",
        json={"password": "newpass9876"},
        headers=auth_headers,
    )
    assert reset.status_code == 200
    assert (
        client.post(
            "/api/auth/login",
            json={"username": "test_update_user", "password": "newpass9876"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"username": "test_update_user", "password": "pass123456"},
        ).status_code
        == 401
    )
    assert (
        client.put(
            f"/api/users/{created['id']}", json={"username": "admin"}, headers=auth_headers
        ).status_code
        == 409
    )
    assert (
        client.put(
            "/api/users/99999", json={"nickname": "x"}, headers=auth_headers
        ).status_code
        == 404
    )


def test_status_and_batch(client, auth_headers, app):
    bob_id = _user_id(app, "bob")
    # bob 种子为停用，启用后可登录
    enable = client.post(
        f"/api/users/{bob_id}/status", json={"status": "enabled"}, headers=auth_headers
    )
    assert enable.status_code == 200
    assert enable.json()["user"]["status"] == "enabled"
    assert (
        client.post(
            "/api/auth/login", json={"username": "bob", "password": "admin123"}
        ).status_code
        == 200
    )

    first = _create_user(client, auth_headers, "test_batch_1")
    second = _create_user(client, auth_headers, "test_batch_2")
    ids = [first["id"], second["id"]]

    disabled = client.post(
        "/api/users/batch",
        json={"ids": ids, "action": "disable"},
        headers=auth_headers,
    ).json()
    assert disabled == {"ok": True, "affected": 2}
    assert (
        client.get(f"/api/users?keyword=test_batch_1", headers=auth_headers)
        .json()["items"][0]["status"]
        == "disabled"
    )

    enabled = client.post(
        "/api/users/batch",
        json={"ids": ids, "action": "enable"},
        headers=auth_headers,
    ).json()
    assert enabled["affected"] == 2

    deleted = client.post(
        "/api/users/batch",
        json={"ids": ids, "action": "delete"},
        headers=auth_headers,
    ).json()
    assert deleted == {"ok": True, "affected": 2}
    assert (
        client.get(
            "/api/users", params={"keyword": "test_batch_1"}, headers=auth_headers
        ).json()["total"]
        == 0
    )
    invalid = client.post(
        "/api/users/batch",
        json={"ids": ids, "action": "explode"},
        headers=auth_headers,
    )
    assert invalid.status_code == 400


def test_delete_user_cascades_keys_and_usage(client, auth_headers, app):
    created = _create_user(client, auth_headers, "test_delete_user", roleId=4)
    uid = created["id"]
    key_response = client.post(
        "/api/keys", json={"userId": uid, "name": "to-be-deleted"}, headers=auth_headers
    )
    assert key_response.status_code == 201
    key_id = key_response.json()["key"]["id"]

    conn = db.connect(app.state.db_path)
    try:
        conn.execute(
            "INSERT INTO token_usage(scope, target_id, period, tokens, requests) "
            "VALUES('user', ?, 'day:2026-11-18', 10, 1)",
            (uid,),
        )
        conn.execute(
            "INSERT INTO token_usage(scope, target_id, period, tokens, requests) "
            "VALUES('key', ?, 'day:2026-11-18', 10, 1)",
            (key_id,),
        )
        conn.commit()
    finally:
        conn.close()

    response = client.delete(f"/api/users/{uid}", headers=auth_headers)
    assert response.status_code == 204
    assert _find_user(client, auth_headers, "test_delete_user") is None
    assert (
        client.post(
            "/api/auth/login",
            json={"username": "test_delete_user", "password": "pass123456"},
        ).status_code
        == 401
    )

    conn = db.connect(app.state.db_path)
    try:
        assert (
            conn.execute(
                "SELECT COUNT(*) AS c FROM api_keys WHERE user_id = ?", (uid,)
            ).fetchone()["c"]
            == 0
        )
        assert (
            conn.execute(
                "SELECT COUNT(*) AS c FROM token_usage WHERE scope = 'user' AND target_id = ?",
                (uid,),
            ).fetchone()["c"]
            == 0
        )
        assert (
            conn.execute(
                "SELECT COUNT(*) AS c FROM token_usage WHERE scope = 'key' AND target_id = ?",
                (key_id,),
            ).fetchone()["c"]
            == 0
        )
    finally:
        conn.close()


def test_delete_self_and_last_super_admin_guards(client, auth_headers, app):
    admin_id = _user_id(app, "admin")
    assert (
        client.delete(f"/api/users/{admin_id}", headers=auth_headers).status_code == 409
    )

    # victor 是“管理员”角色（有 users.manage，但不是超管）
    victor_id = _user_id(app, "victor")
    victor_headers = _login(client, "victor")
    leo_id = _user_id(app, "leo")
    assert client.delete(f"/api/users/{leo_id}", headers=victor_headers).status_code == 204
    # 只剩下 admin 一个启用超管
    last = client.delete(f"/api/users/{admin_id}", headers=victor_headers)
    assert last.status_code == 409
    assert "超级管理员" in last.json()["error"]["message"]


def test_user_permissions(client, auth_headers):
    assert client.get("/api/users").status_code == 401

    viewer_headers = _login(client, "user123")  # viewer: users.view 无 users.manage
    assert client.get("/api/users", headers=viewer_headers).status_code == 200
    create = client.post(
        "/api/users",
        json={"username": "forbidden_user", "password": "pass123456"},
        headers=viewer_headers,
    )
    assert create.status_code == 403

    # alice 是 developer，连 users.view 都没有
    developer_headers = _login(client, "alice")
    assert client.get("/api/users", headers=developer_headers).status_code == 403
    assert client.get("/api/users/stats", headers=developer_headers).status_code == 403
