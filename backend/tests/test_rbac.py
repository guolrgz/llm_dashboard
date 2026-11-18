"""RBAC 测试：角色/权限目录读取、权限绑定更新与生效、越权 403。"""

from __future__ import annotations

from app import catalog


def _role_by_key(items, key):
    return next(item for item in items if item["key"] == key)


def _token(client, username):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": "admin123"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_list_roles(client, auth_headers):
    response = client.get("/api/roles", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 5
    assert sum(item["userCount"] for item in items) == 128

    super_role = _role_by_key(items, "super_admin")
    assert super_role["isSuper"] is True
    assert "*" in super_role["permissions"]
    assert set(catalog.ALL_PERMISSION_KEYS) <= set(super_role["permissions"])

    developer = _role_by_key(items, "developer")
    assert developer["isSuper"] is False
    assert "keys.manage" in developer["permissions"]
    assert developer["userCount"] > 0
    assert set(developer) >= {
        "id",
        "key",
        "name",
        "description",
        "isSuper",
        "permissions",
        "userCount",
    }


def test_list_permissions(client, auth_headers):
    response = client.get("/api/permissions", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == len(catalog.ALL_PERMISSION_KEYS)
    assert len(body["groups"]) == 9

    users_group = next(group for group in body["groups"] if group["key"] == "users")
    assert users_group["label"] == "用户管理"
    keys = {item["key"] for item in users_group["items"]}
    assert keys == {"users.view", "users.manage"}
    for item in body["items"]:
        assert set(item) == {"key", "groupKey", "groupLabel", "name", "description"}


def test_update_role_permissions_takes_effect(client, auth_headers):
    roles = client.get("/api/roles", headers=auth_headers).json()["items"]
    developer = _role_by_key(roles, "developer")
    payload = {"permissions": ["dashboard.view", "users.view"]}
    response = client.put(
        f"/api/roles/{developer['id']}/permissions",
        json=payload,
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert sorted(response.json()["role"]["permissions"]) == sorted(payload["permissions"])

    # 重新读取一致
    roles_again = client.get("/api/roles", headers=auth_headers).json()["items"]
    assert sorted(_role_by_key(roles_again, "developer")["permissions"]) == sorted(
        payload["permissions"]
    )

    # 受影响用户（alice 属于 developer）的下一次请求立即按新权限判定
    alice_headers = _token(client, "alice")
    me = client.get("/api/auth/me", headers=alice_headers).json()["user"]
    assert sorted(me["permissions"]) == sorted(payload["permissions"])
    assert client.get("/api/users", headers=alice_headers).status_code == 200
    # 不再拥有 users.manage
    forbidden = client.post(
        "/api/users",
        json={"username": "rbac_test_user", "password": "pass123", "email": "x@x.com"},
        headers=alice_headers,
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "forbidden"


def test_update_role_permissions_invalid_key(client, auth_headers):
    roles = client.get("/api/roles", headers=auth_headers).json()["items"]
    viewer = _role_by_key(roles, "viewer")
    before = viewer["permissions"]
    response = client.put(
        f"/api/roles/{viewer['id']}/permissions",
        json={"permissions": ["dashbord.view"]},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    roles_again = client.get("/api/roles", headers=auth_headers).json()["items"]
    assert _role_by_key(roles_again, "viewer")["permissions"] == before


def test_update_role_permissions_requires_manage(client, auth_headers):
    roles = client.get("/api/roles", headers=auth_headers).json()["items"]
    viewer = _role_by_key(roles, "viewer")
    # user123 是 viewer，没有任何 rbac 权限
    viewer_headers = _token(client, "user123")
    assert client.get("/api/roles", headers=viewer_headers).status_code == 403
    response = client.put(
        f"/api/roles/{viewer['id']}/permissions",
        json={"permissions": ["dashboard.view"]},
        headers=viewer_headers,
    )
    assert response.status_code == 403


def test_role_not_found(client, auth_headers):
    assert (
        client.get("/api/roles/9999/users", headers=auth_headers).status_code == 404
    )
    assert (
        client.put(
            "/api/roles/9999/permissions",
            json={"permissions": []},
            headers=auth_headers,
        ).status_code
        == 404
    )


def test_role_users(client, auth_headers):
    roles = client.get("/api/roles", headers=auth_headers).json()["items"]
    developer = _role_by_key(roles, "developer")
    response = client.get(f"/api/roles/{developer['id']}/users", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == developer["userCount"]
    usernames = {item["username"] for item in body["items"]}
    assert "alice" in usernames
    for item in body["items"]:
        assert set(item) == {"id", "username", "status"}
