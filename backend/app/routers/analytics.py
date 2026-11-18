"""Dashboard 聚合接口：KPI / 趋势 / 模型分布 / 近期请求 / 系统概览 / 未读告警。

聚合主数据源是 ``usage_buckets``（种子基线 + 真实网关请求自然叠加），时间范围
支持 ``today``（96 个 15 分钟点）、``7d``（7 个日点）、``30d``（30 个日点）。
今日 KPI 在种子数据下精确复现原型：128,960 / 1.24B / 99.2%，环比 12.5%/18.7%/0.1pp。
"""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from .. import db, utils
from ..deps import get_db, require_permission
from ..errors import ApiError
from ..services import metering

router = APIRouter(tags=["analytics"])

RANGE_DAYS = {"today": 1, "7d": 7, "30d": 30}

MODEL_COLORS = {
    "GPT-4o": "#518af6",
    "Claude-3.5": "#97d486",
    "Qwen-Max": "#f1ad7c",
}
MODEL_KEYS = {"GPT-4o": "gpt", "Claude-3.5": "claude", "Qwen-Max": "qwen"}
FALLBACK_PALETTE = ["#518af6", "#97d486", "#f1ad7c"]
OTHER_COLOR = "#a6baf9"
TOTAL_X_LABELS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"]
STATUS_LABELS = {
    "success": "成功",
    "error": "失败",
    "rate_limited": "限流",
    "quota_exceeded": "配额超限",
    "unauthorized": "鉴权失败",
}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _validate_range(range_key: str | None) -> str:
    value = (range_key or "today").strip() or "today"
    if value not in RANGE_DAYS:
        raise ApiError(
            400,
            "validation_error",
            f"不支持的 range：{range_key}（可选 today/7d/30d）",
        )
    return value


def _period_bounds(range_key: str) -> tuple[datetime, datetime, datetime, datetime]:
    """返回 (本期开始, 本期结束(不含), 上期开始, 上期结束(不含))。"""
    today_start = utils.day_start()
    days = RANGE_DAYS[range_key]
    current_start = today_start - timedelta(days=days - 1)
    current_end = today_start + timedelta(days=1)
    previous_end = current_start
    previous_start = current_start - timedelta(days=days)
    return current_start, current_end, previous_start, previous_end


def _load_buckets(
    conn: sqlite3.Connection, start: datetime, end: datetime
) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT bucket_start, model, requests, success_requests, total_tokens "
        "FROM usage_buckets WHERE bucket_start >= ? AND bucket_start < ? "
        "ORDER BY bucket_start",
        (utils.iso(start), utils.iso(end)),
    ).fetchall()
    return [dict(row) for row in rows]


def _totals(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "requests": int(sum(row["requests"] for row in rows)),
        "success": int(sum(row["success_requests"] for row in rows)),
        "tokens": int(sum(row["total_tokens"] for row in rows)),
    }


def _rate(success: int, requests: int) -> float:
    return metering.success_rate(success, requests)


def _delta_percent(current: int | float, previous: int | float) -> float:
    if not previous:
        return 0.0
    return round((float(current) - float(previous)) / float(previous) * 100, 1)


def _kpi(
    *,
    kpi_id: str,
    label: str,
    value: int | float,
    display: str,
    delta: float,
    delta_unit: str,
    spark: list,
    tone: str,
    icon: str,
) -> dict[str, Any]:
    return {
        "id": kpi_id,
        "label": label,
        "value": value,
        "display": display,
        "delta": delta,
        "deltaUnit": delta_unit,
        "spark": spark,
        "tone": tone,
        "icon": icon,
    }


# ---------------------------------------------------------------------------
# trend
# ---------------------------------------------------------------------------
NICE_STEPS = (1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10)


def _nice_step(raw: float) -> int:
    """把原始步长向上取到 1/1.5/2/2.5/3/4/5/7.5/10 × 10^n。"""
    if raw <= 1:
        return 1
    magnitude = 10 ** math.floor(math.log10(raw))
    for factor in NICE_STEPS:
        step = factor * magnitude
        if step >= raw:
            return max(1, int(round(step)))
    return max(1, int(round(10 * magnitude)))


def _tick_label(value: float) -> str:
    value = float(value)
    if value >= 1_000_000:
        return f"{value / 1_000_000:g}M"
    if value >= 1_000:
        return f"{value / 1_000:g}k"
    return str(int(value))


def _ticks(max_value: float) -> tuple[list[int], dict[str, str]]:
    """生成约 5~6 个 nice y 轴刻度（升序、首项 0、末项 ≥ 数据最大值）。"""
    max_value = float(max_value)
    if max_value <= 0:
        return [0, 1], {"0": "0", "1": "1"}
    step = _nice_step(max_value / 5.0)
    top = int(math.ceil(max_value / step) * step)
    ticks = list(range(0, top + 1, step))
    while len(ticks) > 7:  # 兜底：刻度过多时放大步长
        step = _nice_step(step * 1.5)
        top = int(math.ceil(max_value / step) * step)
        ticks = list(range(0, top + 1, step))
    labels = {str(value): _tick_label(value) for value in ticks}
    return ticks, labels


