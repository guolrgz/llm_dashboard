"""Password hashing, JWT-style signed tokens and API key helpers.

Deliberately dependency-free (stdlib only) so the backend can boot on a box
without network access. The token format is a standard JWT (HS256).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from . import config
from .errors import ApiError

PBKDF2_ITERATIONS = 260_000


# --------------------------------------------------------------------------
# passwords
# --------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("ascii"),
            int(iterations),
        ).hex()
        return hmac.compare_digest(candidate, digest)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------
# JWT (HS256)
# --------------------------------------------------------------------------
def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(signing_input: str) -> str:
    signature = hmac.new(
        config.jwt_secret().encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256
    ).digest()
    return _b64url_encode(signature)


def create_token(user_id: int, username: str, role_key: str, ttl_hours: int | None = None) -> dict:
    now_ts = int(time.time())
    ttl = (ttl_hours or config.token_ttl_hours()) * 3600
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role_key,
        "jti": secrets.token_hex(12),
        "iat": now_ts,
        "exp": now_ts + ttl,
    }
    header = {"alg": "HS256", "typ": "JWT"}
    header_part = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_part}.{payload_part}"
    token = f"{signing_input}.{_sign(signing_input)}"
    return {"token": token, "expires_at": payload["exp"], "jti": payload["jti"]}


def decode_token(token: str) -> dict[str, Any]:
    try:
        header_part, payload_part, signature = token.split(".")
    except ValueError:
        raise ApiError(401, "invalid_token", "无效的访问令牌") from None
    signing_input = f"{header_part}.{payload_part}"
    if not hmac.compare_digest(_sign(signing_input), signature):
        raise ApiError(401, "invalid_token", "访问令牌签名校验失败")
    try:
        payload = json.loads(_b64url_decode(payload_part))
    except (ValueError, json.JSONDecodeError):
        raise ApiError(401, "invalid_token", "访问令牌内容损坏") from None
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ApiError(401, "token_expired", "访问令牌已过期，请重新登录")
    if not payload.get("sub") or not payload.get("jti"):
        raise ApiError(401, "invalid_token", "访问令牌缺少必要字段")
    return payload


# --------------------------------------------------------------------------
# API keys
# --------------------------------------------------------------------------
API_KEY_PREFIX = "sk-"


def generate_api_key() -> str:
    return API_KEY_PREFIX + secrets.token_urlsafe(32)


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def api_key_prefix(api_key: str) -> str:
    return api_key[: len(API_KEY_PREFIX) + 8]


def key_matches(api_key: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_api_key(api_key), stored_hash)
