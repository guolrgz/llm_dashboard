---
title: 安全原语（密码 / JWT / API Key）
source_files:
  - backend/app/security.py
  - backend/app/config.py
  - backend/app/routers/auth.py
  - backend/app/routers/keys.py
  - backend/app/routers/traffic.py
  - backend/app/seed.py
updated: 2026-11-18
tags: [entity, backend, security]
---

> 所属模块：[[modules/backend]]

# 安全原语（密码 / JWT / API Key）

`security.py` 是系统唯一的安全原语库，且刻意只依赖标准库：PBKDF2 密码哈希、手写 HS256 JWT、
API Key 的生成/哈希/前缀/常量时间比较。它不读写数据库，也不做授权判断——只提供"证明你是谁"
所需的密码学零件。

## 用途与职责

- **密码**：`hash_password` 生成 `pbkdf2_sha256$260000$<salt>$<digest>` 格式的自描述哈希，
  `verify_password` 按存储里的迭代次数重算并用 `hmac.compare_digest` 比较。
- **会话令牌**：`create_token` 产出标准三段式 JWT（HS256），payload 含
  `sub`（用户 id 字符串）、`username`、`role`、`jti`、`iat`、`exp`；`decode_token` 校验签名、
  过期与必要字段，失败统一抛 401 `ApiError`。
- **API Key**：`sk-` + `secrets.token_urlsafe(32)` 生成明文；库中只存 SHA-256 与
  `sk-` + 8 字符前缀；`key_matches` 用常量时间比较。

## 关键函数与签名

| 名称 | 签名 | 说明 |
|---|---|---|
| `PBKDF2_ITERATIONS` | `260_000` | 迭代次数，写入哈希串，验证时以存储值为准 |
| `hash_password` | `(password: str) -> str` | 16 字节 hex 盐，PBKDF2-HMAC-SHA256 |
| `verify_password` | `(password: str, stored: str) -> bool` | 解析失败/算法不符返回 `False`，不抛错 |
| `create_token` | `(user_id: int, username: str, role_key: str, ttl_hours: int \| None = None) -> dict` | 返回 `{token, expires_at, jti}` |
| `decode_token` | `(token: str) -> dict[str, Any]` | 校验签名/过期/`sub`+`jti`；抛 `ApiError(401, ...)` |
| `generate_api_key` | `() -> str` | 明文只出现一次 |
| `hash_api_key` | `(api_key: str) -> str` | 无盐 SHA-256，便于按哈希查库 |
| `api_key_prefix` | `(api_key: str) -> str` | `sk-` + 8 字符，共 11 字符，用于展示/限流维度 |
| `key_matches` | `(api_key: str, stored_hash: str) -> bool` | `hmac.compare_digest` |

私有助手 `_b64url_encode/_b64url_decode/_sign` 实现 JWT 的 base64url 与 HMAC 签名；
`_sign` 每次调用都从 `config.jwt_secret()` 取密钥，因此换密钥会让所有旧签名失效。

## 调用链与调用方

- **登录**：`routers/auth.login` → `verify_password` → `create_token` → 返回
  `token/tokenType/expiresAt/user`。
- **鉴权**：`deps.get_current_user` → `decode_token` → 查 `revoked_tokens` → `_build_user`。
- **退出**：`routers/auth.logout` 把 payload 的 `jti` 写入黑名单。
- **API Key 签发/轮换**：`routers/keys` 调 `generate_api_key` + `hash_api_key` + `api_key_prefix`。
- **网关鉴权**：`routers/traffic.chat_completions` 先按 `hash_api_key` 查 `api_keys`，再
  `key_matches` 复核，并检查 `status == "active"`。
- **种子**：`seed.py` 为全部演示用户生成同一个 `admin123` 哈希，并把两个演示明文 Key 的哈希写库。

## 数据与副作用

- 本模块不直接写表；副作用体现在调用方：`users.last_login_at`、`revoked_tokens` 行、
  `api_keys.key_hash/key_prefix`。
- 令牌本身无状态，唯一服务端状态是 `revoked_tokens`（按 `jti`，不是按用户）。
- `decode_token` 不校验 `alg` 头、`nbf`、`aud`、`iss`，也不校验 `role` 声明与数据库当前角色
  是否一致——授权一律由 `deps` 回查数据库。

## 边界与错误处理

| 场景 | 结果 |
|---|---|
| token 不是三段 | `ApiError(401, "invalid_token", "无效的访问令牌")` |
| 签名不匹配 | `ApiError(401, "invalid_token", "访问令牌签名校验失败")` |
| payload 非法 JSON | `ApiError(401, "invalid_token", "访问令牌内容损坏")` |
| `exp` 已过 | `ApiError(401, "token_expired", "访问令牌已过期，请重新登录")` |
| 缺 `sub`/`jti` | `ApiError(401, "invalid_token", ...)` |
| 密码哈希格式坏 | `verify_password` 返回 `False`（由调用方转 401） |

## 坑与注意点

- **手写 JWT 不是通用实现**：只支持 HS256、不检查 header 的 `alg`。因为签名用固定密钥重算，
  算法混淆攻击不成立，但不要拿它当通用 JWT 库使用；也没有 `kid` 轮换机制。
- **默认密钥硬编码**：`config.jwt_secret()` 的 dev 默认值写在源码，生产未覆盖时任何知道仓库的
  人都能签发合法令牌。这是 [[concepts/security-posture]] 的首要风险。
- **API Key 无盐哈希**：目的是支持"按哈希等值查库"；Key 有 256 位随机熵，彩虹表不现实，
  但这也意味着库泄露即"可直接用于网关的等价凭证"（无法像密码那样慢哈希）。
- **明文只出现一次**：`POST /api/keys` 与 `/rotate` 的响应含 `apiKey`，列表/详情只返回
  `keyPrefix`。轮换会重置 `status='active'` 并清 `revoked_at`；旧的明文立即失效。
- **演示 Key 是公开秘密**：`sk-demo-admin-2026` 等明文写在 `seed.py`，且拥有高配额；任何能
  访问 8000 端口的人都能直接调用网关，演示环境应避免暴露到公网。
- **登录无防爆破**：`/api/auth/login` 没有失败次数限制、延迟或验证码；PBKDF2 260k 次迭代只能
  减慢离线爆破，不能阻止在线撞库。
- **登出需要有效令牌**：`logout` 依赖 `get_current_user`，令牌已过期时无法登出（也无必要），
  但这也意味着不能"用过期令牌补写黑名单"。

## 相关页面

[[modules/backend]] · [[entities/backend-auth-router]] · [[entities/backend-deps-authz]] ·
[[entities/backend-app-factory]] · [[concepts/security-posture]] · [[concepts/auth-rbac]] ·
[[flows/login-session]] · [[flows/gateway-request]]