def _today_trend(
    rows: list[dict[str, Any]], start: datetime
) -> tuple[list[int], list[int], list[int], list[str], list[int], dict[str, str]]:
    totals: dict[str, int] = {}
    successes: dict[str, int] = {}
    for row in rows:
        key = row["bucket_start"][:16]
        totals[key] = totals.get(key, 0) + int(row["requests"])
        successes[key] = successes.get(key, 0) + int(row["success_requests"])
    total_series: list[int] = []
    success_series: list[int] = []
    for index in range(96):
        slot = (start + timedelta(minutes=15 * index)).strftime("%Y-%m-%d %H:%M")
        total_series.append(int(totals.get(slot, 0)))
        success_series.append(int(successes.get(slot, 0)))
    y_ticks, y_labels = _ticks(max(total_series) if total_series else 0)
    return total_series, success_series, [], list(TOTAL_X_LABELS), y_ticks, y_labels


def _daily_series(
    conn: sqlite3.Connection, start: datetime, end: datetime
) -> list[dict[str, int | str]]:
    rows = _load_buckets(conn, start, end)
    by_day: dict[str, dict[str, int]] = {}
    for row in rows:
        day = row["bucket_start"][:10]
        bucket = by_day.setdefault(day, {"requests": 0, "success": 0, "tokens": 0})
        bucket["requests"] += int(row["requests"])
        bucket["success"] += int(row["success_requests"])
        bucket["tokens"] += int(row["total_tokens"])
    series: list[dict[str, int | str]] = []
    cursor = start
    while cursor < end:
        key = cursor.strftime("%Y-%m-%d")
        bucket = by_day.get(key, {"requests": 0, "success": 0, "tokens": 0})
        series.append({"date": key, **bucket})
        cursor += timedelta(days=1)
    return series


