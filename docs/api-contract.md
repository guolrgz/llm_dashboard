# API 契约（前后端共同遵守）

后端：FastAPI，默认 `http://127.0.0.1:8000`。开发时 Vite 将 `/api` 与 `/v1` 代理到后端。
所有响应 `Content-Type: application/json`（流式推理除外）。

## 约定

- 认证：`Authorization: Bearer <token>`（登录后获得）。无 token → `401`；权限不足 → `403`。
- 错误统一结构：
  ```json
  { "error": { "code": "forbidden", "message": "缺少权限：users.manage", "details": {} } }
  ```
  常见 code：`unauthorized` `token_expired` `forbidden` `not_found` `conflict` `validation_error` `quota_exceeded` `rate_limited`。
- 分页参数：`page`（默认 1）、`pageSize`（默认 10，最大 100）；响应：
  ```json
  { "items": [], "total": 128, "page": 1, "pageSize": 10 }
  ```
- 时间格式：`YYYY-MM-DD HH:MM:SS`。
- 内置账号：`admin / admin123`（超级管理员），其余种子账号密码同为 `admin123`；种子演示 Key：`sk-demo-admin-2026`（admin）、`sk-demo-user123-2026`（user123）。
- 权限键：`dashboard.view` `users.view` `users.manage` `rbac.view` `rbac.manage` `models.view` `models.manage` `keys.view` `keys.manage` `quota.view` `quota.manage` `traffic.view` `traffic.manage` `alerts.view` `alerts.manage` `settings.view` `settings.manage`。超级管理员拥有 `*`。

## 系统

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/health` | 无 | `{status, database, version, uptimeSeconds, startedAt}` |

## 认证与 RBAC

| 方法 | 路径 | 权限 | 请求 / 响应 |
|---|---|---|---|
| POST | `/api/auth/login` | 无 | `{username, password}` → `{token, tokenType:"Bearer", expiresAt, user}` |
| GET | `/api/auth/me` | 登录 | `{user}` |
| POST | `/api/auth/logout` | 登录 | `{ok:true}`，令牌失效 |
| GET | `/api/roles` | `rbac.view` | `{items:[{id, key, name, description, isSuper, permissions:[key], userCount}]}` |
| GET | `/api/permissions` | `rbac.view` | `{items:[{key, groupKey, groupLabel, name, description}], groups:[{key,label,items:[...]}]}` |
| PUT | `/api/roles/{id}/permissions` | `rbac.manage` | `{permissions:[key]}` → `{role}` |
| GET | `/api/roles/{id}/users` | `rbac.view` | `{items:[{id, username, status}]}` |

`user` 结构：`{id, username, nickname, userNo, email, status, roleId, role, roleName, permissions:[], createdAt, lastLoginAt}`。

## 用户

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/users` | `users.view` | 查询：`page,pageSize,keyword,status,role`；响应分页，item 含 `id, username, userNo, nickname, email, role, roleName, roleId, status, createdAt, lastLoginAt, keyCount` |
| GET | `/api/users/stats` | `users.view` | `{total, enabled, disabled, byRole:[{role, count}]}` |
| POST | `/api/users` | `users.manage` | `{username, password, nickname?, userNo?, email, roleId|role, status?}` → `201 {user}`；重名 `409` |
| PUT | `/api/users/{id}` | `users.manage` | 同上可省略 password；`password` 提供时重置密码 |
| DELETE | `/api/users/{id}` | `users.manage` | `204`；不能删除自己/最后一个超管 `409` |
| POST | `/api/users/{id}/status` | `users.manage` | `{status:"enabled"|"disabled"}` |
| POST | `/api/users/batch` | `users.manage` | `{ids:[1,2], action:"delete"|"enable"|"disable"}` → `{ok, affected}` |

## 模型渠道

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/models` | `models.view` | `{items:[{id,name,displayName,provider,upstreamBaseUrl,hasUpstreamKey,upstreamKeyMasked,inputPrice,outputPrice,weight,status,description,createdAt}]}` |
| POST | `/api/models` | `models.manage` | `{name, displayName?, provider, upstreamBaseUrl?, upstreamApiKey?, inputPrice, outputPrice, weight, status?, description?}`；重名 `409` |
| PUT | `/api/models/{id}` | `models.manage` | 局部更新 |
| DELETE | `/api/models/{id}` | `models.manage` | `204`，历史统计保留 |
| POST | `/api/models/{id}/status` | `models.manage` | `{status}` |

## API Key / 配额 / 限流

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/keys` | `keys.view` | 查询 `userId`；`{items:[{id,userId,username,name,keyPrefix,status,rpmLimit,tpmLimit,dailyQuota,monthlyQuota,createdAt,lastUsedAt}]}` |
| POST | `/api/keys` | `keys.manage` | `{userId,name,rpmLimit?,tpmLimit?,dailyQuota?,monthlyQuota?}` → `201 {key, apiKey}`（明文只返回一次） |
| GET | `/api/keys/{id}` | `keys.view` | `{key, usage:{dayUsed,dayQuota,monthUsed,monthQuota,dayRemaining,monthRemaining}}` |
| DELETE | `/api/keys/{id}` | `keys.manage` | `204` 吊销 |
| POST | `/api/keys/{id}/rotate` | `keys.manage` | `{key, apiKey}`（新明文） |
| GET | `/api/quota/policies` | `quota.view` | `{defaults:{dailyQuota,monthlyQuota,rpm,tpm,alertThreshold}, items:[{id,scope,targetId,targetName,dailyQuota,monthlyQuota,rpmLimit,tpmLimit,updatedAt}]}` |
| PUT | `/api/quota/policies/{scope}/{targetId}` | `quota.manage` | `scope=user|role|key`；`{dailyQuota?,monthlyQuota?,rpmLimit?,tpmLimit?}` |
| GET | `/api/quota/usage` | `quota.view` | `{items:[{userId,username,dailyQuota,dayUsed,monthlyQuota,monthUsed,percent}]}` |

