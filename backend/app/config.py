"""Runtime configuration for the Token traffic backend.

Every value can be overridden with an environment variable so the test suite
and `start.sh` can point at isolated databases / ports.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = BACKEND_DIR / "data"


def data_dir() -> Path:
    return Path(os.environ.get("LLM_DASHBOARD_DATA_DIR", str(DEFAULT_DATA_DIR)))


def db_path() -> Path:
    return Path(os.environ.get("LLM_DASHBOARD_DB", str(data_dir() / "app.db")))


def jwt_secret() -> str:
    # Dev-only default. Production deployments must override this value.
    return os.environ.get(
        "LLM_DASHBOARD_JWT_SECRET", "llm-token-traffic-dev-secret-2026-please-override"
    )


def token_ttl_hours() -> int:
    try:
        return max(1, int(os.environ.get("LLM_DASHBOARD_TOKEN_TTL_HOURS", "8")))
    except ValueError:
        return 8


def app_version() -> str:
    return os.environ.get("LLM_DASHBOARD_VERSION", "1.0.0")


# ---- business defaults (also persisted in the `settings` table) ------------
DEFAULT_DAILY_QUOTA = 2_000_000
DEFAULT_MONTHLY_QUOTA = 50_000_000
DEFAULT_RPM = 60
DEFAULT_TPM = 120_000
ALERT_THRESHOLD = 0.8
