---
title: 认证路由（/api/auth）
source_files:
  - backend/app/routers/auth.py
  - backend/app/deps.py
  - backend/app/security.py
  - backend/app/routers/users.py
updated: 2026-11-18
tags: [entity, backend, auth]
---

> 所属模块：[[modules/backend]]

# 认证路由（`/api/auth`）

`routers/auth.py` 只做三件事：用用户名密码换令牌、返回当前登录用户、把当前令牌拉黑。
它不定义用户结构（复用 `users.build_user`），也不实现令牌算法（复用 `security`）。

## 端点与签名

| 方法 | 路径 | 函数 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/login` | `login(payload: dict = Body(...), conn = Depends(get_db))` | 无 |
| GET | `/api/auth/me` | `me(user: dict = Depends(get_current_user))` | Bearer JWT |
| POST | `/api/auth/logout` | `logout(request, _user = Depends(get_current_user), conn = Depends(get_db))` | Bearer JWT |

路由对象 `router = APIRouter(tags=["auth"])`，在 `main.create_app` 中以 `prefix="/api"` 挂载，
所以源码里的 `/auth/login` 对外的真实路径是 `/api/auth/login`。

## 登录流程

1. 读取 `username`（`strip()`）与 `password`（保留原样，不做 trim）；任一为空 → 400。
2. `SELECT * FROM users WHERE username = ?`，用 `security.verify_password` 校验；
   用户不存在或密码错都返回同一个 401 文案"用户名或密码错误"。
3. 校验 `status == "enabled"`，否则 403 `user_disabled`。
4. 查 `roles.key` 作为 `role_key`（角色行缺失时回退 `"viewer"`），调
   `security.create_token(row["id"], row["username"], role_key)`。
5. `UPDATE users SET last_login_at = now_str()` 并 `commit()`。
6. 返回 `{token, tokenType: "Bearer", expiresAt, user}`：
   - `expiresAt` 由 `_format_epoch` 把 epoch 转成 `UTC+8` 的 `YYYY-MM-DD HH:MM:SS`；
   - `user` 来自 `build_user(conn, row["id"])`，含实时 `permissions` 列表。

## 当前用户与登出

- `me` 直接返回依赖注入已组装好的 `{"user": user}`，没有额外查询。
- `logout` 从 `request.state.token_payload` 取 `jti` 与 `exp`（由 `get_current_user` 写入），
  `INSERT OR IGNORE` 进 `revoked_tokens`，随后删除 `expires_at < now_str()` 的过期记录，
  返回 `{"ok": True}`。没有 `jti` 时直接返回成功（防御性分支）。
- 黑名单是**按令牌**而非按用户：同一账号的其他设备/令牌仍然有效。

## 调用链与调用方

```
POST /api/auth/login
  └─ verify_password → SELECT roles → create_token → UPDATE last_login_at → build_user

GET /api/auth/me
  └─ get_current_user → decode_token → revoked_tokens → _build_user

POST /api/auth/logout
  └─ get_current_user（写入 request.state.token_payload）
       └─ INSERT revoked_tokens(jti) + DELETE 过期行
```

前端登录页调用 `/api/auth/login` 后把 token 存 `localStorage`，后续由 API client 统一加
`Authorization`；退出时调用 `/api/auth/logout` 并清理本地状态。参见 [[flows/login-session]]。

## 数据与副作用

- 写 `users.last_login_at`（每次成功登录）。
- 写 `revoked_tokens`（每次登出），并在同一次事务里清理过期行。
- 不写 `app_meta`/`alerts`；登录失败没有任何审计记录，只有网关请求会进 `request_logs`。
- 响应里不出现 `password_hash`——`build_user` 显式挑字段，不 `SELECT *` 回传。

## 边界与错误处理

| 场景 | HTTP / code |
|---|---|
| 请求体不是 JSON 对象 | 400 `validation_error` "请求体格式错误" |
| 用户名或密码为空 | 400 `validation_error` |
| 用户名不存在 / 密码错误 | 401 `unauthorized` |
| 账号停用 | 403 `user_disabled` |
| `/me`、`/logout` 无令牌/坏令牌 | 401（由 `deps`/`security` 抛出） |

`login` 的请求体用裸 `dict` 而不是 Pydantic 模型，因此 FastAPI 不会自动做 422 校验，
类型与空值判断都在函数体内手动完成。

## 坑与注意点

- **没有登录限流/锁定**：可以无限次尝试密码；PBKDF2 260k 迭代只增加单次成本，不阻止在线爆破。
- **登出依赖有效令牌**：`logout` 必须先通过 `get_current_user`；令牌过期或被拉黑后无法再"登出"，
  但此时它本来也已不可用。
- **角色回退 `viewer`**：如果 `users.role_id` 指向一个不存在的角色（外键未强制），登录仍成功，
  令牌里 `role=viewer`，但后续 `_build_user` 的 JOIN 会查不到用户并返回 401——形成"能登录、
  不能用"的怪状态。
- **`expiresAt` 是本地时间字符串**，不是 ISO8601/UTC；前端不要用 `Date.parse` 直接当 UTC 解析。
- **密码不做 trim**：创建用户时 `str(payload.get("password"))`，登录时也原样比较；前后端都要
  避免无意加空格。
- **登录成功才更新 `last_login_at`**：失败尝试不会留下"最后尝试时间"。

## 相关页面

[[modules/backend]] · [[entities/backend-security]] · [[entities/backend-deps-authz]] ·
[[entities/backend-users-router]] · [[concepts/auth-rbac]] · [[concepts/security-posture]] ·
[[flows/login-session]]
