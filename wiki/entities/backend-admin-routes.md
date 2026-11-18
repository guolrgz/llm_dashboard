---
title: 治理面管理路由（模型 / Key / 配额 / 设置 / 告警）
source_files:
  - backend/app/routers/models.py
  - backend/app/routers/keys.py
  - backend/app/routers/quota.py
  - backend/app/routers/settings.py
  - backend/app/routers/alerts.py
  - backend/app/services/rate_limit.py
  - backend/app/config.py
updated: 2026-11-18
tags: [entity, backend, admin]
---

> 所属模块：[[modules/backend]]

# 治理面管理路由（模型 / Key / 配额 / 设置 / 告警）

这五个路由是控制台"治理面"的后端：模型渠道、API Key、配额策略、系统设置、告警列表。
它们共享同一套模式——`dict` 请求体、手写校验、显式 `commit()`、统一 `ApiError`——但各自
在"只写不读的密钥""策略优先级""默认值物化"上有不同的取舍。

## 端点总览

| 方法 | 路径 | 权限 | 要点 |
|---|---|---|---|
| GET | `/api/models` | `models.view` | 上游密钥只返回 `hasUpstreamKey` + 掩码 |
| POST | `/api/models` | `models.manage` | 201；`name` 唯一 |
| PUT | `/api/models/{id}` | `models.manage` | 局部更新；`upstreamApiKey` 空串=保持原值 |
| DELETE | `/api/models/{id}` | `models.manage` | 204；历史统计保留 |
| POST | `/api/models/{id}/status` | `models.manage` | 启停 |
| GET | `/api/keys` | `keys.view` | `userId` 可选；不分页，只返回 `keyPrefix` |
| POST | `/api/keys` | `keys.manage` | 201；明文 `apiKey` 仅此一次 |
| GET | `/api/keys/{id}` | `keys.view` | Key + `usage`（日/月已用、配额、剩余） |
| DELETE | `/api/keys/{id}` | `keys.manage` | 204；置 `revoked` + `revoked_at` |
| POST | `/api/keys/{id}/rotate` | `keys.manage` | 换哈希/前缀，重置为 active |
| GET | `/api/quota/policies` | `quota.view` | `{defaults, items}`，含 `alertThreshold` |
| PUT | `/api/quota/policies/{scope}/{targetId}` | `quota.manage` | `scope=user\|role\|key`，upsert |
| GET | `/api/quota/usage` | `quota.view` | 按用户汇总日月用量与百分比 |
| GET | `/api/settings` | `settings.view` | 含 `systemStartedAt`、`uptimeDays` |
| PUT | `/api/settings` | `settings.manage` | 局部更新，写 `settings` 表 |
| GET | `/api/alerts` | `alerts.view` | 分页、`unreadOnly`、全局未读数 |
| GET | `/api/alerts/unread-count` | 仅登录 | 供顶栏徽标轮询 |
| POST | `/api/alerts/read-all` | `alerts.manage` | 全部置已读 |
| POST | `/api/alerts/{id}/read` | `alerts.manage` | 单条置已读；不存在 404 |

## 关键实现

### 模型渠道（models.py）

`_serialize_model` 把 `upstream_api_key` 转成 `hasUpstreamKey` 与 `upstreamKeyMasked`
（长度 ≤6 时全 `******`，否则前 3 + `****` + 后 4）。`_number` 统一校验非负数字，`weight`
被强制为整数。创建时 `displayName` 缺省取 `name`、`weight` 缺省 10。更新时只有 payload
中出现的字段才进 `UPDATE`，且空的 `upstreamApiKey` **不会清空**已有密钥——因为接口从不回显
明文，前端无法区分"没改"与"要清空"，这里选择了保守语义。

### API Key（keys.py）

- 明文只出现在 `create_key` 与 `rotate_key` 的响应；库中只有 `sha256(plaintext)` 和
  `sk-` + 8 字符前缀。
- `_resolve_limits(conn, key_row, user_id, role_id)` 的优先级是
  **`api_keys` 列 > 用户级 `quota_policies` > 角色级 `quota_policies` > `settings` 默认值**。
- **创建时把解析结果物化进 `api_keys` 四列**：未显式传的 `rpmLimit/tpmLimit/dailyQuota/
  monthlyQuota` 会用当时的用户/角色/默认策略填满。之后改系统设置不会追溯已有 Key。
- `_key_usage` 优先读 `token_usage(scope='key')`；若日/月两个周期都没有记录，退化为按
  `key_prefix` 在 `request_logs` 里汇总 `status='success'` 的 `total_tokens`。
