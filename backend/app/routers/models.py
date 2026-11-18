"""模型渠道 API：目录、CRUD 与启停。

上游密钥 ``upstreamApiKey`` 只写不读：列表/详情仅返回 ``hasUpstreamKey`` 与
``upstreamKeyMasked``。删除/停用只影响路由，历史请求日志与统计保留。
"""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Body, Depends, Response

from ..deps import get_db, require_permission
from ..errors import ApiError
from ..utils import now_str

router = APIRouter(tags=["models"])

VALID_STATUSES = ("enabled", "disabled")


# ---------------------------------------------------------------------------
# 辅助
# ---------------------------------------------------------------------------
def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 6:
        return "******"
    return f"{value[:3]}****{value[-4:]}"


def _serialize_model(row: sqlite3.Row) -> dict[str, Any]:
    upstream_key = row["upstream_api_key"] or ""
    return {
        "id": row["id"],
        "name": row["name"],
        "displayName": row["display_name"],
        "provider": row["provider"],
        "upstreamBaseUrl": row["upstream_base_url"],
        "hasUpstreamKey": bool(upstream_key),
        "upstreamKeyMasked": _mask_secret(upstream_key),
        "inputPrice": row["input_price"],
        "outputPrice": row["output_price"],
        "weight": row["weight"],
        "status": row["status"],
        "description": row["description"],
        "createdAt": row["created_at"],
    }


def _fetch_model(conn: sqlite3.Connection, model_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM models WHERE id = ?", (model_id,)).fetchone()
    if row is None:
        raise ApiError(404, "not_found", "模型不存在")
    return row


def _text(payload: dict, key: str, default: str = "") -> str:
    value = payload.get(key, default)
    if value is None:
        return default
    return str(value).strip()


def _number(
    payload: dict, key: str, *, default: float | None, integer: bool = False
) -> float | int | None:
    if key not in payload or payload[key] is None or payload[key] == "":
        return default
    try:
        value = float(payload[key])
    except (TypeError, ValueError):
        raise ApiError(400, "validation_error", f"{key} 必须是数字") from None
    if value < 0:
        raise ApiError(400, "validation_error", f"{key} 不能为负数")
    return int(value) if integer else value


def _status(payload: dict, *, default: str | None) -> str | None:
    if "status" not in payload or payload["status"] in (None, ""):
        return default
    status = str(payload["status"]).strip()
    if status not in VALID_STATUSES:
        raise ApiError(400, "validation_error", "status 只能是 enabled 或 disabled")
    return status


def _ensure_name_unique(
    conn: sqlite3.Connection, name: str, exclude_id: int | None = None
) -> None:
    row = conn.execute(
        "SELECT id FROM models WHERE name = ?", (name,)
    ).fetchone()
    if row is not None and row["id"] != exclude_id:
        raise ApiError(409, "conflict", "模型名称已存在")


# ---------------------------------------------------------------------------
# 端点
# ---------------------------------------------------------------------------
@router.get("/models")
def list_models(
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("models.view")),
) -> dict:
    rows = conn.execute("SELECT * FROM models ORDER BY id ASC").fetchall()
    return {"items": [_serialize_model(row) for row in rows]}


@router.post("/models", status_code=201)
def create_model(
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("models.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")
    name = _text(payload, "name")
    if not name:
        raise ApiError(400, "validation_error", "模型名称不能为空")
    _ensure_name_unique(conn, name)

    display_name = _text(payload, "displayName") or name
    provider = _text(payload, "provider")
    upstream_base_url = _text(payload, "upstreamBaseUrl")
    upstream_api_key = _text(payload, "upstreamApiKey")
    input_price = _number(payload, "inputPrice", default=0.0) or 0.0
    output_price = _number(payload, "outputPrice", default=0.0) or 0.0
    weight = _number(payload, "weight", default=10, integer=True)
    status = _status(payload, default="enabled") or "enabled"
    description = _text(payload, "description")

    cursor = conn.execute(
        """
        INSERT INTO models
        (name, display_name, provider, upstream_base_url, upstream_api_key,
         input_price, output_price, weight, status, description, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            name,
            display_name,
            provider,
            upstream_base_url,
            upstream_api_key,
            float(input_price),
            float(output_price),
            int(weight),
            status,
            description,
            now_str(),
        ),
    )
    conn.commit()
    return {"model": _serialize_model(_fetch_model(conn, int(cursor.lastrowid)))}


@router.put("/models/{model_id}")
def update_model(
    model_id: int,
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("models.manage")),
) -> dict:
    if not isinstance(payload, dict):
        raise ApiError(400, "validation_error", "请求体格式错误")
    _fetch_model(conn, model_id)

    updates: dict[str, Any] = {}
    if "name" in payload:
        name = _text(payload, "name")
        if not name:
            raise ApiError(400, "validation_error", "模型名称不能为空")
        _ensure_name_unique(conn, name, exclude_id=model_id)
        updates["name"] = name
    if "displayName" in payload:
        updates["display_name"] = _text(payload, "displayName")
    if "provider" in payload:
        updates["provider"] = _text(payload, "provider")
    if "upstreamBaseUrl" in payload:
        updates["upstream_base_url"] = _text(payload, "upstreamBaseUrl")
    if "upstreamApiKey" in payload:
        # 只写不读：空串表示“保持原密钥不变”，避免前端无法回显时误清空。
        new_key = _text(payload, "upstreamApiKey")
        if new_key:
            updates["upstream_api_key"] = new_key
    if "inputPrice" in payload:
        updates["input_price"] = float(
            _number(payload, "inputPrice", default=None) or 0.0
        )
    if "outputPrice" in payload:
        updates["output_price"] = float(
            _number(payload, "outputPrice", default=None) or 0.0
        )
    if "weight" in payload:
        updates["weight"] = int(_number(payload, "weight", default=None, integer=True) or 0)
    if "status" in payload:
        status = _status(payload, default=None)
        if status is not None:
            updates["status"] = status
    if "description" in payload:
        updates["description"] = _text(payload, "description")

    if updates:
        assignments = ", ".join(f"{column} = ?" for column in updates)
        conn.execute(
            f"UPDATE models SET {assignments} WHERE id = ?",
            [*updates.values(), model_id],
        )
        conn.commit()
    return {"model": _serialize_model(_fetch_model(conn, model_id))}


@router.delete("/models/{model_id}", status_code=204)
def delete_model(
    model_id: int,
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("models.manage")),
) -> Response:
    _fetch_model(conn, model_id)
    # usage_buckets / request_logs 以模型名称留存历史，删除渠道不影响历史统计。
    conn.execute("DELETE FROM models WHERE id = ?", (model_id,))
    conn.commit()
    return Response(status_code=204)


@router.post("/models/{model_id}/status")
def update_model_status(
    model_id: int,
    payload: dict = Body(...),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("models.manage")),
) -> dict:
    _fetch_model(conn, model_id)
    status = _status(payload, default=None)
    if status is None:
        raise ApiError(400, "validation_error", "status 不能为空")
    conn.execute("UPDATE models SET status = ? WHERE id = ?", (status, model_id))
    conn.commit()
    return {"model": _serialize_model(_fetch_model(conn, model_id))}
