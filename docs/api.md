# API 文档 — LLM 推理 Token 流量管理系统

- 服务地址：`http://127.0.0.1:8000`（开发时 Vite 将 `/api`、`/v1`、`/health` 代理到该地址）
- 交互式文档：`http://127.0.0.1:8000/docs`（Swagger UI）、`/redoc`
- 认证方式：管理接口使用 `Authorization: Bearer <token>`；推理网关使用 `Authorization: Bearer sk-...`
- 所有响应为 JSON（流式推理为 `text/event-stream`），时间格式 `YYYY-MM-DD HH:MM:SS`

## 1. 统一约定

### 错误结构

```json
{ "error": { "code": "forbidden", "message": "缺少权限：users.manage", "details": {} } }
```

| HTTP | code 示例 | 含义 |
|---|---|---|
| 400 | `bad_request` / `validation_error` | 参数或请求体非法 |
| 401 | `unauthorized` / `invalid_token` / `token_expired` | 未登录或令牌失效 |
| 403 | `forbidden` / `user_disabled` | 无权限或账号停用 |
| 404 | `not_found` | 资源不存在 |
| 409 | `conflict` | 唯一性冲突（用户名/用户ID/模型名等） |
| 429 | `rate_limited` / `quota_exceeded` | 限流或配额超限 |

### 分页

请求：`page`（默认 1）、`pageSize`（默认 10，最大 100）。
响应：`{ "items": [], "total": 0, "page": 1, "pageSize": 10 }`。

### 权限键

| 权限 | 说明 |
|---|---|
| `dashboard.view` | 查看 Dashboard |
| `users.view` / `users.manage` | 查看 / 管理用户 |
| `rbac.view` / `rbac.manage` | 查看 / 管理角色权限 |
| `models.view` / `models.manage` | 查看 / 管理模型渠道 |
| `keys.view` / `keys.manage` | 查看 / 管理 API Key |
| `quota.view` / `quota.manage` | 查看 / 管理配额限流 |
| `traffic.view` / `traffic.manage` | 查看 / 管理流量 |
| `alerts.view` / `alerts.manage` | 查看 / 管理告警 |
| `settings.view` / `settings.manage` | 查看 / 管理系统设置 |

内置 5 个角色：`super_admin`（超级管理员，`*`）、`admin`（管理员）、`operator`（运维管理员）、`developer`（开发者）、`viewer`（普通用户）。

## 2. 快速开始

```bash
# 登录 → 拿 token
curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

# token 保存后用管理接口
TOKEN=...
curl -s http://127.0.0.1:8000/api/analytics/dashboard?range=today \
  -H "Authorization: Bearer $TOKEN"

# 推理网关（演示 Key）
curl -s -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H 'Authorization: Bearer sk-demo-admin-2026' \
  -H 'Content-Type: application/json' \
  -d '{"model":"GPT-4o","messages":[{"role":"user","content":"你好"}]}'
```

内置账号：`admin / admin123`（其余种子账号同密码）。
内置演示 Key：`sk-demo-admin-2026`（admin，高配额）、`sk-demo-user123-2026`（user123，RPM 30 / TPM 20000 / 日配额 2,000,000 已用 1,850,000，便于复现告警/限流）。

## 3. 系统与认证

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/health` | 无 | `{status, database, version, uptimeSeconds, startedAt}` |
| POST | `/api/auth/login` | 无 | `{username, password}` → `{token, tokenType, expiresAt, user}` |
| GET | `/api/auth/me` | 登录 | `{user}` |
| POST | `/api/auth/logout` | 登录 | `{ok:true}`，当前 JWT 立即失效 |

`user` 结构：
```json
{
  "id": 1, "username": "admin", "nickname": "admin", "userNo": "10001",
  "email": "admin@example.com", "status": "enabled",
  "roleId": 1, "role": "super_admin", "roleName": "超级管理员",
  "permissions": ["*", "dashboard.view"], "createdAt": "...", "lastLoginAt": "..."
}
```

## 4. 角色与权限

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/roles` | `rbac.view` | `{items:[{id,key,name,description,isSuper,permissions:[key],userCount}]}` |
| GET | `/api/permissions` | `rbac.view` | `{items:[...], groups:[{key,label,items|count,...}]}` |
| PUT | `/api/roles/{id}/permissions` | `rbac.manage` | `{permissions:[key]}`；超管角色固定全部权限（`409`） |
| GET | `/api/roles/{id}/users` | `rbac.view` | `{items:[{id, username, status}]}` |

