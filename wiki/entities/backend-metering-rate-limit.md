---
title: 计量、限流与上游服务（metering / rate_limit / gateway）
source_files:
  - backend/app/services/metering.py
  - backend/app/services/rate_limit.py
  - backend/app/services/gateway.py
  - backend/app/utils.py
  - backend/app/db.py
updated: 2026-11-18
tags: [entity, backend, metering]
---

> 所属模块：[[modules/backend]]

# 计量、限流与上游服务（`metering` / `rate_limit` / `gateway`）

`services/` 下三个无状态服务构成网关的执行引擎：`metering` 负责"记什么、记到哪"，
`rate_limit` 负责"这次请求该不该放行"，`gateway` 负责"回复从哪来、Token 怎么估"。
它们都不提交事务——提交时机由路由层掌握，以便把日志、用量、告警放进同一次事务。

## 计量（metering.py）

| 函数 | 签名要点 | 行为 |
|---|---|---|
| `bucket_start` | `(dt=None) -> datetime` | 向下取整到 15 分钟桶 |
| `bucket_key` | `(dt=None) -> str` | 桶起点的 `YYYY-MM-DD HH:MM:SS` |
| `log_request` | 关键字参数：status/http_status/user_id/username/key_prefix/model/三种 token/latency/error_code/source/ts | 写一条 `request_logs`；**非 success 时 total 强制 0** |
| `record_failure` | 同上（无 token 参数） | 失败审计，不写用量 |
| `apply_usage` | user_id/model/prompt/completion/key_id | upsert `usage_buckets` + `token_usage` + `api_keys.last_used_at` |
| `record_success` | 含 key_prefix/key_id/latency/source | `log_request` + `apply_usage`，返回总 token |
| `usage_for_user` | `(conn, user_id)` | 返回 `dayUsed/dayRequests/monthUsed/monthRequests` |
| `success_rate` / `percent` / `format_tokens` / `format_int` | 纯函数 | 供 analytics 与告警复用 |

`apply_usage` 的细节：

- `usage_buckets` 以 `(bucket_start, model)` 为唯一键 upsert，`requests` 与 `success_requests`
  **同时 +1**——因为只有成功的请求会走到这里。命名容易误解：表里的 `requests` 实际是
  "成功请求数"。
- `token_usage` 同时为 `scope='user'` 与 `scope='key'` 写 `day:YYYY-MM-DD` 与 `month:YYYY-MM`
  两个 period；配额判定只读 user scope。
- `api_keys.last_used_at` 只在带 `key_id` 时更新。
- 时间全部走 `utils.now()`（固定 UTC+8），聚合周期按本地自然日/自然月切分。

## 限流与配额（rate_limit.py）

| 函数 | 说明 |
|---|---|
| `settings_defaults(conn)` | 读 `settings` 的四项默认值，负数/非法回退硬编码默认 |
| `_policy(conn, scope, target_id)` | 读 `quota_policies` 一行并转 dict |
| `resolve_limits(conn, *, user_id, role_id, api_key)` | 合并四级策略，返回 `dailyQuota/monthlyQuota/rpm/tpm` |
| `check_quota(conn, user_id, limits)` | 读 user scope 日月用量；`dayUsed >= dayLimit` 优先判日 |
| `quota_headers(limits, quota)` | `X-Quota-Limit` / `X-Quota-Remaining`（仅日维度） |
| `window_stats(conn, key_prefix, now=None)` | 60 秒内该前缀的 `COUNT(*)`、`SUM(total_tokens)`、最早 `ts` |
| `check_rate_limit(conn, key_prefix, limits, now=None)` | RPM 优先于 TPM；返回 remaining/reset/used |
| `rate_headers` / `retry_after_headers` | `X-RateLimit-*` 与 `Retry-After` |

**策略优先级**（`resolve_limits.pick`，从高到低）：

1. `quota_policies(scope='key', target_id=key.id)`；
2. `api_keys` 行的 `rpm_limit/tpm_limit/daily_quota/monthly_quota`；
3. `quota_policies(scope='user')`；
4. `quota_policies(scope='role')`；
5. `settings` 默认值。

每一级都要求值非空且 ≥0，`0` 是合法值（表示"配额/限流为 0"，不是"未设置"）。

滑动窗口完全基于 `request_logs`，没有内存计数器：好处是重启不丢、多请求一致；代价是每次
网关请求多两次聚合查询，且**窗口统计包含失败请求**。

## 上游与模拟（gateway.py）

