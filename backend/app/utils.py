"""Time / formatting / pagination helpers shared by routers and services."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

# The product is used in China; aggregate periods are local calendar days.
LOCAL_TZ = timezone(timedelta(hours=8))


def now() -> datetime:
    return datetime.now(LOCAL_TZ)


def now_str() -> str:
    return now().strftime("%Y-%m-%d %H:%M:%S")


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def parse_iso(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=LOCAL_TZ)


def day_key(dt: datetime | None = None) -> str:
    return (dt or now()).strftime("%Y-%m-%d")


def month_key(dt: datetime | None = None) -> str:
    return (dt or now()).strftime("%Y-%m")


def day_start(dt: datetime | None = None) -> datetime:
    base = dt or now()
    return base.replace(hour=0, minute=0, second=0, microsecond=0)


def format_int(value: int | float) -> str:
    """128960 -> '128,960'."""
    return f"{int(value):,}"


def format_tokens(value: int | float) -> str:
    """1240000000 -> '1.24B'; 128960 -> '128.9K'."""
    value = float(value)
    if value >= 1_000_000_000:
        return f"{value / 1_000_000_000:.2f}B"
    if value >= 1_000_000:
        return f"{value / 1_000_000:.2f}M"
    if value >= 1_000:
        return f"{value / 1_000:.1f}K"
    return str(int(value))


def paginate(page: int, page_size: int) -> tuple[int, int]:
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 10)))
    return page, page_size