## 5. 用户管理

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/users` | `users.view` | 查询 `page,pageSize,keyword,status,role` |
| GET | `/api/users/stats` | `users.view` | `{total, enabled, disabled, byRole}` |
| POST | `/api/users` | `users.manage` | 创建；用户名/用户ID 重复 → `409` |
| PUT | `/api/users/{id}` | `users.manage` | 编辑；传 `password` 时重置密码 |
| DELETE | `/api/users/{id}` | `users.manage` | 删除并级联失效 Key；不能删自己/最后一个启用超管 |
| POST | `/api/users/{id}/status` | `users.manage` | `{status:"enabled"|"disabled"}` |
| POST | `/api/users/batch` | `users.manage` | `{ids:[...], action:"delete"|"enable"|"disable"}` |

创建请求示例：
```json
{ "username": "alice2", "password": "pass123456", "email": "a@example.com", "roleId": 4, "status": "enabled" }
```

## 6. 模型渠道

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/models` | `models.view` | `{items:[{id,name,displayName,provider,upstreamBaseUrl,hasUpstreamKey,upstreamKeyMasked,inputPrice,outputPrice,weight,status,description,createdAt}]}` |
| POST | `/api/models` | `models.manage` | 创建；名称重复 `409` |
| PUT | `/api/models/{id}` | `models.manage` | 局部更新；`upstreamApiKey` 空串表示保持原值 |
| DELETE | `/api/models/{id}` | `models.manage` | 删除（历史统计保留） |
| POST | `/api/models/{id}/status` | `models.manage` | `{status:"enabled"|"disabled"}` |

`upstreamBaseUrl` 为空时使用内置离线模拟上游；配置后网关通过 httpx 转发 OpenAI 兼容请求并透传 `usage`。

## 7. API Key / 配额 / 限流

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/keys` | `keys.view` | 查询 `userId`；列表只返回 `keyPrefix`（绝不返回明文） |
| POST | `/api/keys` | `keys.manage` | `{userId,name,rpmLimit?,tpmLimit?,dailyQuota?,monthlyQuota?}` → `{key, apiKey}`，`apiKey` 仅此一次 |
| GET | `/api/keys/{id}` | `keys.view` | `{key, usage:{dayUsed,dayQuota,monthUsed,monthQuota,dayRemaining,monthRemaining}}` |
| DELETE | `/api/keys/{id}` | `keys.manage` | 吊销，立即失效 |
| POST | `/api/keys/{id}/rotate` | `keys.manage` | 轮换，返回新明文 |
| GET | `/api/quota/policies` | `quota.view` | `{defaults, items}`，含 `alertThreshold` |
| PUT | `/api/quota/policies/{scope}/{targetId}` | `quota.manage` | `scope=user|role|key`，upsert |
| GET | `/api/quota/usage` | `quota.view` | 按用户汇总今日/本月用量、配额与百分比 |

策略优先级：Key 级 > 用户级覆盖 > 角色级 > settings 默认值。
限流窗口：60 秒滑动窗口（RPM/TPM），超限返回 `429 rate_limited` + `Retry-After`。

## 8. 系统设置

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/settings` | `settings.view` | `{siteName, defaultDailyQuota, defaultMonthlyQuota, defaultRpm, defaultTpm, alertThreshold, systemStartedAt, uptimeDays}` |
| PUT | `/api/settings` | `settings.manage` | 部分更新并持久化；`alertThreshold` 范围 0~1 |

## 9. 推理网关（OpenAI 兼容）

### POST `/v1/chat/completions`

请求头：`Authorization: Bearer sk-...`；请求体：

```json
{
  "model": "GPT-4o",
  "messages": [{ "role": "user", "content": "你好" }],
  "stream": false,
  "max_tokens": 256,
  "temperature": 0.2
}
```

成功响应（OpenAI 兼容）：

```json
{
  "id": "chatcmpl-...", "object": "chat.completion", "created": 1794986605,
  "model": "GPT-4o",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 5, "completion_tokens": 22, "total_tokens": 27 }
}
```

响应头：`X-RateLimit-Limit/Remaining/Reset`、`X-Quota-Limit/Remaining`。

处理顺序：Key 有效 → 用户启用 → 请求体合法 → 模型可用（未指定时按权重加权选择）→ 配额 → RPM/TPM → 模拟/转发上游 → 计量与日志。

