"""Idempotent seed data.

The prototype (index.png) is the product baseline, so the seeded baseline is
chosen to reproduce its dashboard numbers exactly:

* 今日 KPI: 128,960 requests / 1.24B tokens / 99.2% success rate
* trend: the 96-point curve shape taken from the design mock, scaled to a
  consistent daily total (the mock itself is internally inconsistent)
* model distribution: 40.2% / 32.6% / 18.1% / 9.1%
* 128 users, 5 roles, 4 model channels, 15 days uptime, 3 unread alerts
* recent requests: the four rows shown in the mock (same users/models/tokens)

Live gateway traffic is written to the same tables and adds on top of this
baseline, so the console becomes a real system while still starting from the
prototype's visual state.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta

from . import catalog, config, security
from .utils import day_start, now, now_str

SEED_VERSION = "2026-11-18.1"

# ---- design mock series (index.png chart, 95 quarter-hour samples) ---------
DESIGN_REQUESTS = [
    9900, 11900, 13900, 15900, 15900, 17200, 20000, 23000, 25100, 27700,
    29300, 31100, 33200, 34200, 35200, 34200, 35200, 36200, 36200, 36200,
    34200, 33200, 33200, 33200, 34200, 35200, 35200, 36200, 37200, 39200,
    41600, 43300, 44300, 45300, 47000, 49400, 52400, 54700, 57500, 59500,
    59500, 58500, 56500, 53400, 51400, 50400, 49400, 49400, 50400, 52400,
    54400, 57500, 59500, 60500, 60500, 59500, 58500, 58500, 58500, 59500,
    61500, 61500, 61500, 61500, 61500, 59500, 57500, 55400, 53400, 51200,
    50400, 50400, 50400, 51400, 53400, 56500, 59600, 62500, 66000, 71500,
    78230, 81000, 82200, 82700, 82800, 82800, 82600, 82200, 81500, 80500,
    79500, 78000, 76000, 74000, 71500,
]

# The mock's KPI sparklines (34 samples); kept for pixel-level fidelity of
# the three KPI cards on the default "今日" dashboard.
DESIGN_SPARKS = {
    "requests": [50, 49, 47, 43, 40, 38, 40, 42, 41, 39, 38, 40, 43, 44, 40, 33, 28, 25, 26, 28, 26, 19, 14, 15, 18, 21, 22, 21, 17, 13, 10, 5, 2, 4],
    "tokens": [54, 52, 47, 44, 43, 45, 47, 46, 44, 42, 45, 48, 49, 44, 37, 32, 28, 28, 31, 30, 24, 17, 16, 19, 23, 25, 24, 20, 15, 12, 7, 3, 3],
    "success": [47, 43, 39, 35, 34, 37, 40, 38, 35, 34, 37, 41, 41, 36, 29, 24, 19, 15, 14, 13, 12, 7, 7, 11, 15, 18, 15, 9, 5, 4, 2, 2, 4],
}

# ---- prototype constants ---------------------------------------------------
TODAY_REQUESTS = 128_960
TODAY_TOKENS = 1_240_000_000
TODAY_SUCCESS_RATE = 0.992
YESTERDAY_REQUESTS = 114_631        # 128960 / 1.125  -> +12.5%
YESTERDAY_TOKENS = 1_044_650_379    # 1.24B / 1.187   -> +18.7%
YESTERDAY_SUCCESS_RATE = 0.991      # +0.1 percentage points
MODEL_TOKEN_SHARES = [("GPT-4o", 0.402), ("Claude-3.5", 0.326), ("Qwen-Max", 0.181), ("DeepSeek-V3", 0.091)]

MODELS = [
    {
        "name": "GPT-4o",
        "display_name": "GPT-4o",
        "provider": "OpenAI",
        "upstream_base_url": "",
        "upstream_api_key": "",
        "input_price": 0.005,
        "output_price": 0.015,
        "weight": 40,
        "status": "enabled",
        "description": "OpenAI 旗舰多模态模型，默认模拟上游",
    },
    {
        "name": "Claude-3.5",
        "display_name": "Claude-3.5",
        "provider": "Anthropic",
        "upstream_base_url": "",
        "upstream_api_key": "",
        "input_price": 0.003,
        "output_price": 0.015,
        "weight": 33,
        "status": "enabled",
        "description": "长上下文推理模型，默认模拟上游",
    },
    {
        "name": "Qwen-Max",
        "display_name": "Qwen-Max",
        "provider": "Alibaba",
        "upstream_base_url": "",
        "upstream_api_key": "",
        "input_price": 0.0024,
        "output_price": 0.0096,
        "weight": 18,
        "status": "enabled",
        "description": "通义千问旗舰模型，默认模拟上游",
    },
    {
        "name": "DeepSeek-V3",
        "display_name": "DeepSeek-V3",
        "provider": "DeepSeek",
        "upstream_base_url": "",
        "upstream_api_key": "",
        "input_price": 0.001,
        "output_price": 0.002,
        "weight": 9,
        "status": "enabled",
        "description": "高性价比开源模型，原型中的“其他”份额",
    },
]

# First 48 users mirror src/users/data/users.js (design mock); 80 more are
# generated to reach the prototype's “用户总数 128”.
BASE_USERS = [
    ("admin", "10001", "超级管理员", "admin@example.com", "2024-03-12 10:00:00", 1),
    ("user123", "10002", "普通用户", "user123@example.com", "2025-05-22 14:30:15", 1),
    ("alice", "10003", "开发者", "alice@example.com", "2025-05-22 20:44:57", 1),
    ("bob", "10004", "普通用户", "bob@example.com", "2025-05-22 20:44:33", 0),
    ("carol", "10005", "开发者", "carol@example.com", "2025-05-23 09:12:04", 1),
    ("david", "10006", "普通用户", "david@example.com", "2025-05-23 10:08:41", 1),
    ("emma", "10007", "运维管理员", "emma@example.com", "2025-05-24 11:26:19", 0),
    ("frank", "10008", "普通用户", "frank@example.com", "2025-05-24 15:47:02", 1),
    ("grace", "10009", "开发者", "grace@example.com", "2025-05-25 08:33:55", 1),
    ("henry", "10010", "普通用户", "henry@example.com", "2025-05-25 13:21:36", 0),
    ("ivy", "10011", "普通用户", "ivy@example.com", "2025-05-26 09:05:18", 1),
    ("jack", "10012", "开发者", "jack@example.com", "2025-05-26 16:42:07", 1),
    ("kate", "10013", "普通用户", "kate@example.com", "2025-05-27 10:19:52", 0),
    ("leo", "10014", "超级管理员", "leo@example.com", "2025-05-27 18:30:44", 1),
    ("mia", "10015", "普通用户", "mia@example.com", "2025-05-28 08:56:12", 1),
    ("nick", "10016", "开发者", "nick@example.com", "2025-05-28 14:12:39", 0),
    ("olivia", "10017", "普通用户", "olivia@example.com", "2025-05-29 09:44:21", 1),
    ("peter", "10018", "运维管理员", "peter@example.com", "2025-05-29 17:03:58", 1),
    ("queen", "10019", "普通用户", "queen@example.com", "2025-05-30 11:37:46", 0),
    ("ryan", "10020", "开发者", "ryan@example.com", "2025-05-30 20:15:03", 1),
    ("sophia", "10021", "普通用户", "sophia@example.com", "2025-06-01 09:22:17", 1),
    ("tom", "10022", "开发者", "tom@example.com", "2025-06-01 13:48:50", 0),
    ("uma", "10023", "普通用户", "uma@example.com", "2025-06-02 10:06:29", 1),
    ("victor", "10024", "管理员", "victor@example.com", "2025-06-02 15:33:14", 1),
    ("wendy", "10025", "普通用户", "wendy@example.com", "2025-06-03 09:51:37", 0),
    ("xavier", "10026", "开发者", "xavier@example.com", "2025-06-03 18:24:05", 1),
    ("yuki", "10027", "普通用户", "yuki@example.com", "2025-06-04 08:40:53", 1),
    ("zoe", "10028", "开发者", "zoe@example.com", "2025-06-04 16:17:28", 0),
    ("nina", "10029", "普通用户", "nina@example.com", "2025-06-05 10:28:11", 1),
    ("oscar", "10030", "普通用户", "oscar@example.com", "2025-06-05 14:55:42", 1),
    ("paula", "10031", "开发者", "paula@example.com", "2025-06-06 09:13:59", 0),
    ("quinn", "10032", "普通用户", "quinn@example.com", "2025-06-06 17:38:26", 1),
    ("rosa", "10033", "普通用户", "rosa@example.com", "2025-06-07 11:02:48", 1),
    ("sam", "10034", "开发者", "sam@example.com", "2025-06-07 19:47:15", 0),
    ("tina", "10035", "普通用户", "tina@example.com", "2025-06-08 08:26:33", 1),
    ("ursula", "10036", "普通用户", "ursula@example.com", "2025-06-08 12:54:07", 1),
    ("vera", "10037", "开发者", "vera@example.com", "2025-06-09 10:39:51", 0),
    ("will", "10038", "普通用户", "will@example.com", "2025-06-09 15:16:24", 1),
    ("xena", "10039", "运维管理员", "xena@example.com", "2025-06-10 09:58:40", 1),
    ("yara", "10040", "普通用户", "yara@example.com", "2025-06-10 18:11:09", 0),
    ("zack", "10041", "普通用户", "zack@example.com", "2025-06-11 08:47:36", 1),
    ("amber", "10042", "开发者", "amber@example.com", "2025-06-11 14:23:02", 1),
    ("blake", "10043", "普通用户", "blake@example.com", "2025-06-12 10:15:55", 0),
    ("cody", "10044", "管理员", "cody@example.com", "2025-06-12 16:49:31", 1),
    ("dana", "10045", "普通用户", "dana@example.com", "2025-06-13 09:34:18", 1),
    ("ellis", "10046", "开发者", "ellis@example.com", "2025-06-13 13:07:44", 0),
    ("felix", "10047", "普通用户", "felix@example.com", "2025-06-14 11:41:27", 1),
    ("gina", "10048", "普通用户", "gina@example.com", "2025-06-14 19:22:53", 1),
]


# ---------------------------------------------------------------------------
# small deterministic helpers
# ---------------------------------------------------------------------------
def _largest_remainder(total: int, weights: list[float]) -> list[int]:
    """Split ``total`` into integer parts proportionally to ``weights``."""
    if total <= 0:
        return [0 for _ in weights]
    weight_sum = sum(weights) or 1.0
    raw = [total * w / weight_sum for w in weights]
    base = [int(x) for x in raw]
    remainder = total - sum(base)
    order = sorted(range(len(raw)), key=lambda i: raw[i] - base[i], reverse=True)
    for index in order[:remainder]:
        base[index] += 1
    return base


def _design_shape_96() -> list[int]:
    data = list(DESIGN_REQUESTS)
    if len(data) < 96:
        data = data + [data[-1]] * (96 - len(data))
    return data[:96]


def _design_hour_shape() -> list[float]:
    quarter = _design_shape_96()
    hourly = [sum(quarter[h * 4:(h + 1) * 4]) for h in range(24)]
    total = sum(hourly) or 1
    return [h / total for h in hourly]


def _today_quarter_requests() -> list[int]:
    shape = _design_shape_96()
    scaled = _largest_remainder(TODAY_REQUESTS, [float(v) for v in shape])
    return scaled


def _today_quarter_success(requests: list[int]) -> list[int]:
    target = round(TODAY_REQUESTS * TODAY_SUCCESS_RATE)
    success = [int(r * TODAY_SUCCESS_RATE) for r in requests]
    diff = target - sum(success)
    index = 0
    while diff != 0 and index < len(success):
        step = 1 if diff > 0 else -1
        success[index] += step
        diff -= step
        index = (index + 1) % len(success)
    return success


# ---------------------------------------------------------------------------
# main entry point
# ---------------------------------------------------------------------------
def ensure_seed(conn) -> None:
    row = conn.execute(
        "SELECT value FROM settings WHERE key = 'seed_version'"
    ).fetchone()
    if row is not None and row["value"] == SEED_VERSION:
        return

    _seed_catalog(conn)
    _seed_users(conn)
    _seed_models(conn)
    _seed_settings(conn)
    _seed_api_keys_and_quota(conn)
    _seed_usage(conn)
    _seed_request_logs(conn)
    _seed_alerts(conn)
    conn.execute(
        "INSERT INTO app_meta(key, value) VALUES('seed_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (SEED_VERSION,),
    )


# ---------------------------------------------------------------------------
# catalog
# ---------------------------------------------------------------------------
def _seed_catalog(conn) -> None:
    ts = now_str()
    for perm in catalog.PERMISSIONS:
        conn.execute(
            "INSERT OR IGNORE INTO permissions(key, group_key, group_label, name, description) "
            "VALUES(?, ?, ?, ?, ?)",
            (perm["key"], perm["group_key"], perm["group_label"], perm["name"], perm["description"]),
        )
    for role in catalog.ROLES:
        conn.execute(
            "INSERT OR IGNORE INTO roles(key, name, description, is_super, created_at) "
            "VALUES(?, ?, ?, ?, ?)",
            (role["key"], role["name"], role["description"], role["is_super"], ts),
        )
        role_id = conn.execute("SELECT id FROM roles WHERE key = ?", (role["key"],)).fetchone()["id"]
        for perm_key in role["permissions"]:
            if perm_key == "*":
                continue
            conn.execute(
                "INSERT OR IGNORE INTO role_permissions(role_id, permission_key) VALUES(?, ?)",
                (role_id, perm_key),
            )


# ---------------------------------------------------------------------------
# users
# ---------------------------------------------------------------------------
def _seed_users(conn) -> None:
    if conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"] > 0:
        return
    role_ids = {row["key"]: row["id"] for row in conn.execute("SELECT id, key FROM roles")}
    ts = now_str()
    password_hash = security.hash_password("admin123")  # demo password for every seeded account
    rows: list[tuple] = []

    def add(username, user_no, role_cn, email, created_at, enabled):
        role_key = catalog.ROLE_ALIASES.get(role_cn, "viewer")
        rows.append(
            (
                username,
                user_no,
                username,
                email,
                password_hash,
                role_ids[role_key],
                "enabled" if enabled else "disabled",
                created_at,
            )
        )

    for username, user_no, role_cn, email, created_at, enabled in BASE_USERS:
        add(username, user_no, role_cn, email, created_at, enabled)

    rng = random.Random(20260522)
    roles_cycle = ["普通用户", "开发者", "普通用户", "运维管理员", "普通用户", "管理员"]
    first_names = [
        "luna", "milo", "nova", "owen", "pia", "quill", "reed", "sara", "ted", "uma",
        "vale", "wade", "xena", "york", "zane", "abel", "bella", "cole", "dora", "eden",
        "faye", "gabe", "hope", "iris", "jade", "kole", "lane", "mira", "noel", "opal",
        "page", "quin", "rose", "sage", "troy", "ulys", "vera", "wren", "yale", "zora",
    ]
    for index in range(48, 128):
        user_no = f"{10001 + index}"
        username = f"member{index + 1:03d}"
        role_cn = roles_cycle[index % len(roles_cycle)]
        created = now() - timedelta(days=rng.randint(5, 300), hours=rng.randint(0, 23))
        add(
            username,
            user_no,
            role_cn,
            f"{username}@example.com",
            created.strftime("%Y-%m-%d %H:%M:%S"),
            1 if rng.random() < 0.85 else 0,
        )

    conn.executemany(
        "INSERT OR IGNORE INTO users"
        "(username, user_no, nickname, email, password_hash, role_id, status, created_at) "
        "VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )


# ---------------------------------------------------------------------------
# models
# ---------------------------------------------------------------------------
def _seed_models(conn) -> None:
    ts = now_str()
    for model in MODELS:
        conn.execute(
            "INSERT OR IGNORE INTO models"
            "(name, display_name, provider, upstream_base_url, upstream_api_key, "
            " input_price, output_price, weight, status, description, created_at) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                model["name"], model["display_name"], model["provider"],
                model["upstream_base_url"], model["upstream_api_key"],
                model["input_price"], model["output_price"], model["weight"],
                model["status"], model["description"], ts,
            ),
        )


# ---------------------------------------------------------------------------
# settings
# ---------------------------------------------------------------------------
def _seed_settings(conn) -> None:
    started = (now() - timedelta(days=15, hours=3)).strftime("%Y-%m-%d %H:%M:%S")
    values = {
        "site_name": "LLM推理 · Token 流量管理系统",
        "default_daily_quota": str(config.DEFAULT_DAILY_QUOTA),
        "default_monthly_quota": str(config.DEFAULT_MONTHLY_QUOTA),
        "default_rpm": str(config.DEFAULT_RPM),
        "default_tpm": str(config.DEFAULT_TPM),
        "alert_threshold": str(config.ALERT_THRESHOLD),
        "system_started_at": started,
        "spark_today": json.dumps(DESIGN_SPARKS, ensure_ascii=False),
        "seed_version": SEED_VERSION,
    }
    ts = now_str()
    for key, value in values.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES(?, ?, ?)",
            (key, value, ts),
        )


# ---------------------------------------------------------------------------
# keys + quota
# ---------------------------------------------------------------------------
def _seed_api_keys_and_quota(conn) -> None:
    if conn.execute("SELECT COUNT(*) AS c FROM api_keys").fetchone()["c"] > 0:
        return
    ts = now_str()
    users = {
        row["username"]: row["id"]
        for row in conn.execute("SELECT id, username FROM users")
    }
    demo_keys = [
        ("sk-demo-admin-2026", "admin", "演示 Key · admin", 120, 500_000, 5_000_000, 200_000_000),
        ("sk-demo-user123-2026", "user123", "演示 Key · user123", 30, 20_000, 2_000_000, 50_000_000),
    ]
    for plaintext, username, name, rpm, tpm, daily, monthly in demo_keys:
        conn.execute(
            "INSERT OR IGNORE INTO api_keys"
            "(user_id, name, key_hash, key_prefix, status, rpm_limit, tpm_limit, "
            " daily_quota, monthly_quota, created_at) "
            "VALUES(?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)",
            (
                users[username], name, security.hash_api_key(plaintext),
                security.api_key_prefix(plaintext), rpm, tpm, daily, monthly, ts,
            ),
        )
        conn.execute(
            "INSERT OR REPLACE INTO quota_policies"
            "(scope, target_id, daily_quota, monthly_quota, rpm_limit, tpm_limit, updated_at) "
            "VALUES('user', ?, ?, ?, ?, ?, ?)",
            (users[username], daily, monthly, rpm, tpm, ts),
        )


# ---------------------------------------------------------------------------
# usage buckets (60 days: today + 59 previous)
# ---------------------------------------------------------------------------
def _allocate_models(conn, bucket_start: str, requests: int, success: int,
                     token_totals: dict[str, int], prompt_ratio: float) -> None:
    shares = [share for _, share in MODEL_TOKEN_SHARES]
    model_requests = _largest_remainder(requests, shares)
    model_success = _largest_remainder(success, [float(r) for r in model_requests])
    for (model_name, _share), req, ok in zip(MODEL_TOKEN_SHARES, model_requests, model_success):
        token_total = token_totals.get(model_name, 0)
        prompt = int(round(token_total * prompt_ratio))
        conn.execute(
            "INSERT INTO usage_buckets"
            "(bucket_start, model, requests, success_requests, prompt_tokens, "
            " completion_tokens, total_tokens) VALUES(?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(bucket_start, model) DO UPDATE SET "
            "requests = requests + excluded.requests, "
            "success_requests = success_requests + excluded.success_requests, "
            "prompt_tokens = prompt_tokens + excluded.prompt_tokens, "
            "completion_tokens = completion_tokens + excluded.completion_tokens, "
            "total_tokens = total_tokens + excluded.total_tokens",
            (bucket_start, model_name, req, ok, prompt, token_total - prompt, token_total),
        )


def _today_rows(conn) -> None:
    start = day_start()
    requests = _today_quarter_requests()
    success = _today_quarter_success(requests)
    model_names = [name for name, _ in MODEL_TOKEN_SHARES]
    shares = [s for _, s in MODEL_TOKEN_SHARES]
    # token totals per model, exact sum = 1.24B
    model_token_totals = dict(
        zip(model_names, _largest_remainder(TODAY_TOKENS, shares))
    )
    # token allocation per quarter-bucket, proportional to requests
    token_per_bucket = {
        name: _largest_remainder(total, [float(r) for r in requests])
        for name, total in model_token_totals.items()
    }
    for index, req in enumerate(requests):
        bucket = (start + timedelta(minutes=15 * index)).strftime("%Y-%m-%d %H:%M:%S")
        model_req = _largest_remainder(req, shares)
        model_ok = _largest_remainder(success[index], [float(r) for r in model_req])
        for model_name, r, ok in zip(model_names, model_req, model_ok):
            token_total = token_per_bucket[model_name][index]
            prompt = int(round(token_total * 0.7))
            conn.execute(
                "INSERT OR REPLACE INTO usage_buckets"
                "(bucket_start, model, requests, success_requests, prompt_tokens, "
                " completion_tokens, total_tokens) VALUES(?, ?, ?, ?, ?, ?, ?)",
                (bucket, model_name, r, ok, prompt, token_total - prompt, token_total),
            )


def _historical_rows(conn, days: int) -> None:
    rng = random.Random(20240522)
    hourly_shape = _design_hour_shape()
    today_start = day_start()
    for offset in range(1, days + 1):
        day = today_start - timedelta(days=offset)
        if offset == 1:
            day_requests = YESTERDAY_REQUESTS
            day_tokens = YESTERDAY_TOKENS
            success_rate = YESTERDAY_SUCCESS_RATE
        else:
            factor = 0.92 + rng.random() * 0.1
            weekday_factor = 0.97 if day.weekday() >= 5 else 1.0
            day_requests = int(TODAY_REQUESTS * factor * weekday_factor)
            day_tokens = int(day_requests * (8800 + rng.random() * 900))
            success_rate = 0.988 + rng.random() * 0.006
        hourly_requests = _largest_remainder(day_requests, hourly_shape)
        hourly_success = _largest_remainder(int(round(day_requests * success_rate)), [float(v) for v in hourly_requests])
        model_totals = dict(
            zip(
                [name for name, _ in MODEL_TOKEN_SHARES],
                _largest_remainder(day_tokens, [s for _, s in MODEL_TOKEN_SHARES]),
            )
        )
        token_per_hour: dict[str, list[int]] = {
            name: _largest_remainder(total, [float(v) for v in hourly_requests])
            for name, total in model_totals.items()
        }
        for hour in range(24):
            bucket = (day + timedelta(hours=hour)).strftime("%Y-%m-%d %H:00:00")
            model_req = _largest_remainder(hourly_requests[hour], [s for _, s in MODEL_TOKEN_SHARES])
            model_ok = _largest_remainder(hourly_success[hour], [float(v) for v in model_req])
            for (model_name, _), req, ok in zip(MODEL_TOKEN_SHARES, model_req, model_ok):
                token_total = token_per_hour[model_name][hour]
                prompt = int(round(token_total * 0.7))
                conn.execute(
                    "INSERT OR REPLACE INTO usage_buckets"
                    "(bucket_start, model, requests, success_requests, prompt_tokens, "
                    " completion_tokens, total_tokens) VALUES(?, ?, ?, ?, ?, ?, ?)",
                    (bucket, model_name, req, ok, prompt, token_total - prompt, token_total),
                )


def _seed_usage(conn) -> None:
    if conn.execute("SELECT COUNT(*) AS c FROM usage_buckets").fetchone()["c"] > 0:
        return
    _historical_rows(conn, 59)
    _today_rows(conn)
    # quota usage baseline for demo users
    ts = now_str()
    today_key = now().strftime("%Y-%m-%d")
    month_key = now().strftime("%Y-%m")
    usage = {"admin": 340_000, "user123": 1_850_000, "alice": 240_000, "bob": 0}
    for username, tokens in usage.items():
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if row is None:
            continue
        conn.execute(
            "INSERT OR REPLACE INTO token_usage(scope, target_id, period, tokens, requests) "
            "VALUES('user', ?, ?, ?, ?)",
            (row["id"], f"day:{today_key}", tokens, max(1, tokens // 900)),
        )
        conn.execute(
            "INSERT OR REPLACE INTO token_usage(scope, target_id, period, tokens, requests) "
            "VALUES('user', ?, ?, ?, ?)",
            (row["id"], f"month:{month_key}", tokens * 18, max(1, tokens // 50)),
        )
    conn.execute(
        "INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES(?, ?, ?)",
        ("seeded_usage_at", ts, ts),
    )


# ---------------------------------------------------------------------------
# request logs (recent sample + the four rows from the prototype table)
# ---------------------------------------------------------------------------
def _seed_request_logs(conn) -> None:
    if conn.execute("SELECT COUNT(*) AS c FROM request_logs").fetchone()["c"] > 0:
        return
    rng = random.Random(88)
    user_rows = conn.execute("SELECT id, username FROM users WHERE status = 'enabled'").fetchall()
    models = [model[0] for model in MODEL_TOKEN_SHARES]
    statuses = ["success"] * 92 + ["quota_exceeded", "rate_limited", "error"] * 3
    base = now()
    rows = []
    for index in range(140):
        user = user_rows[rng.randrange(len(user_rows))]
        model = models[rng.randrange(len(models))]
        prompt = rng.randint(120, 4200)
        completion = rng.randint(60, 1800)
        status = statuses[rng.randrange(len(statuses))]
        http_status = 200 if status == "success" else (429 if status in ("quota_exceeded", "rate_limited") else 502)
        ts = base - timedelta(seconds=rng.randint(3600, 20 * 3600))
        rows.append(
            (
                ts.strftime("%Y-%m-%d %H:%M:%S"), user["id"], user["username"],
                "sk-seed000", model, prompt, completion,
                prompt + completion if status == "success" else 0,
                status, http_status, rng.randint(80, 2200), "seed",
            )
        )
    # four rows shown in the prototype's “近期请求记录” table (newest)
    featured = [
        ("user123", "GPT-4o", 2048),
        ("alice", "Claude-3.5", 1024),
        ("bob", "Qwen-Max", 4096),
        ("admin", "GPT-4o", 768),
    ]
    users_by_name = {
        row["username"]: row
        for row in conn.execute("SELECT id, username FROM users")
    }
    for index, (username, model, tokens) in enumerate(featured):
        user = users_by_name.get(username)
        if user is None:
            continue
        ts = base - timedelta(minutes=index + 1)
        prompt = int(tokens * 0.7)
        rows.append(
            (
                ts.strftime("%Y-%m-%d %H:%M:%S"), user["id"], username,
                "sk-seed000", model, prompt, tokens - prompt, tokens,
                "success", 200, rng.randint(320, 980), "seed",
            )
        )
    conn.executemany(
        "INSERT INTO request_logs"
        "(ts, user_id, username, key_prefix, model, prompt_tokens, completion_tokens, "
        " total_tokens, status, http_status, latency_ms, source) "
        "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )


# ---------------------------------------------------------------------------
# alerts
# ---------------------------------------------------------------------------
def _seed_alerts(conn) -> None:
    if conn.execute("SELECT COUNT(*) AS c FROM alerts").fetchone()["c"] > 0:
        return
    rng = random.Random(7)
    base = now()
    user123 = conn.execute("SELECT id FROM users WHERE username = 'user123'").fetchone()
    alice = conn.execute("SELECT id FROM users WHERE username = 'alice'").fetchone()
    entries = [
        ("quota.warning", "warning", "Token 日配额使用率 92.5%",
         "用户 user123 今日已使用 1,850,000 / 2,000,000 Token，请关注配额余量。", user123["id"], 0),
        ("quota.warning", "warning", "月配额使用率 88.1%",
         "用户 alice 本月已使用 44,000,000 / 50,000,000 Token，接近月度配额上限。", alice["id"], 0),
        ("rate_limit", "info", "API Key 触发 RPM 限流",
         "Key sk-demo-user123-2026 在最近一分钟请求数超过 30 次，已触发限流保护。", user123["id"], 0),
        ("quota.warning", "warning", "Token 日配额使用率 91.0%",
         "用户 user123 昨日日配额使用率达到 91.0%，已自动生成告警。", user123["id"], 1),
        ("system", "info", "系统已连续运行 15 天",
         "Token 流量管理系统运行正常，网关累计处理请求稳定。", None, 1),
    ]
    for index, (type_, level, title, message, user_id, read) in enumerate(entries):
        created = base - timedelta(minutes=12 + index * 37 + rng.randint(0, 20))
        conn.execute(
            "INSERT INTO alerts(type, level, title, message, user_id, read, created_at) "
            "VALUES(?, ?, ?, ?, ?, ?, ?)",
            (type_, level, title, message, user_id, read, created.strftime("%Y-%m-%d %H:%M:%S")),
        )
