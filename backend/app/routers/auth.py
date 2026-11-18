"""认证 API：登录、当前用户、退出登录。

令牌为 HS256 签名的 JWT（见 ``app.security``），退出登录把 ``jti`` 写入
``revoked_tokens``，旧令牌之后访问受保护接口返回 401。
"""

from __future__ import annotations

import sqlite3
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Request

from .. import security
from ..deps import get_current_user, get_db
from ..errors import ApiError
from ..utils import LOCAL_TZ, now_str
from .users import build_user

router = APIRouter(tags=["auth"])


def _format_epoch(epoch: int | float) -> str:
    return datetime.fromtimestamp(int(epoch), LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S")


@router.post("/auth/login")
def login(
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")

    username = str(payload.get("username") or "").strip()
    password = "" if payload.get("password") is None else str(payload.get("password"))
    if not username or not password:
        raise ApiError(400, "validation_error", "请输入用户名和密码")

    row = conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not security.verify_password(password, row["password_hash"]):
        raise ApiError(401, "unauthorized", "用户名或密码错误")
    if row["status"] != "enabled":
        raise ApiError(403, "user_disabled", "账号已被停用，请联系管理员")

    role = conn.execute(
        "SELECT key FROM roles WHERE id = ?", (row["role_id"],)
    ).fetchone()
    role_key = role["key"] if role is not None else "viewer"
    token_info = security.create_token(row["id"], row["username"], role_key)

    conn.execute(
        "UPDATE users SET last_login_at = ? WHERE id = ?", (now_str(), row["id"])
    )
    conn.commit()

    return {
        "token": token_info["token"],
        "tokenType": "Bearer",
        "expiresAt": _format_epoch(token_info["expires_at"]),
        "user": build_user(conn, row["id"]),
    }


@router.get("/auth/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    return {"user": user}


@router.post("/auth/logout")
def logout(
    request: Request,
    _user: dict = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    payload = getattr(request.state, "token_payload", None) or {}
    jti = payload.get("jti")
    expires_at = int(payload.get("exp", 0) or 0)
    if jti:
        conn.execute(
            "INSERT OR IGNORE INTO revoked_tokens(jti, revoked_at, expires_at) "
            "VALUES(?, ?, ?)",
            (jti, now_str(), _format_epoch(expires_at)),
        )
        # 顺带清理已过期的吊销记录，避免表无限增长。
        conn.execute(
            "DELETE FROM revoked_tokens WHERE expires_at < ?", (now_str(),)
        )
        conn.commit()
    return {"ok": True}
