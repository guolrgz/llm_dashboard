---
title: 依赖注入与权限判定（deps.py + catalog.py）
source_files:
  - backend/app/deps.py
  - backend/app/catalog.py
  - backend/app/routers/users.py
  - backend/app/routers/rbac.py
  - backend/app/routers/auth.py
updated: 2026-11-18
tags: [entity, backend, authz]
---

> 所属模块：[[modules/backend]]

# 依赖注入与权限判定（`deps.py` + `catalog.py`）

这两个文件共同定义"谁能调用哪个接口"：`catalog.py` 是权限键与角色的静态目录（也是种子数据
来源），`deps.py` 把"取数据库连接 / 解析 Bearer 令牌 / 加载当前用户 / 校验权限键"变成 FastAPI
依赖，供所有管理路由复用。

## 用途与职责

- **`get_db`**：按 `request.app.state.db_path` 建一条请求级连接，`finally` 关闭；不提交、不回滚。
- **`get_current_user`**：解析 `Authorization: Bearer`，验签/查黑名单，回库加载用户与实时权限，
  并把 token payload 放进 `request.state.token_payload`（登出接口依赖它取 `jti`）。
- **`require_permission(key)`**：返回一个依赖闭包，命中 `*` 或具体权限键才放行，否则 403。
- **`catalog`**：17 个权限键（9 组）、5 个角色、角色中文名/别名映射、`has_permission` 助手。
- **`load_user`**：`_build_user` 的公开别名，供路由在已知用户 id 时序列化。

## 权限目录与角色

| 分组 | 权限键 |
|---|---|
| dashboard | `dashboard.view` |
| users | `users.view`、`users.manage` |
| rbac | `rbac.view`、`rbac.manage` |
| models | `models.view`、`models.manage` |
| keys | `keys.view`、`keys.manage` |
| quota | `quota.view`、`quota.manage` |
| traffic | `traffic.view`、`traffic.manage` |
| alerts | `alerts.view`、`alerts.manage` |
| settings | `settings.view`、`settings.manage` |

角色：`super_admin`（`is_super=1`，权限固定为 `["*", ...全部键]`）、`admin`（17 项全量，无 `*`）、
`operator`（9 项：只读用户/模型/Key/配额 + 流量与告警管理）、`developer`（6 项：dashboard、
models.view、keys.view/manage、quota.view、traffic.view）、`viewer`（4 项只读）。
`ROLE_ALIASES` 把"系统管理员→admin"等中文别名映射到 key，供用户创建/筛选时容错。

## 关键函数签名

| 函数 | 签名 | 说明 |
|---|---|---|
| `get_db` | `(request: Request) -> Iterator[sqlite3.Connection]` | 生成器依赖，请求结束关闭连接 |
| `_build_user` | `(conn, user_id: int) -> dict` | JOIN users+roles；不存在→401；停用→403 |
| `get_current_user` | `(request, authorization: str \| None = Header(None), conn=Depends(get_db)) -> dict` | 令牌+黑名单+用户状态 |
| `require_permission` | `(permission_key: str) -> Callable` | 依赖工厂，返回 `_dependency` |
| `load_user` | `(conn, user_id: int) -> dict` | `_build_user` 别名 |
| `has_permission` | `(permissions: list[str], key: str) -> bool` | `"*" in permissions or key in permissions` |
| `all_permissions_for` | `(role_key: str) -> list[str]` | 按静态目录展开角色权限 |

`_build_user` 返回的契约结构：`id/username/nickname/userNo/email/status/roleId/role/roleName/
permissions/createdAt/lastLoginAt`，其中 `nickname` 缺失时回退为 `username`。

## 调用链与调用方

```
路由 Depends(require_permission("users.manage"))
  └─ _dependency → Depends(get_current_user)
       ├─ security.decode_token(authorization[7:])
       ├─ SELECT jti FROM revoked_tokens
       ├─ request.state.token_payload = payload
       └─ _build_user(conn, int(payload["sub"]))
            ├─ JOIN users + roles（实时读 status / is_super）
            └─ is_super ? ["*", *ALL] : SELECT role_permissions
```

- 所有业务路由都直接或间接依赖它；`auth.me` 只依赖 `get_current_user`，
  `auth.logout` 还额外拿 `get_db` 与 `request.state`。
- `deps._build_user` 与 `routers/users.build_user` 是两份几乎相同的实现（后者按 404 处理缺失），
  见 [[entities/backend-users-router]]。

## 数据与副作用

- 读取 `users`、`roles`、`role_permissions`、`revoked_tokens`；不写任何表。
- 每次受保护请求都会重新查库，因此**角色/权限/账号状态的修改立即生效**，不需要重新登录。
- `request.state.token_payload` 是登出接口取 `jti`/`exp` 的唯一通道。
- 超级管理员的 `"*"` 不落 `role_permissions`，是运行时合成的；`rbac` 路由也按同样规则序列化。

## 边界与错误处理

| 场景 | 结果 |
|---|---|
| 缺 `Authorization` 或非 Bearer | `401 unauthorized` |
| 签名/格式/过期问题 | 由 `security.decode_token` 抛对应 401 |
| `jti` 在 `revoked_tokens` | `401 token_revoked` |
| 用户已被删除 | `401 unauthorized`（"账号不存在或已被删除"） |
| 用户 `status != enabled` | `403 user_disabled` |
| 缺少权限键 | `403 forbidden`（消息含具体 key） |

注意 `get_current_user` 对"已删除用户"返回 401 而非 404，避免向持有旧令牌者泄露账号状态。

## 坑与注意点

- **两份用户序列化器**：`deps._build_user` 用 401/403，`users.build_user` 用 404，且字段拼装
  重复。新增 `user` 字段时必须同步两处，否则 `/auth/me` 与 `/users/{id}` 返回结构会漂移。
- **权限实时读库、令牌里的 `role` 不参与授权**：`create_token` 写入的 `role` 只是冗余信息；
  改角色后旧令牌立即按新角色判定。好处是无需强制重登，代价是权限变更没有审计痕迹。
- **`get_db` 不管理事务**：依赖只负责关闭连接。若 handler 在写操作后抛异常且之前已 `commit`，
  数据不会回滚；网关的 `fail()` 就是显式先 commit 审计日志再抛错。
- **`require_permission` 的闭包名都叫 `_dependency`**：FastAPI 依赖缓存按 callable 对象，
  每次调用 `require_permission` 都会新建对象，所以不同权限点的缓存不会串。
- **`catalog.ROLES` 只用于种子/静态展开**：运行时授权以 `roles`/`role_permissions` 表为准；
  直接改 `catalog.py` 而不重建库，不会自动同步到已有 DB（种子用 `INSERT OR IGNORE`）。
- **`admin` 角色也有 `rbac.manage`**：它可以把任何非超管角色的权限改空（包括自己的角色），
  没有"至少保留一个可管理角色"的保护，见 [[flows/role-permission-change]]。

## 相关页面

[[modules/backend]] · [[entities/backend-auth-router]] · [[entities/backend-users-router]] ·
[[entities/backend-rbac-router]] · [[entities/backend-security]] · [[concepts/auth-rbac]] ·
[[flows/login-session]] · [[flows/role-permission-change]]
