---
title: 种子数据（backend/app/seed.py）
source_files:
  - backend/app/seed.py
  - backend/app/db.py
  - backend/app/catalog.py
  - backend/app/config.py
  - backend/app/security.py
updated: 2026-11-18
tags: [entity, backend, seed]
---

> 所属模块：[[modules/backend]]

# 种子数据（`backend/app/seed.py`）

`seed.py` 是"产品原型即数据基线"的落地：它把设计稿 `index.png` 的 KPI、趋势形状、模型占比、
近期请求、128 用户/5 角色/4 模型/15 天运行时长、3 条未读告警写进空库，并让真实网关流量在同一批
表上自然叠加。首次启动（或删库后）由 `db.init_db` 调用，之后系统即拥有一个"看起来像原型、
跑起来像真系统"的初始状态。

## 入口与幂等机制

```python
SEED_VERSION = "2026-11-18.1"

def ensure_seed(conn) -> None:
    # 读 settings.seed_version，等于当前版本则直接 return
    _seed_catalog(conn)      # 权限 + 角色 + 角色权限绑定
    _seed_users(conn)        # 128 个用户（含 48 个设计稿用户）
    _seed_models(conn)       # 4 个模型渠道
    _seed_settings(conn)     # 默认配额/阈值/启动时间/spark_today
    _seed_api_keys_and_quota(conn)  # 2 个演示 Key + 用户级配额
    _seed_usage(conn)        # 60 天 usage_buckets + 4 个用户的 token_usage
    _seed_request_logs(conn) # 140 条随机日志 + 原型里的 4 行
    _seed_alerts(conn)       # 5 条告警（3 条未读）
```

每个子 seeder 自己也有"已存在则跳过"的守卫（多数是 `COUNT(*) > 0`），因此正常启动时不会重复
插入。版本号写在 `settings.seed_version` 与 `app_meta.seed_version` 两处。

## 关键常量与基线

| 常量 / 数据 | 值 | 用途 |
|---|---|---|
| `TODAY_REQUESTS` | `128_960` | 今日 KPI「总请求量」 |
| `TODAY_TOKENS` | `1_240_000_000` | 今日 KPI「Token 使用量」 |
| `TODAY_SUCCESS_RATE` | `0.992` | 今日 KPI「成功率」 |
| `YESTERDAY_REQUESTS` / `TOKENS` / `RATE` | `114_631` / `1_044_650_379` / `0.991` | 构造 +12.5% / +18.7% / +0.1pp 环比 |
| `MODEL_TOKEN_SHARES` | GPT-4o 40.2%、Claude-3.5 32.6%、Qwen-Max 18.1%、DeepSeek-V3 9.1% | 模型分布（前 3 + "其他"） |
| `DESIGN_REQUESTS` | 95 个 15 分钟采样 | 今日趋势形状（缩放到 128,960） |
| `DESIGN_SPARKS` | 33–34 点 × 3 组 | 写入 `settings.spark_today`，供 KPI 卡片 |
| `BASE_USERS` | 48 个 | 与 `users.jpg`/历史静态页一致；其余 80 个生成 |
| `MODELS` | 4 个 | 上游地址/密钥留空 → 默认走离线模拟 |

演示凭据：所有种子账号密码都是 `admin123`（同一个 PBKDF2 哈希复用）；演示 Key 为
`sk-demo-admin-2026`（admin，RPM 120 / TPM 500k / 日 5M / 月 200M）与
`sk-demo-user123-2026`（user123，RPM 30 / TPM 20k / 日 2M / 月 50M）。后者的日用量被种成
1,850,000，正好是 2,000,000 的 92.5%，用于复现"配额预警"告警与前端演示。

## 数据分布

- `usage_buckets`：59 个历史日按小时桶 + 今日 96 个 15 分钟桶；每桶按模型份额拆
  requests/success/tokens，prompt 固定占 70%。历史日用 `random.Random(20240522)` 生成，
  昨日精确取 `YESTERDAY_*`，因此 7d/30d 环比稳定可复现。
