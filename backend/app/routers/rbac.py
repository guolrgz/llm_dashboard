"""RBAC API：角色、权限目录、角色权限绑定与角色成员。

* ``GET  /roles``                      角色列表（含 permissions / userCount）
* ``GET  /permissions``                权限目录（items + 分组 groups）
* ``PUT  /roles/{id}/permissions``     事务替换角色权限绑定（rbac.manage）
* ``GET  /roles/{id}/users``           角色下用户
"""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Body, Depends

from .. import catalog
from ..deps import get_db, require_permission
from ..errors import ApiError

router = APIRouter(tags=["rbac"])


def _serialize_role(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    role_id = row["id"]
    is_super = bool(row["is_super"])
    if is_super:
        permissions = ["*", *catalog.ALL_PERMISSION_KEYS]
    else:
        permissions = [
            item["permission_key"]
            for item in conn.execute(
                "SELECT permission_key FROM role_permissions WHERE role_id = ? "
                "ORDER BY permission_key",
                (role_id,),
            )
        ]
    user_count = conn.execute(
        "SELECT COUNT(*) AS c FROM users WHERE role_id = ?", (role_id,)
    ).fetchone()["c"]
    return {
        "id": role_id,
        "key": row["key"],
        "name": row["name"],
        "description": row["description"],
        "isSuper": is_super,
        "permissions": permissions,
        "userCount": int(user_count),
    }


@router.get("/roles")
def list_roles(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("rbac.view")),
) -> dict:
    rows = conn.execute("SELECT * FROM roles ORDER BY id ASC").fetchall()
    return {"items": [_serialize_role(conn, row) for row in rows]}


@router.get("/permissions")
def list_permissions(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("rbac.view")),
) -> dict:
    rows = conn.execute("SELECT * FROM permissions ORDER BY id ASC").fetchall()
    items = [
        {
            "key": row["key"],
            "groupKey": row["group_key"],
            "groupLabel": row["group_label"],
            "name": row["name"],
            "description": row["description"],
        }
        for row in rows
    ]

    groups: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}
    for item in items:
        group = by_key.get(item["groupKey"])
        if group is None:
            group = {
                "key": item["groupKey"],
                "label": item["groupLabel"],
                "items": [],
            }
            by_key[item["groupKey"]] = group
            groups.append(group)
        group["items"].append(item)
    return {"items": items, "groups": groups}


@router.put("/roles/{role_id}/permissions")
def update_role_permissions(
    role_id: int,
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("rbac.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")
    role = conn.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
    if role is None:
        raise ApiError(404, "not_found", "角色不存在")
    if role["is_super"]:
        raise ApiError(409, "conflict", "超级管理员固定拥有全部权限，不可修改")

    raw = payload.get("permissions")
    if not isinstance(raw, list):
        raise ApiError(400, "validation_error", "permissions 必须是权限键数组")

    requested: list[str] = []
    for value in raw:
        if not isinstance(value, str):
            raise ApiError(400, "validation_error", "permissions 必须是权限键数组")
        key = value.strip()
        if key and key not in requested:
            requested.append(key)

    valid_keys = {
        row["key"] for row in conn.execute("SELECT key FROM permissions")
    }
    invalid = [key for key in requested if key != "*" and key not in valid_keys]
    if invalid:
        raise ApiError(
            400,
            "validation_error",
            f"无效的权限键：{', '.join(invalid)}",
            {"invalid": invalid},
        )

    keys = [key for key in requested if key != "*"]
    # 事务替换：删除旧绑定 -> 写入新绑定 -> 提交（失败由连接层回滚）。
    conn.execute("DELETE FROM role_permissions WHERE role_id = ?", (role_id,))
    for key in keys:
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions(role_id, permission_key) "
            "VALUES(?, ?)",
            (role_id, key),
        )
    conn.commit()
    return {"role": _serialize_role(conn, role)}


@router.get("/roles/{role_id}/users")
def list_role_users(
    role_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("rbac.view")),
) -> dict:
    role = conn.execute("SELECT id FROM roles WHERE id = ?", (role_id,)).fetchone()
    if role is None:
        raise ApiError(404, "not_found", "角色不存在")
    rows = conn.execute(
        "SELECT id, username, status FROM users WHERE role_id = ? ORDER BY id ASC",
        (role_id,),
    ).fetchall()
    items = [
        {"id": row["id"], "username": row["username"], "status": row["status"]}
        for row in rows
    ]
    return {"items": items, "total": len(items)}