- `rotate` 会把已吊销的 Key 重新激活（`status='active'`, `revoked_at=NULL`），等于"换新密钥并恢复"。

### 配额策略（quota.py）

- `VALID_SCOPES = ("user", "role", "key")`；`_target_exists` 先按 scope 映射到
  `users/roles/api_keys` 再校验 id，表名来自固定字典，不存在 SQL 注入面。
- payload 里出现某字段才处理：数字走 `_non_negative_int`；`null` 或空串表示"清空该字段"，
  让该维度回落到下一级策略。
- 不存在策略行时 `INSERT`，把未提供的字段置 NULL；已存在且有字段时 `UPDATE ... updated_at`；
  已存在但 payload 为空对象时不写库，直接返回现值。
- `defaults` 来自 `settings` 的同名键，缺省回退 `config` 常量；`alertThreshold` 也会返回。

### 系统设置（settings.py）

`FIELD_TO_SETTING` 建立 JSON 字段与 `settings.key` 的映射：`siteName`→`site_name`、
四项默认配额/限流、`alertThreshold`→`alert_threshold`。`_read_settings` 额外计算
`uptimeDays = (now - system_started_at) // 86400`，`systemStartedAt` 只读（无字段可改）。
`alertThreshold` 必须落在 `[0, 1]`，否则 400；`siteName` 不允许空串。写入使用
`db.set_setting`，全部改完只 `commit` 一次。

### 告警列表（alerts.py）

`ALERT_SELECT` 用 `LEFT JOIN users` 带出 `username`（用户已删也能显示告警）。列表按
`created_at DESC, id DESC` 排序，返回 `items/unread/total/page/pageSize`。详情与告警生成逻辑
见 [[entities/backend-alerts]]。

## 数据与副作用

- `models`：写渠道配置；删除不影响 `usage_buckets`/`request_logs`（它们按模型名字符串存储）。
- `api_keys`：签发/吊销/轮换/`last_used_at`（由计量服务更新）。
- `quota_policies`：三级覆盖策略；网关在每次请求时实时合并。
- `settings`：默认配额、RPM/TPM、告警阈值、站点名；`system_started_at` 由种子写入。
- `alerts`：已读状态变更。

## 边界与错误处理

| 场景 | 结果 |
|---|---|
| 模型名重复 / 名称为空 / 数字非法 | 409 / 400 |
| Key 的 `userId` 非整数或用户不存在 | 400 / 404 |
| Key 的四项限制为负 | 400 |
| 策略 scope 非法 / 目标不存在 | 400 / 404 |
| `alertThreshold` 越界或非数字 | 400 |
| 告警 id 不存在 | 404 |

## 坑与注意点

- **Key 详情与网关的优先级不一致**：`keys._resolve_limits` 只看 `api_keys` 列，不看
  `quota_policies(scope='key')`；网关的 `rate_limit.resolve_limits` 会优先读 Key 级策略。
  于是管理员给某个 Key 设了 Key 级策略后，网关按新值限流，但 Key 详情页显示的配额仍是旧值。
- **默认值物化导致"改设置不生效"**：已有 Key 的四项限制在创建时已写死；改
  `default_rpm`/`default_daily_quota` 只影响之后新建的 Key 和没有 Key 列覆盖的判定路径。
- **上游密钥明文入库**：`models.upstream_api_key` 是明文（只对 API 响应做掩码），DB 泄露即
  上游凭证泄露；也没有轮换审计。
- **删除模型不校验引用**：正在被客户端使用的模型名被删后，网关返回 404 `model_not_found`；
  若请求未指定 `model`，则从剩余启用模型中按权重随机选。
- **`/api/keys` 无分页**：返回全部 Key，用户量大时响应会线性膨胀；前端按 `userId` 过滤。
- **告警未读数是全局的**：任何登录用户看到同一个数字，且普通 viewer 没有 `alerts.view`，
  顶栏徽标却能通过仅登录的 `unread-count` 拿到数字（详见 [[entities/backend-alerts]]）。
- **设置没有重置接口**：改错只能再 PUT 一次或删库重种子；`system_started_at` 无法通过 API 调整。

## 相关页面

[[modules/backend]] · [[entities/backend-traffic-gateway]] · [[entities/backend-alerts]] ·
[[entities/backend-metering-rate-limit]] · [[entities/backend-db-schema]] ·
[[concepts/token-governance]] · [[concepts/security-posture]]
