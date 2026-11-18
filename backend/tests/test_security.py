"""Unit tests for the security primitives (passwords, tokens, API keys)."""

from __future__ import annotations

import time

import pytest

from app import security
from app.errors import ApiError


def test_password_hash_roundtrip():
    stored = security.hash_password("admin123")
    assert stored.startswith("pbkdf2_sha256$")
    assert security.verify_password("admin123", stored) is True
    assert security.verify_password("wrong-password", stored) is False
    # same password hashed twice must produce different salts
    assert stored != security.hash_password("admin123")


def test_verify_password_rejects_garbage():
    assert security.verify_password("x", "") is False
    assert security.verify_password("x", "plaintext") is False


def test_token_roundtrip():
    created = security.create_token(7, "alice", "developer", ttl_hours=1)
    payload = security.decode_token(created["token"])
    assert payload["sub"] == "7"
    assert payload["username"] == "alice"
    assert payload["role"] == "developer"
    assert payload["jti"] == created["jti"]
    assert payload["exp"] > int(time.time())


def test_token_rejects_tampering():
    token = security.create_token(1, "admin", "super_admin")["token"]
    header, payload, signature = token.split(".")
    forged = f"{header}.{payload}.{'A' * len(signature)}"
    with pytest.raises(ApiError) as error:
        security.decode_token(forged)
    assert error.value.status_code == 401


def test_token_rejects_garbage():
    for value in ("", "abc", "a.b", "a.b.c"):
        with pytest.raises(ApiError):
            security.decode_token(value)


def test_expired_token():
    token = security.create_token(1, "admin", "super_admin", ttl_hours=1)["token"]
    # rewrite the payload with an exp in the past but keep a valid signature is
    # not possible without the secret; instead check the boundary in decode by
    # monkeypatching time is overkill — a negative ttl is clamped to 1 hour, so
    # we verify a token created with a past exp by signing it manually.
    import hashlib
    import hmac
    import json

    from app import config
    from app.security import _b64url_encode

    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url_encode(
        json.dumps({"sub": "1", "jti": "expired", "iat": 1, "exp": 2}).encode()
    )
    signing_input = f"{header}.{payload}"
    signature = _b64url_encode(
        hmac.new(
            config.jwt_secret().encode(), signing_input.encode(), hashlib.sha256
        ).digest()
    )
    with pytest.raises(ApiError) as error:
        security.decode_token(f"{signing_input}.{signature}")
    assert error.value.code == "token_expired"


def test_api_key_generation_and_hash():
    key = security.generate_api_key()
    assert key.startswith("sk-")
    assert security.api_key_prefix(key).startswith("sk-")
    stored = security.hash_api_key(key)
    assert security.key_matches(key, stored) is True
    assert security.key_matches(key + "x", stored) is False
    assert security.hash_api_key(key) == stored
