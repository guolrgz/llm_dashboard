---
title: Token 治理（配额、限流与网关准入）
source_files:
  - backend/app/routers/traffic.py
  - backend/app/services/rate_limit.py
  - backend/app/services/gateway.py
  - backend/app/routers/keys.py
  - backend/app/routers/quota.py
updated: 2026-11-18
tags: [concept, gateway, quota, rate-limit]
---

# Token 治理：配额、限流与网关准入

## 这个概念解决什么问题

“Token 流量管理”的核心不是展示图表，而是**对每一次推理调用做准入与记账**：调用方是否有权、模型是否可用、这个用户/Key 今天还剩多少 Token、当前每分钟是否超速，以及成功/失败是否都留下可审计的痕迹。这些判断集中在推理网关 `POST /v1/chat/completions` 里，按固定顺序执行。

## 参与文件

| 文件 | 职责 |
|---|---|
| `backend/app/routers/traffic.py` | 网关入口 `chat_completions`：准入顺序、错误响应、响应头、SSE |
| `backend/app/services/rate_limit.py` | 配额策略合并、60s 滑动窗口 RPM/TPM、响应头构造 |
| `backend/app/services/gateway.py` | 离线确定性模拟上游、真实上游 httpx 转发、SSE 分块与响应体构造 |
| `backend/app/routers/keys.py` / `quota.py` | Key 生命周期与策略管理（管理面） |
| `backend/app/db.py` | `api_keys`、`quota_policies`、`request_logs`、`token_usage` 等表 |

## 准入顺序（不可随意调整）

`chat_completions` 内部按以下顺序处理，任何一步失败都会写审计日志并返回对应错误：

1. **解析请求体**：非法 JSON / 非对象 → 400 `validation_error`。
2. **API Key**：`Authorization: Bearer sk-...` → `sha256` 查 `api_keys.key_hash`，必须 `status=active` 且哈希匹配；否则 401 `invalid_api_key`。
3. **用户状态**：Key 对应用户必须存在且 `status=enabled`；否则 403 `user_disabled`。
4. **请求体校验**：`messages` 非空数组、每项含 `role`、`content` 为字符串/数组，`stream` 为布尔、`max_tokens` 为正整数、`temperature` 为数字；否则 400。
5. **模型可用性**：显式 `model` 时必须存在且启用；未指定时从启用模型中按 `weight` 加权随机选择（`_pick_model`）；无可用模型 → 404。
6. **Token 配额**：`rate_limit.resolve_limits()` 合并策略 → `check_quota()` 比较 `token_usage` 的 `day:`/`month:` 累计；超限 → 429 `quota_exceeded`（带 `X-Quota-*` 响应头）。
7. **RPM/TPM 限流**：`check_rate_limit()` 统计 `request_logs` 中该 `key_prefix` 最近 60s 的请求数与 Token 数；超限 → 429 `rate_limited` + `Retry-After`。
8. **上游**：模型配置了 `upstream_base_url` 时用 `gateway.forward_chat()` 转发并透传 `usage`；否则 `gateway.simulate_completion()` 生成确定性结果。上游异常 → 502 `upstream_error`。
9. **计量**：`metering.record_success()` 写 `request_logs` + `usage_buckets` + `token_usage` + `api_keys.last_used_at`；随后 `maybe_quota_alerts()` 检查告警。
10. **响应**：非流式返回 OpenAI 兼容 JSON；`stream=true` 用 `StreamingResponse` 输出 SSE（以 `data: [DONE]` 结束），响应头带配额/限流信息。

**失败请求**（401/403/400/404/429/502）同样写 `request_logs`（`status` 区分为 `unauthorized` / `error` / `quota_exceeded` / `rate_limited`），但 `total_tokens=0` 且不累加用量——保证“审计完整、计量不虚增”。

## 配额策略的优先级

`rate_limit.resolve_limits()` 的合并顺序（高 → 低）：

1. **Key 级**：`quota_policies(scope='key')` 优先于 `api_keys` 行内固化的 `rpm_limit/tpm_limit/daily_quota/monthly_quota`；
2. **用户级**：`quota_policies(scope='user', target_id=user_id)`；
3. **角色级**：`quota_policies(scope='role', target_id=role_id)`；
4. **系统默认**：`settings` 中的 `default_daily_quota / default_monthly_quota / default_rpm / default_tpm`。

空值逐级回落，最终必有默认值。**注意**：演示 Key 的配额在种子时已固化到 `api_keys` 行，因此“改用户策略”不会影响该 Key；要演示配额超限应改 Key 级策略或新建 Key（新 Key 创建时按用户策略回填）。

## 滑动窗口限流

- 窗口 60 秒，按 `key_prefix` 统计 `request_logs`：`window_stats()` 返回窗口内请求数、Token 数、窗口起点。
- RPM 判定 `count >= rpm`，TPM 判定 `tokens >= tpm`；`check_rate_limit()` 同时给出 `remaining` 与 `reset`。
- 429 响应带 `Retry-After`（秒）与 `X-RateLimit-*`。
- 设计取舍：统计包含被拒请求（重试风暴会被持续限流保护）；单实例内存+SQLite 实现，重启后窗口清零；多实例需 Redis 等共享计数。

## 响应头约定

| 头 | 含义 |
|---|---|
| `X-Quota-Limit` / `X-Quota-Remaining` | 当前周期（日/月）配额上限与剩余 |
| `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` | RPM/TPM 窗口上限、剩余、重置秒数 |
| `Retry-After` | 429 时建议等待秒数 |

CORS 在 `main.py` 里通过 `expose_headers` 暴露这些头，前端/业务方才能读到。

## 坑与注意点

- **配额校验发生在计量之前**：一次请求的 Token 数在调用前未知，因此按“当前已用 < 配额”放行；单次超大请求可能略微越过上限（可接受，后续请求会被拦截）。
- **流式先计量后输出**：模拟/上游结果先在服务端算完 usage，再切 SSE 输出，保证响应与日志一致；真实上游的流式被折叠为“先拿完整结果再本地切块”。
- **API Key 明文不落库**：只存 sha256 与前缀；日志里也只记录 `key_prefix`，排障时不要试图从库里找回明文。
- **默认演示 Key 是已知明文**（`sk-demo-*`），仅用于本地演示；生产必须轮换/禁用。
- 与 `POST /v1/embeddings` 无关：该接口在规格里标注为可选，当前未实现。

## 相关页面

- [[entities/backend-traffic-gateway]]、[[entities/backend-metering-rate-limit]]、[[entities/backend-admin-routes]]
- [[flows/gateway-request]]、[[flows/alert-generation]]
- [[concepts/metering-analytics]]、[[concepts/security-posture]]
- 规格：[[concepts/openspec-workflow]]、`openspec/specs/traffic-gateway/spec.md`、`openspec/specs/api-key-quota/spec.md`
