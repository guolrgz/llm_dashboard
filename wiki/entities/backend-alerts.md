---
title: 告警路由与告警生成服务（alerts）
source_files:
  - backend/app/routers/alerts.py
  - backend/app/services/alerts.py
  - backend/app/routers/traffic.py
  - backend/app/routers/analytics.py
  - backend/app/services/metering.py
updated: 2026-11-18
tags: [entity, backend, alerts]
---

> 所属模块：[[modules/backend]]

# 告警路由与告警生成服务（alerts）

告警分两半：`services/alerts.py` 在网关路径上"按需生成"告警（配额阈值、配额超限、限流），
`routers/alerts.py` 把 `alerts` 表读出来供控制台展示与标记已读。生成侧不提交事务，由网关的
成功/失败事务统一落盘；读取侧是纯查询 + 已读状态更新。

## 端点与权限

| 方法 | 路径 | 函数 | 权限 |
|---|---|---|---|
| GET | `/api/alerts` | `list_alerts(unreadOnly=False, page=1, pageSize=10)` | `alerts.view` |
| GET | `/api/alerts/unread-count` | `unread_count()` | 仅需登录（`get_current_user`） |
| POST | `/api/alerts/read-all` | `read_all_alerts()` | `alerts.manage` |
| POST | `/api/alerts/{alert_id}/read` | `read_alert(alert_id)` | `alerts.manage` |

`list_alerts` 支持 `unreadOnly=true` 只返回未读；分页由 `utils.paginate` 归一（page ≥1，
pageSize 1–100）；排序 `created_at DESC, id DESC`；`ALERT_SELECT` 用 `LEFT JOIN users` 带出
`username`，用户被删后 `username` 为 `null` 但告警仍可见。响应含全局 `unread` 计数。

## 告警生成服务

| 名称 | 签名 / 值 | 说明 |
|---|---|---|
| `DEDUPE_MINUTES` | `10` | 同 type + 同用户的去重窗口 |
| `LEVEL_INFO/WARNING/ERROR` | `"info"/"warning"/"error"` | 告警级别 |
| `alert_threshold(conn)` | `-> float` | 读 `settings.alert_threshold`；`>1` 时按百分数 /100；最终 clamp 到 `[0,1]` |
| `create_alert(conn, *, type, level, title, message="", user_id=None, dedupe_minutes=10)` | `-> int \| None` | 去重窗口内已存在则返回 `None`，否则插入并返回 id；**不 commit** |
| `maybe_quota_alerts(conn, *, user_id, username, limits, usage=None)` | `-> list[int]` | 日/月两个周期分别判"超限"或"达阈值" |
| `maybe_rate_limit_alert(conn, *, user_id, username, key_prefix, reason, used, limit)` | `-> int \| None` | `reason` 为 `rpm`/`tpm`，生成 `rate_limit` 告警 |

`maybe_quota_alerts` 的判定顺序（每个周期独立）：

- `limit <= 0` → 跳过（0 视为"未配置/禁止"，不生成告警）。
- `used >= limit` → `type="quota.exceeded"`、`level="error"`，标题"Token {日|月}配额已超限"。
- 否则 `used / limit >= alert_threshold` → `type="quota.warning"`、`level="warning"`。

`maybe_rate_limit_alert` 生成 `type="rate_limit"`、`level="info"`，标题区分 `RPM`/`TPM`，消息里
带 Key 前缀与 `used / limit`。

## 去重逻辑

`create_alert` 在插入前执行：

```sql
SELECT id FROM alerts
WHERE type = ? AND COALESCE(user_id, 0) = COALESCE(?, 0) AND created_at >= ?
LIMIT 1
```

时间下界是 `now - dedupe_minutes`。命中则直接返回 `None`，调用方拿不到新 id。去重键只有
`type + 用户`，**不区分日/月、也不区分具体 Key**。

## 调用链与副作用

```
网关成功
  └─ metering.record_success → usage_for_user → maybe_quota_alerts
       └─ create_alert（quota.warning / quota.exceeded）

网关配额超限分支
  └─ create_alert(quota.exceeded) → fail() → record_failure + commit

网关限流分支
  └─ maybe_rate_limit_alert(rate_limit) → fail() → record_failure + commit

控制台
  └─ /api/alerts → alerts 表查询；/read、/read-all → UPDATE alerts SET read=1
```

写表：仅 `alerts`。读表：`alerts`、`users`、`settings`（阈值）。`/api/analytics/dashboard` 与
`/unread-count` 都直接 `COUNT(*) WHERE read = 0`，不经过本服务。

## 边界与错误处理

| 场景 | 结果 |
|---|---|
| 告警 id 不存在 | 404 `not_found`（消息含 id） |
| `page`/`pageSize` 越界 | FastAPI 422（Query 约束），被统一处理器转成 `validation_error` |
| 阈值写成 `80` | `alert_threshold` 自动 /100，按 80% 处理 |
| 阈值写成 `-1` 或 `2` | clamp 到 `0` 或 `1`；写接口本身会拒绝越界值，但直接改库可能触发 |
| `user_id=None` 的系统告警 | 去重时按 `0` 参与比较，即所有系统级同 type 告警共享一个窗口 |

## 坑与注意点

- **日/月告警共享 type，会互相去重**：`quota.warning` 同时用于日配额与月配额，且
  `maybe_quota_alerts` 先处理"日"、再处理"月"。若一次请求同时越过日/月阈值，月中那条会被
  10 分钟窗口吞掉；`quota.exceeded` 同理。告警标题里的"日/月"因此可能缺失一半。
- **网关的配额超限告警与计量后的阈值告警也共享 `quota.exceeded`**：被拒绝的请求先建一条，
  同用户 10 分钟内的后续超限只会更新用量、不再新增告警。
- **未读数是全局的**：`/api/alerts/unread-count` 只要求登录，所有账号看到同一个数字；
  而 `alerts.view` 才能看列表，viewer 角色会出现"有徽标、点进去 403"的体验落差。
- **没有按用户过滤**：告警列表返回全系统告警，`user_id` 只是关联字段；普通用户也能看到别人
  的配额告警（前提是有 `alerts.view`）。
- **告警只增不删**：没有清理/归档接口，`read-all` 只是置位；长时间运行后表会持续增长。
- **上游失败不告警**：`upstream_error`、`unauthorized` 只写审计日志，不生成告警；排查上游
  故障要看 `/api/traffic/logs`。
- **阈值语义是"达到即告警"**：`ratio >= threshold`，默认 0.8 表示用到 80% 就产生 warning；
  而超限告警要 `used >= limit`，两者之间有 20% 的"预警区"。
- **`create_alert` 不提交**：如果调用方忘记 `commit`，告警会随连接关闭丢失；目前所有调用点都在
  网关的提交路径上。

## 相关页面

[[modules/backend]] · [[entities/backend-traffic-gateway]] · [[entities/backend-metering-rate-limit]] ·
[[entities/backend-admin-routes]] · [[entities/backend-analytics]] · [[concepts/token-governance]] ·
[[flows/alert-generation]]