- `estimate_tokens(text) = max(1, ceil(len(text)/4))`；`estimate_prompt_tokens` 把所有
  `messages[].content` 稳定序列化后按字符数估算。这是**字符启发式**，不是真实 tokenizer。
- `completion_plan(max_tokens)` 用固定模板 `SIMULATED_CONTENT` 生成可复现输出，`max_tokens`
  只截断不放大；`simulate_completion` 返回 `content/promptTokens/completionTokens/totalTokens`。
- `build_completion_body` 产出 OpenAI 兼容的 `chat.completion`；`build_sse_chunks` 把同一份
  内容按 8 字符切块，逐条 `data: {...}`，最后 `data: [DONE]`，并在末块附 `usage`。
- `forward_chat(model_row, payload)`：`upstream_url` 自动补 `/chat/completions`，带
  `Authorization: Bearer <upstream_api_key>`，**强制 `stream=False`**；上游 `usage` 合法就透传，
  否则用本地估算；非 200/网络错误/非 JSON 抛 `UpstreamError`。
- `post_upstream` 是薄封装，测试可 monkeypatch 它来注入假上游。
- `new_completion_id()` 生成 `chatcmpl-` + 24 位 hex；`now_seconds()` 返回 `created` 所需的
  epoch 秒。

## 调用链

```
traffic.chat_completions
  ├─ security.hash_api_key / key_matches
  ├─ rate_limit.resolve_limits → check_quota → check_rate_limit
  │      └─ metering.usage_for_user / window_stats
  ├─ gateway.forward_chat / simulate_completion
  └─ metering.record_success
         ├─ log_request → request_logs
         └─ apply_usage → usage_buckets + token_usage + api_keys
```

## 数据与副作用

- 写：`request_logs`（每次）、`usage_buckets`、`token_usage`、`api_keys.last_used_at`（仅成功）。
- 读：`settings`、`quota_policies`、`api_keys`、`token_usage`、`request_logs`、`models`。
- 所有写操作不提交；由 `traffic` 路由的 `conn.commit()` 统一落盘，保证"日志+用量+告警"原子。

## 边界与错误处理

- `check_quota` 的 `dayLimit=0` 会让任何请求（含 0 用量）都判超限；策略里的 0 是"禁止"而非
  "不限"。
- `window_stats` 在 `key_prefix` 为空时直接返回 `{count:0, tokens:0, reset:60}`，不会误伤。
- `forward_chat` 对缺失/非法 `usage` 静默回退估算，不报错；只有 HTTP/JSON 层失败才抛
  `UpstreamError`。
- `upstream_error_to_api_error` 定义了但网关路由没有使用——路由自己拼了 502 的
  `ApiError`，两者消息格式略有差异。

## 坑与注意点

- **限流窗口把失败请求也算进去**：`window_stats` 不过滤 `status`，所以 429 自身会占 RPM 名额，
  形成自我放大的限流（见 [[entities/backend-traffic-gateway]]）。
- **RPM 与 TPM 都只看成功请求的 Token**：失败行 `total_tokens=0`，TPM 只能被成功流量推高；
  另外 TPM 判定发生在当前请求计量之前，单请求可以显著越过 TPM。
- **`window_stats` 的 `reset` 用 `utils.now()` 而不是入参 `now`**：传入自定义时间做测试时，
  reset 仍按真实时钟计算，断言容易不稳定。
- **两套优先级实现**：`keys._resolve_limits`（Key 列 > 用户 > 角色 > 默认，忽略 Key 级策略）与
  这里（Key 级策略优先）不一致，导致 Key 详情页与网关实际限流值可能不同。
- **字符估算对中文偏差大**：`len/4` 按英文经验校准，中文文本 1 字≈1 token，模拟上游会显著
  低估中文 prompt 的 Token；真实上游有 `usage` 时会透传，不受影响。
- **`usage_buckets.requests` 只增成功数**：任何"总请求/失败数"推断都要意识到这一点，
  真实流量下它与 `success_requests` 永远相等。
- **`bucket_start` 用本地时间 replace**：跨时区部署时桶边界随 `utils.LOCAL_TZ` 固定为 UTC+8，
  与服务器时区无关，这是刻意选择。
- **模拟上游没有随机性**：同一输入永远同一输出，便于测试与演示，但不能用来压测真实 Token 分布。

## 相关页面

[[modules/backend]] · [[entities/backend-traffic-gateway]] · [[entities/backend-analytics]] ·
[[entities/backend-alerts]] · [[entities/backend-admin-routes]] · [[entities/backend-db-schema]] ·
[[concepts/token-governance]] · [[concepts/metering-analytics]] · [[flows/gateway-request]]