## 系统设置

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/settings` | `settings.view` | `{siteName, defaultDailyQuota, defaultMonthlyQuota, defaultRpm, defaultTpm, alertThreshold, systemStartedAt, uptimeDays}` |
| PUT | `/api/settings` | `settings.manage` | 同结构局部更新，持久化 |

## 推理网关（OpenAI 兼容）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/chat/completions` | Header `Authorization: Bearer sk-...`；body `{model?, messages:[{role,content}], stream?, max_tokens?, temperature?}` |
| POST | `/v1/embeddings`（可选） | 可裁剪，不作为验收项 |

非流式响应（兼容 OpenAI）：
```json
{
  "id": "chatcmpl-...", "object": "chat.completion", "created": 1700000000,
  "model": "GPT-4o",
  "choices": [{"index":0,"message":{"role":"assistant","content":"..."},"finish_reason":"stop"}],
  "usage": {"prompt_tokens": 123, "completion_tokens": 45, "total_tokens": 168}
}
```
错误：无/坏 Key `401`、停用用户 `403`、模型不可用 `404`/`400`、参数错误 `400`、配额 `429 quota_exceeded`、限流 `429 rate_limited` + `Retry-After`。
响应头：`X-RateLimit-Limit/Remaining/Reset`、`X-Quota-Limit/Remaining`。
`stream=true` → `text/event-stream`，块格式 `data: {"id":...,"choices":[{"delta":{"content":"..."}}]}`，结束 `data: [DONE]`。

## 流量日志与统计

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/traffic/logs` | `traffic.view` | `page,pageSize,status,userId,model,range(today|7d|30d),keyword`；item：`{id,time,userId,username,keyPrefix,model,promptTokens,completionTokens,totalTokens,status,httpStatus,latencyMs,errorCode}` |
| GET | `/api/traffic/summary` | `traffic.view` | `range` → `{requests, successRequests, failedRequests, tokens, avgLatencyMs, rateLimited, quotaExceeded, statusBreakdown:{success,error,quota_exceeded,rate_limited}}` |
| GET | `/api/traffic/rate-limit-events` | `traffic.view` | 最近限流/配额事件（来自 request_logs） |

## 分析 / 告警

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/analytics/dashboard` | `dashboard.view` | `range=today|7d|30d`（默认 today） |
| GET | `/api/analytics/dashboard?range=...` | 同上 | 响应见下 |
| GET | `/api/alerts` | `alerts.view` | `unreadOnly?,page,pageSize` → `{items:[{id,type,level,title,message,userId,username,read,createdAt}], unread, total}` |
| GET | `/api/alerts/unread-count` | 登录 | `{unread}` |
| POST | `/api/alerts/{id}/read` | `alerts.manage` | `{alert}` |
| POST | `/api/alerts/read-all` | `alerts.manage` | `{ok, affected}` |

`/api/analytics/dashboard` 响应：
```json
{
  "range": "today",
  "kpis": [
    {"id":"requests","label":"总请求量","value":128960,"display":"128,960","delta":12.5,"deltaUnit":"%","spark":[...],"tone":"blue","icon":"chat"},
    {"id":"tokens","label":"Token 使用量","value":1240000000,"display":"1.24B","delta":18.7,"deltaUnit":"%","spark":[...],"tone":"green","icon":"database"},
    {"id":"success","label":"成功率","value":99.2,"display":"99.2%","delta":0.1,"deltaUnit":"pp","spark":[...],"tone":"purple","icon":"check"}
  ],
  "trend": {"xLabels":["00:00","04:00","08:00","12:00","16:00","20:00"],"total":[...],"success":[...],"yTicks":[0,500,1000,1500,2000,2500],"yLabels":{"0":"0","500":"500","1000":"1k","1500":"1.5k","2000":"2k","2500":"2.5k"}},
  "distribution": {"total":1240000000,"display":"1.24B","segments":[{"key":"gpt","name":"GPT-4o","percent":40.2,"color":"#518af6"}]},
  "recentRequests": [{"id":1,"time":"2026-11-18 15:00:00","user":"user123","model":"GPT-4o","tokens":2048,"tokensDisplay":"2,048","status":"成功","statusKey":"success"}],
  "overview": {"users":128,"roles":5,"models":4,"uptimeDays":15},
  "alerts": {"unread": 3}
}
```
趋势说明：今日 96 个 15 分钟点、xLabels 6 个（每 4 小时）；7d 为 7 个点、30d 为 30 个点。
分布段：`GPT-4o`（`#518af6`）、`Claude-3.5`（`#97d486`）、`Qwen-Max`（`#f1ad7c`）、`其他`（`#a6baf9`）。

## 前端约定

- API 客户端：`src/api/client.js` 暴露 `request(path, {method, body, auth})`；token 存 `localStorage["llm_token"]`；401 时清 token 并跳 `/login`。
- 路由：`/login`、`/`（Dashboard）、`/users`、`/roles`、`/permissions`、`/traffic`、`/models`、`/settings`。除 `/login` 外均需登录。
- 侧栏沿用原型 6 项：Dashboard、用户管理、角色管理、权限管理、流量监控、系统设置；模型管理通过系统设置页入口 + `/models` 路由访问。
- 权限控制：auth store 提供 `hasPerm(key)`；无权限的按钮隐藏或禁用。
