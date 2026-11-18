---
title: 认证与 RBAC（认证授权体系）
source_files:
  - backend/app/security.py
  - backend/app/deps.py
  - backend/app/catalog.py
  - backend/app/routers/auth.py
  - backend/app/routers/rbac.py
  - src/stores/auth.js
  - src/router/index.js
updated: 2026-11-18
tags: [concept, auth, rbac]
---

# 认证与 RBAC

## 这个概念解决什么问题

系统同时服务两类调用者：**控制台用户**（浏览器里的管理员/运营/开发者）和**推理网关的外部业务方**（持 API Key 调 `/v1/*`）。本概念只覆盖前者：谁可以登录、登录态如何保持、每个受保护接口如何判定“这个人有没有权限”。API Key 的鉴权在 [[concepts/token-governance]] 与 [[entities/backend-traffic-gateway]] 中展开。

## 参与文件

| 文件 | 职责 |
|---|---|
| `backend/app/security.py` | 密码哈希（PBKDF2）、JWT 签发/校验、API Key 生成与哈希 |
| `backend/app/catalog.py` | 17 个权限键 + 5 个角色定义（唯一事实来源） |
| `backend/app/deps.py` | `get_db` / `get_current_user` / `require_permission` |
| `backend/app/routers/auth.py` | `/api/auth/login`、`/me`、`/logout` |
| `backend/app/routers/rbac.py` | 角色、权限目录、角色-权限绑定 |
| `src/stores/auth.js` | 前端登录态（token + user + permissions） |
| `src/router/index.js` | 路由守卫（未登录跳 `/login?redirect=...`） |

## 认证链路

1. **密码**：`security.hash_password()` 用 PBKDF2-HMAC-SHA256（260,000 次迭代 + 随机 16 字节盐），格式 `pbkdf2_sha256$iter$salt$hash`；`verify_password()` 用 `hmac.compare_digest` 常数时间比较。种子账号统一演示口令（见 [[entities/backend-seed-data]]），生产必须先轮换。
2. **令牌**：`POST /api/auth/login` 校验通过后调用 `security.create_token()` 签发 HS256 JWT，载荷含 `sub`（用户 id）、`username`、`role`、`jti`、`iat`、`exp`（默认 8 小时，`LLM_DASHBOARD_TOKEN_TTL_HOURS` 可配）。签名密钥来自 `LLM_DASHBOARD_JWT_SECRET`，未设置时回退开发默认值（安全审查已标为部署风险，见 [[concepts/security-posture]]）。
3. **请求鉴权**：受保护接口依赖 `get_current_user()`：
   - 解析 `Authorization: Bearer <token>` → `decode_token()` 校验签名与过期；
   - 查 `revoked_tokens` 判断 jti 是否已退出登录；
   - 读 `users` + `roles`，校验用户仍存在且 `status=enabled`；
   - 组装权限列表（超管返回 `["*", ...全部权限]`；普通角色查 `role_permissions`）。
4. **退出登录**：`POST /api/auth/logout` 把当前 jti 与 exp 写入 `revoked_tokens`，之后旧令牌访问任何受保护接口都返回 `401 token_revoked`。`deps.py` 每次请求都会检查该表（单实例 SQLite 足够）。
5. **前端守卫**：`router.beforeEach` 无 token 时跳 `/login?redirect=...`；有 token 但无用户快照时先 `fetchMe()`；已登录访问 `/login` 跳首页。`src/api/client.js` 收到 401 时清 token 并触发跳转，见 [[entities/frontend-auth-store]] 与 [[entities/frontend-router-guard]]。

## 授权模型（RBAC）

- **权限键**（17 个，以 `backend/app/catalog.py` 为唯一来源）：`dashboard.view`、`users.view/manage`、`rbac.view/manage`、`models.view/manage`、`keys.view/manage`、`quota.view/manage`、`traffic.view/manage`、`alerts.view/manage`、`settings.view/manage`。按 `group_key/group_label` 分组（9 组）。
- **角色**（5 个）：`super_admin`（超级管理员，`is_super=1`，权限 `*`）、`admin`（管理员）、`operator`（运维管理员）、`developer`（开发者）、`viewer`（普通用户）。角色定义里直接列出权限键，种子写入 `role_permissions`。
- **接口级强制**：每个管理路由声明 `Depends(require_permission("users.manage"))` 等；`has_permission` 支持 `*` 短路。**服务端是唯一安全边界**——前端按权限隐藏按钮只是体验优化。
- **修改授权**：`PUT /api/roles/{id}/permissions` 校验权限键必须在目录中，事务内替换 `role_permissions`；超管角色固定全部权限（返回 409）。因为 `get_current_user` 每次请求实时读库，修改对下一次请求立即生效。见 [[flows/role-permission-change]]。
- **角色-用户**：`users.role_id` 单角色；`GET /api/roles/{id}/users` 供角色管理页展示成员。

## 前端与后端的权限分工

- 后端：所有 `/api/*`（除登录）与 `/v1/*` 分别用 JWT 与 API Key 保护；无 token → 401、无权限 → 403、停用用户 → 403。
- 前端：`auth.hasPerm(key)` 控制按钮/页签可见性；用户快照存 `localStorage`，可被篡改，但服务端会再次校验，因此只影响显示。安全取舍见 [[concepts/security-posture]]。

## 坑与注意点

- **退出登录不是无状态 JWT 的默认行为**：必须依赖 `revoked_tokens` 表，否则旧令牌仍有效；已实现但表会持续增长，需要定期清理过期记录（`logout` 时会顺带清理）。
- **令牌有效期 8h**：浏览器关闭不失效；如需更短，改环境变量并配合前端 401 处理。
- **统一错误结构**：认证失败返回 `{"error":{"code":"unauthorized","message":"..."}}`，前端 `client.js` 统一解析；不要单独改某个路由的返回结构。
- **默认密钥与演示口令**：上线前必须设置强随机 `LLM_DASHBOARD_JWT_SECRET` 并轮换种子凭据；详见 `vue-security-review-report.md` 与 [[concepts/security-posture]]。

## 相关页面

- [[modules/backend]]、[[entities/backend-security]]、[[entities/backend-deps-authz]]、[[entities/backend-auth-router]]、[[entities/backend-rbac-router]]
- [[flows/login-session]]、[[flows/role-permission-change]]
- 前端：[[entities/frontend-auth-store]]、[[entities/frontend-router-guard]]、[[entities/frontend-login-view]]
- [[concepts/security-posture]]
