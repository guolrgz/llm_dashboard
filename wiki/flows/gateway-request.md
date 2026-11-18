---
title: 流程 — 推理网关请求生命周期
source_files:
  - backend/app/routers/traffic.py
  - backend/app/services/rate_limit.py
  - backend/app/services/gateway.py
  - backend/app/services/metering.py
  - backend/app/db.py
  - docs/api.md
updated: 2026-11-18
tags: [flow, gateway, token, metering]
---

# 推理网关请求生命周期

## 参与者

- 调用方：外部业务（`Authorization: Bearer sk-...`）或 `curl`/E2E
- 入口：[[entities/backend-traffic-gateway]]（`routers/traffic.py::chat_completions`）
- 服务：[[entities/backend-metering-rate-limit]]（`rate_limit` / `gateway` / `metering`）
- 数据：`api_keys`、`models`、`quota_policies`、`settings`、`token_usage`、`request_logs`、`usage_buckets`
- 告警：[[entities/backend-alerts]]（`maybe_quota_alerts` / `maybe_rate_limit_alert`）

## 步骤（按调用顺序）

### 0. 进入网关

开发态：浏览器/脚本请求 `http://127.0.0.1:5173/v1/chat/completions`，Vite proxy 转发到 `127.0.0.1:8000`；生产态直接访问后端或反向代理。请求体为 OpenAI Chat Completions 风格，`stream` 可选。

### 1. 请求体解析与格式校验

1. `await request.json()` 失败 → `fail("error",400,"validation_error","请求体不是合法 JSON")`。
2. 非对象 → 400。
3. 依次读取 `model`、`stream`、`max_tokens`、`temperature`、`messages`；`messages` 必须是非空数组、每项是含 `role` 的对象、`content` 为字符串或数组；`stream` 布尔；`max_tokens` 正整数；`temperature` 数字。任一项不合法 → 400，并写审计日志。

> `fail()` 是网关内部的统一出口：先 `metering.record_failure()` 写 `request_logs`（`total_tokens=0`），`commit()` 后抛 `ApiError`。因此**所有**失败路径都可审计。

### 2. API Key 鉴权

1. 无 `Authorization: Bearer ` → 401 `unauthorized`。
2. 提取原始 Key，`security.api_key_prefix()` 取前缀用于日志。
3. `hash_api_key()` 查 `api_keys.key_hash`，并用 `key_matches()` 常数时间比较；不匹配/已吊销/不存在 → 401 `invalid_api_key`。

### 3. 用户状态

Key 关联到 `users`；用户不存在 → 401；`status != enabled` → 403 `user_disabled`。

### 4. 模型选择

- 显式 `model`：查 `models.name`，不存在 → 404 `model_not_found`，停用 → 400/404。
- 未指定：从 `status='enabled'` 的模型里按 `weight` 加权随机（`_pick_model`），无可用模型 → 404。
- 记录实际使用的 `model`，用于日志与响应。

### 5. 配额校验

1. `rate_limit.resolve_limits(conn, user, key)` 合并策略：Key 级 → 用户级 → 角色级 → settings 默认（详见 [[concepts/token-governance]]）。
2. `check_quota()` 读 `token_usage` 的 `day:`/`month:` 累计，判断是否已达日/月配额。
3. 超限 → 429 `quota_exceeded`，带 `X-Quota-Limit`/`X-Quota-Remaining`；写失败审计，不累加用量。

### 6. RPM/TPM 限流

1. `check_rate_limit()` 统计 `request_logs` 中该 `key_prefix` 最近 60s 的请求数与 Token 数。
2. 超限 → 先 `maybe_rate_limit_alert()` 生成告警，再 429 `rate_limited` + `Retry-After` + `X-RateLimit-*`；写失败审计。

### 7. 上游调用 / 离线模拟

- `model_row.upstream_base_url` 非空 → `gateway.forward_chat()` 用 httpx 转发，透传上游 `usage`；网络/超时/非 200 → `UpstreamError` → 502 `upstream_error`。
- 否则 → `gateway.simulate_completion()`：prompt_tokens = `max(1, ceil(字符数/4))`，completion 由固定模板长度（可被 `max_tokens` 截断）确定，返回内容与 usage。

### 8. 成功计量（单事务）

`metering.record_success()`：

1. `request_logs` 插入成功行（延迟、模型、Token、`status=success`、200）；
2. `usage_buckets` 当前 15 分钟桶 × 模型 upsert（requests/success/tokens）；
3. `token_usage` 累加 user/key 的 `day:`/`month:`；
4. `api_keys.last_used_at`。

随后 `maybe_quota_alerts()` 按 settings 阈值生成阈值/超限告警，最后 `commit()`。详见 [[concepts/metering-analytics]]。

### 9. 响应

- 非流式：`gateway.build_completion_body()` 生成 OpenAI 兼容 JSON（`id/object/model/choices/usage`），响应头带配额与限流信息。
- `stream=true`：`gateway.build_sse_chunks()` 把同一份内容切成 `data: {...}` 块，`StreamingResponse(media_type="text/event-stream")`，最后 `data: [DONE]`。计量在第 8 步已完成，因此流式响应与日志一致。

## 失败矩阵

| 场景 | HTTP | code | 是否计量 |
|---|---|---|---|
| 非法 JSON/字段 | 400 | `validation_error` | 否（仅审计） |
| 无/坏/吊销 Key | 401 | `unauthorized` / `invalid_api_key` | 否 |
| 用户停用 | 403 | `user_disabled` | 否 |
| 模型不存在/停用 | 404/400 | `model_not_found` / `model_disabled` | 否 |
| 配额超限 | 429 | `quota_exceeded` | 否 |
| 限流 | 429 | `rate_limited` | 否 |
| 上游不可用 | 502 | `upstream_error` | 否 |
| 成功 | 200 | — | 是（日志 + 桶 + 累计） |

## 坑与注意点

- **顺序即契约**：鉴权在请求体校验前（无 Key 时不会泄露参数错误细节）；配额在限流前。
- **失败也写日志**：调试数字时注意 `request_logs` 含失败行，`usage_buckets` 只含成功。
- **配额校验是“调用前已用<配额”**：单次大请求可能短暂越界；后续请求会被拦。
- **流式不是真流式**：模拟/上游先算完再切块；真实上游流式被折叠，保证计量一致。
- **测试副作用**：E2E 网关用例会真实写库，验收后需重置 DB 回基线（[[concepts/testing-verification]]）。

## 相关页面

- [[concepts/token-governance]]、[[concepts/metering-analytics]]、[[concepts/security-posture]]
- [[entities/backend-traffic-gateway]]、[[entities/backend-metering-rate-limit]]、[[entities/backend-alerts]]
- [[flows/alert-generation]]、[[flows/dashboard-aggregation]]
- `docs/api.md`、`openspec/specs/traffic-gateway/spec.md`