错误：无/坏 Key `401`、停用用户 `403`、模型不可用 `404`/`400`、请求体非法 `400`、配额/限流 `429`。被拒绝请求也会写入审计日志（`status=unauthorized/error/quota_exceeded/rate_limited`，Token 记 0），但不累加配额用量。

`stream: true` 时返回 `text/event-stream`：

```
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"..."}}]}
data: [DONE]
```

流式结束后按同一份 usage 完成计量，响应与日志一致。

### 计量与配额

- 成功请求同时更新：`request_logs`（审计）、`usage_buckets`（15 分钟 × 模型聚合）、`token_usage`（用户/Key 的日/月累计）、`api_keys.last_used_at`。
- Dashboard 与流量摘要的请求量/Token/成功率以 `usage_buckets` 为准；近期请求/日志来自 `request_logs`。

## 10. 流量日志、分析与告警

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/traffic/logs` | `traffic.view` | 查询 `page,pageSize,status,userId,model,range,keyword`，时间倒序 |
| GET | `/api/traffic/summary` | `traffic.view` | `range=today|7d|30d`，请求/Token/成功率与 Dashboard 同源 |
| GET | `/api/traffic/rate-limit-events` | `traffic.view` | 最近限流/配额事件 |
| GET | `/api/analytics/dashboard` | `dashboard.view` | `range=today|7d|30d` 聚合 |
| GET | `/api/alerts` | `alerts.view` | 查询 `unreadOnly,page,pageSize` |
| GET | `/api/alerts/unread-count` | 登录 | `{unread}` |
| POST | `/api/alerts/{id}/read` | `alerts.manage` | 标记已读 |
| POST | `/api/alerts/read-all` | `alerts.manage` | 全部已读 |

`/api/analytics/dashboard` 响应结构：

```json
{
  "range": "today",
  "kpis": [
    {"id":"requests","label":"总请求量","value":128960,"display":"128,960","delta":12.5,"deltaUnit":"%","spark":[...],"tone":"blue","icon":"chat"},
    {"id":"tokens","label":"Token 使用量","value":1240000000,"display":"1.24B","delta":18.7,"deltaUnit":"%","spark":[...],"tone":"green","icon":"database"},
    {"id":"success","label":"成功率","value":99.2,"display":"99.2%","delta":0.1,"deltaUnit":"pp","spark":[...],"tone":"purple","icon":"check"}
  ],
  "trend": {
    "xLabels": ["00:00","04:00","08:00","12:00","16:00","20:00"],
    "total": [96 个数值], "success": [96 个数值],
    "yTicks": [0,500,1000,1500,2000,2500],
    "yLabels": {"0":"0","500":"500","1000":"1k","1500":"1.5k","2000":"2k","2500":"2.5k"}
  },
  "distribution": {"total":1240000000,"display":"1.24B","segments":[{"key":"gpt","name":"GPT-4o","percent":40.2,"color":"#518af6"}]},
  "recentRequests": [{"id":1,"time":"...","user":"user123","model":"GPT-4o","tokens":2048,"tokensDisplay":"2,048","status":"成功","statusKey":"success"}],
  "overview": {"users":128,"roles":5,"models":4,"uptimeDays":15},
  "alerts": {"unread":3}
}
```

- 今日趋势 96 个 15 分钟点、6 个 x 轴标签；7d 为 7 个点；30d 为 30 个点。
- 种子基线精确复现原型：今日 `128,960 / 1.24B / 99.2%`，分布 `40.2% / 32.6% / 18.1% / 9.1%`。真实网关流量会自然叠加。

## 11. 数据与重置

- 数据库：`backend/data/app.db`（SQLite / WAL），首次启动自动建表与种子。
- 重置为原型基线：

```bash
rm -f backend/data/app.db backend/data/app.db-wal backend/data/app.db-shm
bash backend/run.sh
```

- 种子开关：`backend/app/seed.py` 的 `SEED_VERSION`；修改种子内容后递增版本并删除 DB 重新初始化。

## 12. 健康检查与观测

```bash
curl -s http://127.0.0.1:8000/health
# {"status":"ok","database":"ok","version":"1.0.0","uptimeSeconds":42,"startedAt":"..."}
```

后端日志：`backend.log`（`bash start.sh` 启动时）。前端代理失败会在控制台页面显示可重试的错误态。
