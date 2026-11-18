---
title: 前端 API 客户端
source_files:
  - src/api/client.js
  - src/api/analytics.js
updated: 2026-11-18
tags: [entity, frontend, api]
---

> 所属模块：[[modules/frontend]]

# 前端 API 客户端

`src/api/client.js` 是控制台唯一的 HTTP 出入口：所有页面通过它发请求，从而共享鉴权头、超时、错误结构与 401 处理。`src/api/analytics.js` 只是在它之上对 Dashboard/告警/流量摘要做的薄封装，不含状态。

## 用途与职责

- 解析 base URL：默认 `/api`，可由 `VITE_API_BASE` 覆盖（末尾斜杠会被裁掉）。
- 从 `localStorage['llm_token']` 读取令牌，自动附加 `Authorization: Bearer <token>`。
- 统一 20s 超时，并与调用方传入的 `AbortSignal` 合并。
- 把后端 `{error:{code,message,details}}` 与网络异常归一为 `ApiError`。
- 401 时清理本地会话、广播 `llm:unauthorized`、带 `redirect` 参数跳转 `#/login`。
- 提供 `api.get/post/put/patch/del/delete` 快捷方法与 `resolveUrl`。

## 导出面

| 导出 | 说明 |
|---|---|
| `API_BASE` | 计算后的 base，例如 `/api` |
| `resolveUrl(path)` | 拼出最终 URL；`http(s)://`、`/api*`、`/v1*` 原样返回 |
| `getToken` / `setToken` / `clearToken` | token 读写；`clearToken` 同时删除用户快照 |
| `getStoredUser` / `setStoredUser` | `llm_user` JSON 快照，刷新时减少闪烁 |
| `ApiError` | `status/code/message/details/payload/url/method/cause` |
| `request(path, options)` | 核心请求函数 |
| `api`（default） | 方法快捷封装 |

`analytics.js` 导出 `fetchDashboard(range, {signal})`、`fetchUnreadAlertCount()`、`fetchAlerts(params)`、`fetchTrafficSummary(range)`；前两个被实际使用，后两个目前无调用方，属于预留接口。

## 请求数据流

1. 计算 `url = resolveUrl(path)`；若 `auth !== false` 且有 token，则写入 `Authorization`。
2. `body` 为 `FormData` 时原样发送；否则 `JSON.stringify` 并补 `Content-Type: application/json`。
3. 组装信号：调用方 `signal` 优先加入，`timeout > 0` 时追加 `AbortSignal.timeout(timeout)`；两个都存在时用 `AbortSignal.any` 合并，不支持则退化为调用方信号。
4. `fetch` 抛错：`AbortError`/`TimeoutError` 原样抛出（页面据此静默忽略）；其余包装为 `status: 0, code: 'network_error'`。
5. 读响应：204/205 返回 `null`；`content-type` 含 JSON 就 `res.json()`，否则先读文本再尝试 `JSON.parse`。
6. `!res.ok`：取 `payload.error`，401 且本次是认证请求时触发 `handleUnauthorized()`，随后抛 `ApiError`。
7. 成功直接返回解析后的 payload（不做业务解包，调用方自行取 `items`/`user`）。

## 错误模型

- 后端标准错误：`code` 来自 `error.code`，`message` 来自 `error.message`，缺省时按 HTTP 状态查 `STATUS_MESSAGES`（400/401/403/404/409/422/429/500/502/503/504 的中文文案）。
- `details` 非对象时归一为 `{}`，页面可安全读取。
- 网络层错误固定 `code = 'network_error'`，携带 `cause` 便于调试但不会展示给用户。
- `useToast.js` 的 `errorText()` 进一步把 `network_error`、401、403、`token_expired` 转成可直接展示的中文。

## 状态与副作用

- **localStorage**：写 `llm_token` 与 `llm_user`；所有读写都包 `try/catch`，隐私模式/禁用存储时静默降级为内存态。
- **全局事件**：401 时 `window.dispatchEvent(new CustomEvent('llm:unauthorized'))`；[[entities/frontend-auth-store]] 监听后清空内存状态，二者解耦。
- **路由副作用**：`handleUnauthorized()` 直接改 `window.location.hash` 为 `#/login?redirect=<当前 hash>`，绕过 vue-router；`redirecting` 标志避免并发 401 重复跳转，已在 `/login` 时不再跳。
- **请求副作用**：GET 可带 `signal` 取消；POST/PUT/DELETE 没有幂等保护，页面需自行防重复点击（各页面用 `saving`/`running` 标志）。

## 调用链

- 登录：`LoginView.onSubmit` → `auth.login` → `request('/api/auth/login', {auth:false})` → 后端 [[entities/backend-auth-router]]。
- 刷新会话：路由守卫 → `auth.fetchMe` → `request('/api/auth/me')`。
- Dashboard：`DashboardView.load` → `fetchDashboard` → `request('/api/analytics/dashboard?range=...')` → [[entities/backend-analytics]]。
- 顶栏未读：`AppTopbar.loadUnread` → `fetchUnreadAlertCount` → `/api/alerts/unread-count` → [[entities/backend-alerts]]。
- 401 回路：任意页面请求 → `client` 清 token + 事件 + hash 跳登录 → [[flows/login-session]] 的失败分支。

## 坑与注意点

- `resolveUrl` 只认 `/api`、`/v1`、`http(s)://`；写 `/health` 会被拼成 `/api/health`，调用非 `/api` 前缀接口必须传完整路径或绝对 URL。
- `VITE_API_BASE` 若配置成 `http://host:8000/api`，`/api/...` 路径仍会“原样”返回而绕过后端主机；跨域部署时应统一传相对路径或整体改用绝对地址。
- 超时只中止浏览器侧等待，不会取消服务端已开始的推理/写库；对网关类长请求应显式传更长的 `timeout` 或 `signal`。
- 401 跳转是改 hash 而非 `router.push`，不会经过路由守卫的 `fetchMe`，但会触发一次 hash 路由；守卫与客户端可能同时判定要跳转，`redirecting` 只能防客户端内部的并发。
- `STATUS_MESSAGES` 对 429 只说“请求过于频繁或超出配额”，无法区分 `rate_limited` 与 `quota_exceeded`；需要区分时应读 `err.code`。
- 响应体解析失败会被吞成 `null`，成功状态但空体时调用方要能接受 `null`（例如 204 的删除）。
- `api.del` 与 `api.delete` 并存，仅为兼容不同调用习惯，不是两个语义。
