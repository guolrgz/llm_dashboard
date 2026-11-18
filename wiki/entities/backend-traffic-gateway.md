---
title: 推理网关（POST /v1/chat/completions）
source_files:
  - backend/app/routers/traffic.py
  - backend/app/services/gateway.py
  - backend/app/services/metering.py
  - backend/app/services/rate_limit.py
  - backend/app/services/alerts.py
  - backend/app/security.py
updated: 2026-11-18
tags: [entity, backend, gateway]
---

> 所属模块：[[modules/backend]]

# 推理网关（`POST /v1/chat/completions`）

`routers/traffic.py` 里有**两个** router：`router` 挂在 `/api` 下做流量日志查询，另一个
`gateway_router` 不带前缀、直接暴露 `POST /v1/chat/completions`。本页只讲后者——它是整个系统
"治理 Token 流量"的执行点，顺序敏感、每个失败分支都要留审计痕迹。

## 用途与职责

- 用 API Key（而非 JWT）鉴权，接受 OpenAI Chat Completions 风格请求体。
- 按固定顺序判定：**Key 有效 → 用户启用 → 请求体合法 → 模型可用 → 配额 → 限流 → 转发/模拟 → 计量**。
- 失败也写 `request_logs`（Token 记 0），但不累加任何用量；成功才写 `usage_buckets`、
  `token_usage` 与 `api_keys.last_used_at`。
- 支持非流式 JSON 与 `stream=true` 的 SSE；两种模式都返回同一套 `usage` 与配额/限流响应头。

## 关键函数

| 名称 | 签名 / 位置 | 说明 |
|---|---|---|
| `chat_completions` | `async (request, authorization: str \| None = Header(None), conn=Depends(get_db))` | 唯一网关端点 |
| `fail` | 内嵌闭包 `(status, http_status, code, message, *, user_id, username, key_prefix, model, error_code, headers)` | 写失败日志 → `commit` → 抛 `ApiError` |
| `elapsed_ms` | 内嵌闭包 `() -> int` | 基于 `time.perf_counter()` |
| `_pick_model` | `(models) -> sqlite3.Row` | 按 `max(1, weight)` 加权 `random.choices` |
| `parse_range` / `range_start` / `log_item` | 同文件 | 供 `/api/traffic/*` 复用 |

依赖的服务：[[entities/backend-metering-rate-limit]]（计量/限流/上游）与
[[entities/backend-alerts]]（告警生成）。

## 请求处理顺序与错误

| 步骤 | 检查 | 失败结果 |
|---|---|---|
| 0 | `await request.json()`，必须是 JSON 对象 | 400 `validation_error` / `invalid_json` |
| 1 | `Authorization: Bearer` 且 Key 能在 `api_keys` 按哈希命中、`key_matches`、`status='active'` | 401 `unauthorized` / `invalid_api_key` |
| 2 | Key 对应用户存在（JOIN roles）且 `status='enabled'` | 401 `invalid_api_key` / 403 `user_disabled` |
| 3 | `messages` 非空数组，每项是带字符串 `role` 的对象，`content` 为 str/list；`stream` 为 bool；`max_tokens` 正整数；`temperature` 数字 | 400 `validation_error` |
| 4 | 指定 `model` 时须存在且 `status='enabled'`；未指定时从启用模型加权选一个 | 404 `model_not_found` / `model_unavailable`；无可用模型 404 |
| 5 | 日/月 Token 配额（`rate_limit.check_quota`） | 429 `quota_exceeded` + 配额头 |
| 6 | 60 秒窗口 RPM/TPM（`rate_limit.check_rate_limit`） | 429 `rate_limited` + `Retry-After` |
| 7 | 有 `upstream_base_url` 走 `gateway.forward_chat`，否则 `gateway.simulate_completion` | 502 `upstream_error` |
| 8 | 写成功日志 + 三处用量 + Key 最近使用时间；随后按 `stream` 返回 JSON 或 SSE | — |

第 3 步的校验顺序在 Key/用户之后，所以未授权请求拿不到字段级错误信息，只能拿到 401。

