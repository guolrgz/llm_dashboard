---
title: 流程 — 登录与会话生命周期
source_files:
  - src/views/LoginView.vue
  - src/api/client.js
  - src/stores/auth.js
  - src/router/index.js
  - backend/app/routers/auth.py
  - backend/app/deps.py
  - backend/app/security.py
updated: 2026-11-18
tags: [flow, auth, login]
---

# 登录与会话生命周期

## 参与者

- 前端：[[entities/frontend-login-view]] → [[entities/frontend-api-client]] → [[entities/frontend-auth-store]] → [[entities/frontend-router-guard]]
- 后端：[[entities/backend-auth-router]] → [[entities/backend-security]] → `deps.get_current_user`（[[entities/backend-deps-authz]]）
- 存储：`users` / `roles` / `role_permissions` / `revoked_tokens`

## 步骤（按调用顺序）

### 1. 打开任意业务路由（未登录）

1. `router.beforeEach`（`src/router/index.js`）读取 `getToken()`：无 token → 返回 `/login?redirect=<目标路径>`。
2. 登录页 `LoginView` 挂载，用户名输入框自动聚焦；预填演示账号按钮（`fillDemo()`）可一键填入。
3. 若已登录访问 `/login`：有 token 且用户快照存在 → 跳 `/`；否则先 `auth.fetchMe()` 再决定。

### 2. 提交登录表单

1. `onSubmit()` 校验非空 → 调 `auth.login(username, password)`。
2. `auth.login()` 通过 `request('/api/auth/login', { method:'POST', body, auth:false })` 请求；`client.js` 不做 401 自动跳转（登录请求除外），统一把 HTTP 错误包装成 `ApiError`。
3. 后端 `POST /api/auth/login`（`routers/auth.py::login`）：
   - 字符串化/去空格，空值 → 400；
   - `SELECT * FROM users WHERE username=?`，找不到或 `verify_password()` 失败 → 401「用户名或密码错误」（不区分用户不存在/密码错误，避免枚举）；
   - `status != enabled` → 403 `user_disabled`；
   - 查 `roles.key`，`security.create_token()` 签发 HS256 JWT（`sub`、`username`、`role`、`jti`、`iat`、`exp`）；
   - 更新 `users.last_login_at` 并 `commit()`；
   - 返回 `{token, tokenType, expiresAt, user}`，`user` 由 `build_user()` 组装（含 `permissions`，无密码字段）。
4. `auth.login()` 写入 `localStorage.llm_token` 与 `llm_user` 快照，`applySession()` 更新 reactive state。
5. `LoginView` 调 `safeRedirect(route.query.redirect)`：只接受以单 `/` 开头的站内路径（拒绝 `//`、`/login`），`router.replace()` 回跳。

### 3. 后续每次受保护请求

1. `client.js` 的 `request()` 默认 `auth=true`，从 `localStorage` 取 token 塞进 `Authorization: Bearer`。
2. 后端 `deps.get_current_user()`：`decode_token()` 校验签名/过期 → 查 `revoked_tokens` → 读用户与角色 → 组装权限；失败抛 401/403 统一错误。
3. 路由自身再通过 `require_permission(key)` 校验权限键；超管 `*` 短路。

### 4. 401 与会话失效

1. 任何请求返回 401 → `client.js::handleUnauthorized()`：`clearToken()`（清 token + 用户快照）→ 派发 `llm:unauthorized` 事件 → 若当前不在 `/login`，把 `window.location.hash` 设为 `#/login?redirect=<当前 hash>`。
2. `auth` store 监听事件同步清空状态；路由守卫下次进入时也会兜底。

### 5. 退出登录

1. 侧栏/顶栏「退出登录」→ `auth.logout()`：先调 `POST /api/auth/logout`，再 `clearToken()`、清状态、`router.replace('/login')`。
2. 后端 `logout()` 从 `request.state.token_payload` 取 `jti`/`exp`，写入 `revoked_tokens`，并顺手清理过期记录；旧 token 再次使用 → 401 `token_revoked`。

## 时序（简化）

```text
LoginView → auth.login → POST /api/auth/login
  → verify_password → create_token → users.last_login_at
  ← {token, user}
  → localStorage(token) → safeRedirect → Dashboard
Dashboard → GET /api/... (Bearer) → get_current_user → require_permission → data
logout → POST /api/auth/logout → revoked_tokens(jti) → clear localStorage → /login
```

## 坑与注意点

- **令牌在 localStorage**：XSS 可读取；当前第一方无注入点，但需 CSP 等防护，见 [[concepts/security-posture]]。
- **退出登录依赖服务端黑名单**：不要只清前端 token，否则旧 token 仍有效。
- **登录接口无失败限流**：安全审查已列为 Medium（[[concepts/security-posture]]）。
- **redirect 校验只在登录页消费端**：`client.js` 生成的是同源 hash，不存在跨站跳转。

## 相关页面

- [[concepts/auth-rbac]]、[[flows/role-permission-change]]
- [[entities/frontend-login-view]]、[[entities/frontend-auth-store]]、[[entities/frontend-router-guard]]、[[entities/frontend-api-client]]
- [[entities/backend-auth-router]]、[[entities/backend-security]]、[[entities/backend-deps-authz]]