- `token_usage`：只给 `admin`、`user123`、`alice`、`bob` 四个用户写日/月用量；其余用户从 0 开始。
- `request_logs`：140 条随机记录（状态池共 101 项：92 个 `success` + 9 个失败，按池随机抽取；
  时间在 1–20 小时前）+ 原型表格里的 4 条最新记录；`key_prefix` 统一为 `sk-seed000`，
  `source='seed'`。
- `alerts`：5 条（3 条未读），覆盖 `quota.warning`、`rate_limit`、`system` 三种 type。
- 配额策略：两个演示用户各一条 `quota_policies(scope='user')`，与 Key 列值一致。

`_largest_remainder(total, weights)` 是全局的取整工具：按权重分整数配额并保证总和精确等于
`total`，这是"KPI 精确复现原型"的关键——避免逐桶四舍五入后累计偏差。

## 调用链与副作用

```
db.init_db(with_seed=True)
  └─ seed.ensure_seed(conn)
       ├─ 读 settings.seed_version（版本相同 → return）
       ├─ 各 seeder（INSERT OR IGNORE / INSERT OR REPLACE / executemany）
       └─ 写 app_meta.seed_version
```

写入表：`permissions`、`roles`、`role_permissions`、`users`、`models`、`settings`、
`api_keys`、`quota_policies`、`usage_buckets`、`token_usage`、`request_logs`、`alerts`、
`app_meta`。种子结束后 `init_db` 统一 `commit`。

## 边界与错误处理

- 版本相同则**完全跳过**，不做任何修复；`SEED_VERSION` 是唯一的开关。
- 所有 seeder 都对"已有数据"宽容：用户/模型/Key 用 `INSERT OR IGNORE`，用量与日志用
  `COUNT(*) > 0` 守卫，因此部分种子失败后重跑不会补齐缺失行。
- 种子依赖 `roles` 已先插入（`_seed_users` 先查 `role_ids`），顺序写死在 `ensure_seed` 里。
- 时间全部基于 `utils.now()`（UTC+8），"今日"取决于运行机器的本地日期换算。

## 坑与注意点

- **版本号读写错位**：`ensure_seed` 从 `settings` 读版本，结尾却写 `app_meta`；而
  `_seed_settings` 用 `INSERT OR IGNORE` 写 `settings.seed_version`，所以 `settings` 里的值
  永远停在首次写入的版本。**递增 `SEED_VERSION` 后，每次启动都会重跑整套种子流程**
  （各 seeder 的守卫挡住了重复插入，但 `_seed_catalog` 会重新执行）。正确做法是删库重建，
  或修掉这个读写不一致。
- **守卫会掩盖种子变更**：改了 `BASE_USERS`/`MODELS` 后不删库，新增项不会出现（`COUNT>0`
  直接跳过）；`_seed_catalog` 是例外，它没有 count 守卫，新增权限/角色能补进去，但删除的
  权限不会从 `role_permissions` 中移除。
- **演示密码哈希复用**：128 个用户共享同一个 `admin123` 哈希（同一盐），只适合演示；
  生产种子应改为随机密码或强制首次改密。
- **种子 Key 前缀与运行时不符**：种子日志用 `sk-seed000`（10 字符），而
  `security.api_key_prefix` 生成的是 `sk-` + 8 = 11 字符。按前缀回退统计 Key 用量时，
  种子日志不会被算进任何真实 Key。
- **种子 `usage_buckets` 的 `requests` 大于 `success_requests`**，而真实流量只会让两者同步 +1；
  这导致"请求数 - 成功数 = 失败数"的推算在种子期成立、在纯真实流量期恒为 0。
- **种子时间会"过期"**：今日基线只在首次启动当天准确；隔天再看，今天的 KPI 会变成 0
  （桶属于昨天），而昨日数据仍在，环比会异常。演示前建议删库重种。
- **`spark_today` 是静态 JSON**：真实流量增长后 KPI 数字变了，但 sparkline 仍是设计稿曲线，
  直到手动改 `settings` 或删库。

## 相关页面

[[modules/backend]] · [[entities/backend-db-schema]] · [[entities/backend-app-factory]] ·
[[entities/backend-analytics]] · [[entities/backend-deps-authz]] · [[entities/backend-admin-routes]] ·
[[concepts/metering-analytics]] · [[concepts/testing-verification]]