def _sampled_x_labels(series: list[dict], count: int = 6) -> list[str]:
    if not series:
        return []
    if len(series) <= 7:
        return [str(item["date"])[5:] for item in series]
    step = max(1, len(series) // count)
    labels = [
        str(series[index]["date"])[5:]
        for index in range(0, len(series), step)
    ][:count]
    return labels


# ---------------------------------------------------------------------------
# distribution
# ---------------------------------------------------------------------------
def _distribution(rows: list[dict[str, Any]]) -> dict[str, Any]:
    totals: dict[str, int] = {}
    for row in rows:
        model = row["model"] or "未知模型"
        totals[model] = totals.get(model, 0) + int(row["total_tokens"])
    total_tokens = int(sum(totals.values()))
    ranked = sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    top = [(name, tokens) for name, tokens in ranked[:3] if tokens > 0]
    top_names = {name for name, _ in top}
    other_tokens = int(sum(tokens for name, tokens in ranked if name not in top_names))
    entries: list[dict[str, Any]] = []
    raw_percents: list[float] = []
    for index, (name, tokens) in enumerate(top):
        raw_percents.append(round(tokens / total_tokens * 100, 1) if total_tokens else 0.0)
        entries.append(
            {
                "key": MODEL_KEYS.get(name) or name.lower().replace(" ", "-"),
                "name": name,
                "tokens": int(tokens),
                "percent": raw_percents[-1],
                "color": MODEL_COLORS.get(name) or FALLBACK_PALETTE[index % len(FALLBACK_PALETTE)],
            }
        )
    if other_tokens > 0 or len(ranked) > len(top):
        raw_percents.append(
            round(other_tokens / total_tokens * 100, 1) if total_tokens else 0.0
        )
        entries.append(
            {
                "key": "other",
                "name": "其他",
                "tokens": other_tokens,
                "percent": raw_percents[-1],
                "color": OTHER_COLOR,
            }
        )
    # 保证合计恰好 100.0：把舍入误差并入占比最大的分段
    if entries:
        difference = round(100.0 - sum(float(item["percent"]) for item in entries), 1)
        if difference:
            largest = max(range(len(entries)), key=lambda i: entries[i]["tokens"])
            entries[largest]["percent"] = round(
                float(entries[largest]["percent"]) + difference, 1
            )
    return {
        "total": total_tokens,
        "display": utils.format_tokens(total_tokens),
        "segments": entries,
    }


# ---------------------------------------------------------------------------
# recent requests / overview
# ---------------------------------------------------------------------------
def _recent_requests(conn: sqlite3.Connection, limit: int = 4) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM request_logs ORDER BY ts DESC, id DESC LIMIT ?", (limit,)
    ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        items.append(
            {
                "id": row["id"],
                "time": row["ts"],
                "user": row["username"],
                "model": row["model"],
                "tokens": int(row["total_tokens"]),
                "tokensDisplay": utils.format_int(row["total_tokens"]),
                "status": STATUS_LABELS.get(row["status"], row["status"]),
                "statusKey": row["status"],
            }
        )
    return items


def _overview(conn: sqlite3.Connection) -> dict[str, int]:
    users = int(conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"])
    roles = int(conn.execute("SELECT COUNT(*) AS c FROM roles").fetchone()["c"])
    models = int(
        conn.execute(
            "SELECT COUNT(*) AS c FROM models WHERE status = 'enabled'"
        ).fetchone()["c"]
    )
    uptime_days = 0
    started_at = db.get_setting(conn, "system_started_at")
    if started_at:
        try:
            started = utils.parse_iso(str(started_at))
            uptime_days = int((utils.now() - started).total_seconds() // 86400)
        except (ValueError, TypeError):
            uptime_days = 0
    return {
        "users": users,
        "roles": roles,
        "models": models,
        "uptimeDays": max(0, uptime_days),
    }


def _spark_from_settings(conn: sqlite3.Connection) -> dict[str, list] | None:
    raw = db.get_setting(conn, "spark_today")
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    sparks: dict[str, list] = {}
    for key in ("requests", "tokens", "success"):
        value = data.get(key)
        sparks[key] = list(value) if isinstance(value, list) else []
    return sparks


# ---------------------------------------------------------------------------
# endpoint
# ---------------------------------------------------------------------------
@router.get("/analytics/dashboard")
def dashboard(
    range: str | None = Query(default="today"),
    conn: sqlite3.Connection = Depends(get_db),
    _user: dict = Depends(require_permission("dashboard.view")),
):
    range_key = _validate_range(range)
    current_start, current_end, previous_start, previous_end = _period_bounds(range_key)

    current_rows = _load_buckets(conn, current_start, current_end)
    previous_rows = _load_buckets(conn, previous_start, previous_end)
    current = _totals(current_rows)
    previous = _totals(previous_rows)

    current_rate = _rate(current["success"], current["requests"])
    previous_rate = _rate(previous["success"], previous["requests"])
    requests_delta = _delta_percent(current["requests"], previous["requests"])
    tokens_delta = _delta_percent(current["tokens"], previous["tokens"])
    success_delta = round(current_rate - previous_rate, 1)

    if range_key == "today":
        total_series, success_series, _, x_labels, y_ticks, y_labels = _today_trend(
            current_rows, current_start
        )
        sparks = _spark_from_settings(conn) or {}
        spark_requests = sparks.get("requests") or total_series
        spark_tokens = sparks.get("tokens") or [row["total_tokens"] for row in current_rows]
        spark_success = sparks.get("success") or [
            _rate(row["success_requests"], row["requests"]) for row in current_rows
        ]
    else:
        series = _daily_series(conn, current_start, current_end)
        total_series = [int(item["requests"]) for item in series]
        success_series = [int(item["success"]) for item in series]
        x_labels = _sampled_x_labels(series)
        spark_requests = total_series
        spark_tokens = [int(item["tokens"]) for item in series]
        spark_success = [_rate(int(item["success"]), int(item["requests"])) for item in series]
        y_ticks, y_labels = _ticks(max(total_series) if total_series else 0)

    kpis = [
        _kpi(
            kpi_id="requests",
            label="总请求量",
            value=current["requests"],
            display=utils.format_int(current["requests"]),
            delta=requests_delta,
            delta_unit="%",
            spark=spark_requests,
            tone="blue",
            icon="chat",
        ),
        _kpi(
            kpi_id="tokens",
            label="Token 使用量",
            value=current["tokens"],
            display=utils.format_tokens(current["tokens"]),
            delta=tokens_delta,
            delta_unit="%",
            spark=spark_tokens,
            tone="green",
            icon="database",
        ),
        _kpi(
            kpi_id="success",
            label="成功率",
            value=current_rate,
            display=f"{current_rate:.1f}%",
            delta=success_delta,
            delta_unit="pp",
            spark=spark_success,
            tone="purple",
            icon="check",
        ),
    ]

    unread = int(
        conn.execute("SELECT COUNT(*) AS c FROM alerts WHERE read = 0").fetchone()["c"]
    )
    return {
        "range": range_key,
        "kpis": kpis,
        "trend": {
            "xLabels": x_labels,
            "total": total_series,
            "success": success_series,
            "yTicks": y_ticks,
            "yLabels": y_labels,
        },
        "distribution": _distribution(current_rows),
        "recentRequests": _recent_requests(conn),
        "overview": _overview(conn),
        "alerts": {"unread": unread},
    }
