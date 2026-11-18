---
title: 计量与分析（两条数据事实与聚合口径）
source_files:
  - backend/app/services/metering.py
  - backend/app/routers/analytics.py
  - backend/app/routers/traffic.py
  - backend/app/seed.py
  - backend/app/db.py
updated: 2026-11-18
tags: [concept, metering, analytics, data-model]
---

# 计量与分析

## 这个概念解决什么问题

Dashboard、流量监控、配额判定、告警都依赖“用了多少 Token、发了多少请求”。系统里存在**两条互补的数据事实**，理解它们的口径差异是排查数字对不上的关键：

| 数据 | 表 | 粒度 | 用途 |
|---|---|---|---|
| 逐请求审计 | `request_logs` | 每次调用一行（含失败） | 请求日志页、近期请求、限流窗口统计、失败审计 |
| 用量聚合 | `usage_buckets` | 15 分钟 × 模型 | KPI、趋势、模型分布、流量摘要（与 Dashboard 同源） |
| 周期累计 | `token_usage` | 用户/Key × 日/月 | 配额判定、用户配额用量页 |
| 周期基线 | 种子写入 `usage_buckets` | 60 天历史 + 今日 96 个 15 分钟桶 | 首次启动即可展示原型基线 |

## 参与文件

| 文件 | 职责 |
|---|---|
| `backend/app/services/metering.py` | `log_request` / `record_failure` / `record_success` / `apply_usage` / `usage_for_user` |
| `backend/app/routers/analytics.py` | Dashboard 聚合：KPI、趋势、分布、近期请求、概览、spark |
| `backend/app/routers/traffic.py` | 流量摘要（与 Dashboard 同源）、日志筛选、限流事件 |
| `backend/app/seed.py` | 基线数据生成（原型数值 + 60 天历史 + 种子日志） |
| `backend/app/db.py` | 表结构与索引 |

## 写入路径（成功一次推理）

`metering.record_success()` 在同一事务内：

1. 向 `request_logs` 插入成功行（用户、Key 前缀、模型、prompt/completion/total、延迟、`status=success`、http 200）。
2. 向 `usage_buckets` 以“当前 15 分钟桶 + 模型”执行 upsert：`requests +1`、`success_requests +1`、Token 累加。
3. 向 `token_usage` 累加两个周期：`day:YYYY-MM-DD` 与 `month:YYYY-MM`，scope 同时写 `user` 与 `key`。
4. 更新 `api_keys.last_used_at`。
5. 网关路由随后调用 `maybe_quota_alerts()` 生成阈值/超限告警，最后 `conn.commit()`。

失败路径 `record_failure()` 只写 `request_logs`（`status=unauthorized/error/quota_exceeded/rate_limited`，`total_tokens=0`），不碰聚合与累计表。

## 聚合口径（Dashboard）

`GET /api/analytics/dashboard?range=today|7d|30d`：

- **时间范围**：`_validate_range` 只接受三个枚举（否则 400）；`_period_bounds` 计算当前周期与上一等长周期，用于环比。
- **数据源**：`_load_buckets` 从 `usage_buckets` 取区间行；`_totals` 汇总请求/成功/Token。
- **KPI**：总请求量、Token 使用量、成功率（成功/请求，保留 1 位小数）；`delta` 与上一周期比较（百分比，成功率为百分点差）。
- **趋势**：`today` 用 96 个 15 分钟桶（x 轴 6 个标签，每 4 小时）；`7d` 为 7 个日点、`30d` 为 30 个日点；`_ticks` 生成 5–6 个 nice y 刻度（今日 0–2.5k）。
- **分布**：按模型 Token 占比，前三模型（GPT-4o / Claude-3.5 / Qwen-Max）固定颜色，其余合并为“其他”（种子中的 DeepSeek-V3 即 9.1%）；合计 100%。
- **近期请求**：`request_logs` 最新 4 条（时间倒序），映射用户/模型/Token/状态。
- **系统概览**：用户总数、角色数、启用模型数、运行天数（`settings.system_started_at` 向下取整）。
- **spark**：`today` 优先读 `settings.spark_today`（原型 KPI sparkline 数组，保证像素基线）；其他范围由日序列采样生成。
- **告警未读数**：`alerts read=0` 计数。

流量监控页的 `/api/traffic/summary` 也改为 `usage_buckets` 同源聚合（Requests/Token/成功率与 Dashboard 一致），失败/限流/配额计数与平均延迟来自 `request_logs`——避免“Dashboard 128,960、流量页 109”这种口径矛盾。

## 原型基线如何复现

`seed.py` 在首次初始化时（`SEED_VERSION` 幂等）：

- 取 `index.png` 的 95 点曲线形状 → 缩放为今日 128,960 请求（96 个 15 分钟桶）；成功率目标 99.2%（127,928 成功）；Token 总量精确 1,240,000,000，按 40.2/32.6/18.1/9.1 分配并按请求比例摊到各桶；prompt:completion = 7:3。
- 生成 59 天历史桶（昨日精确取 114,631 请求 / 1,044,650,379 Token / 99.1% 成功率，使今日环比正好 12.5%/18.7%/0.1pp）。
- 写 4 条原型近期请求（user123 GPT-4o 2048、alice Claude 1024、bob Qwen 4096、admin GPT-4o 768）与 140 条样本日志。
- 真实网关请求在基线之上自然累加（会改变今日 KPI，属预期）。

## 坑与注意点

- **数据不一致是设计稿自带的**：趋势图日累计与 KPI 不自洽、成功率曲线与 99.2% 不自洽；系统选择数据一致性，见 [[concepts/design-fidelity]]。
- **近期请求只有 4 条**：来自 `request_logs` 最新行；种子样本 144 条，真实流量会插到前面。
- **7d/30d 环比可能接近 0**：历史日请求由确定性随机生成，量级相近；不是 bug。
- **模型删除/停用后历史保留**：`usage_buckets`/`request_logs` 不级联删除，分布仍可回看；新增模型会自然出现在分布里（超出前三名归“其他”）。
- **重置基线**：删除 `backend/data/app.db*` 重启即可重新种子（会丢失真实流量数据）。

## 相关页面

- [[entities/backend-metering-rate-limit]]、[[entities/backend-analytics]]、[[entities/backend-seed-data]]
- [[flows/gateway-request]]、[[flows/dashboard-aggregation]]、[[flows/alert-generation]]
- [[entities/frontend-dashboard-view]]、[[entities/frontend-charts]]、[[entities/frontend-traffic-view]]