## 配额与限流响应头

- `X-Quota-Limit` = 日配额；`X-Quota-Remaining` = `max(0, 日配额 - 日已用)`。
- `X-RateLimit-Limit` = RPM；`X-RateLimit-Remaining` = RPM 剩余请求数；
  `X-RateLimit-Reset` = 距 60 秒窗口滑出首条请求的秒数。
- 限流时额外 `Retry-After`。这些头都在 `main.py` 的 CORS `expose_headers` 中，浏览器可读。
- 注意：配额头只反映**日**维度，月配额超限时 `X-Quota-Limit/Remaining` 仍是日维度的值。

## 数据与副作用

写入表（按分支）：

| 分支 | `request_logs` | `usage_buckets` / `token_usage` | `alerts` | `api_keys.last_used_at` |
|---|---|---|---|---|
| 成功 | `status=success` | 累加 | 可能触发配额阈值告警 | 更新 |
| 配额超限 | `status=quota_exceeded` | 不写 | 建 `quota.exceeded` 告警 | 不变 |
| 限流 | `status=rate_limited` | 不写 | 建 `rate_limit` 告警 | 不变 |
| 鉴权失败 | `status=unauthorized` | 不写 | 不建 | 不变 |
| 其他失败 | `status=error` | 不写 | 不建 | 不变 |

所有失败日志的 `total_tokens` 被强制为 0（在 `metering.log_request` 里），但
`http_status`、`error_code`、`latency_ms` 都会记录。

## 边界与错误处理

- `fail()` 先 `conn.commit()` 再抛错，保证审计日志不随异常回滚；这也是为什么网关的失败路径
  能留下记录，而普通路由的异常不会。
- 上游异常统一降级为 502 `upstream_error`，不区分超时/连接失败/非 200（细节在异常消息里）。
- `stream=true` 时先完成计量与提交，再构造 `StreamingResponse`；客户端中途断开不会回滚已记用量。
- 未指定 `model` 且所有渠道停用 → 404，不会回退到"任意模型"。
- 请求体不是合法 JSON 时也会写一条 `error` 日志（此时还没有用户信息，`user_id` 为 NULL）。

## 坑与注意点

- **请求体在鉴权之前解析**：未携带 Key 的请求也能触发 JSON 解析与后续校验；没有请求体大小限制，
  大 body 会先消耗内存/CPU。若在意，应把 Key 校验提前或用中间件限流。
- **429 会自我放大**：`fail()` 写的 `rate_limited` 日志同样落在 60 秒窗口里，而
  `window_stats` 不按状态过滤。客户端一旦被限流后持续重试，窗口里的请求数只增不减，实际封禁
  时间会超过 60 秒；正确做法是客户端遵守 `Retry-After`。
- **配额判定没有预扣**：请求开始前只看已用量，单次请求的 Token 只在成功后才累加，因此最后
  一次请求可以"越过"配额上限；下一次请求才会被拒。
- **同步 httpx 跑在 async 端点里**：`chat_completions` 是 `async def`，但
  `gateway.forward_chat` 用同步 `httpx.post`（超时 10s）。真实上游慢时会阻塞事件循环，
  影响同进程的其他请求；本项目的模拟上游没有这个问题。
- **流式并非真流式**：无论是否 `stream`，上游都按非流式请求，拿到完整内容后本地切 SSE 分块；
  首字节延迟等于完整生成时间，但计量与响应天然一致。
- **模型名大小写敏感**：`SELECT * FROM models WHERE name = ?` 精确匹配，`gpt-4o` 与 `GPT-4o`
  是不同模型；未命中直接 404。
- **告警去重会吞掉部分告警**：配额超限告警与计量后的阈值告警共用 `type`，10 分钟内同用户只留
  一条，详见 [[entities/backend-alerts]]。

## 相关页面

[[modules/backend]] · [[entities/backend-metering-rate-limit]] · [[entities/backend-alerts]] ·
[[entities/backend-security]] · [[entities/backend-admin-routes]] · [[concepts/token-governance]] ·
[[flows/gateway-request]]
