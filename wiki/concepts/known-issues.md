---
title: 已知问题与设计坑（Wiki 建设期发现）
source_files:
  - backend/app/seed.py
  - backend/app/services/metering.py
  - backend/app/services/rate_limit.py
  - backend/app/routers/keys.py
  - backend/app/routers/users.py
  - backend/app/routers/traffic.py
  - backend/app/services/gateway.py
  - backend/app/security.py
  - src/components/KpiSpark.vue
  - src/components/TrendChart.vue
  - src/views/ModelsView.vue
  - src/App.vue
  - tools/qa.sh
  - README.md
  - docs/system-architecture.md
updated: 2026-11-18
tags: [concept, known-issues, gotchas, tech-debt]
---

# 已知问题与设计坑

本页汇总构建本 wiki 时逐文件核实的“代码实现与预期/文档不一致”之处。**这些不是 wiki 推测，均已在源码中验证**；修复前请先补测试。按影响面分组，标注 `确认` / `需验证`。

> 维护方式：每修一个，就在本页标记 ✅ 并更新 `updated`；新增问题追加到对应分组。不要直接删除条目（保留审计线索）。

## A. 数据与计量

### A1. `SEED_VERSION` 读写错位（确认）

- **证据**：`seed.py:220` 从 `settings.seed_version` 读取版本；`seed.py:234` 把版本写入 `app_meta.seed_version`；`_seed_settings` 用 `INSERT OR IGNORE`，所以 `settings.seed_version` 永远停在首次写入值。
- **影响**：升级 `SEED_VERSION` 不会触发“重新种子”的短路逻辑，而是每次启动都进入种子流程（多数 seeder 有 `COUNT>0` 守卫，但 `_seed_catalog` 会重跑）；实际重置只能删 `backend/data/app.db*`。
- **建议**：统一读写同一处（`app_meta` 或 `settings`），或把 `seed_version` 改为 `INSERT OR REPLACE`；补一个“版本升级只执行一次”的测试。
- 相关：[[entities/backend-seed-data]]

### A2. `usage_buckets.requests` 只累加成功请求（确认）

- **证据**：`metering.apply_usage()` 同时执行 `requests + 1` 与 `success_requests + 1`；失败请求只写 `request_logs`，不写桶。
- **影响**：纯真实流量下桶内 `requests == success_requests`，`/api/traffic/summary` 的 `failedRequests = requests - successRequests` 恒为 0；种子数据里 requests > success 掩盖了这一点。
- **建议**：若产品要求“总请求量含失败”，给桶加 `failed_requests` 或让 summary 从 `request_logs` 统计失败数并与桶的成功数拼接（当前 summary 已这样取失败计数，需核对最终实现）。
- 相关：[[concepts/metering-analytics]]、[[entities/backend-metering-rate-limit]]

### A3. 配额无预扣，单次请求可越过上限（确认）

- **证据**：网关先 `check_quota()`（看已用量）再执行请求，成功后 `record_success()` 才累加 Token。
- **影响**：若已用 1,999,000 / 2,000,000，单次消耗 10,000 Token 的成功请求仍会放行，事后超出配额；后续请求才被拦截。
- **建议**：可接受（演示口径），如需严格可在准入时预留 `max_tokens` 估算；文档/规格应写明该口径（当前 `concepts/token-governance` 已注明）。

### A4. 限流窗口把被拒请求也计入，可能自我放大（确认）

- **证据**：`rate_limit.window_stats()` 查询 `request_logs WHERE key_prefix=? AND ts>=?`，不按 `status` 过滤；而 429 失败也会被 `record_failure()` 写入 `request_logs`（`traffic.py` 的 `fail()`）。
- **影响**：客户端持续重试时，被拒请求持续进入窗口，可能让 Key 在超过 60 秒后仍处于“超限”状态（自我放大）。
- **建议**：窗口统计只计入 `status='success'`（或计数包含拒绝但 Token 只统计成功）；补“持续重试后恢复”的测试。
- 相关：[[flows/gateway-request]]、[[entities/backend-metering-rate-limit]]

## B. 策略与授权

### B1. Key 配额的两套合并优先级不一致（确认）

- **证据**：网关 `rate_limit.resolve_limits()` 优先 `quota_policies(scope='key')`，再回落到 `api_keys` 行内列；而管理面 `keys._resolve_limits()` 优先 `api_keys` 行内列，再用户策略/角色策略/默认值。
- **影响**：通过 `PUT /api/quota/policies/key/{id}` 设置的 Key 策略在网关生效，但 Key 详情页展示的 `usage/limits` 可能按另一套口径算，出现“页面显示 A、实际拦截 B”。
- **建议**：抽出唯一的 `resolve_limits()` 供两处复用；Key 创建时不要物化默认值，保留 `NULL` 以支持追溯。
- 相关：[[concepts/token-governance]]、[[entities/backend-admin-routes]]

### B2. Key 创建时把默认策略物化进 `api_keys` 列（确认）

- **证据**：创建 Key 时把用户/角色/系统默认值写入 `api_keys.rpm_limit/tpm_limit/daily_quota/monthly_quota`。
- **影响**：之后修改系统默认值或用户策略不会追溯已有 Key；要调整必须改 Key 级策略或轮换 Key。
- **建议**：同 B1，或明确文档化“Key 创建即固化”。

### B3. `PUT /api/users/{id}` 可停用/降级最后一名启用超管（确认）

- **证据**：删除接口有 `_enabled_super_count() <= 1` 保护（`users.py:459`）；`PUT /users/{id}` 与 `POST /users/{id}/status` 没有同等校验。
- **影响**：可能把系统锁死（无可用超管），只能改库恢复。
- **建议**：把“最后一个启用超管”保护抽成公共校验，应用到 PUT/status/batch。

### B4. JWT 未校验 header 的 `alg`/`typ`，且默认密钥硬编码（确认）

- **证据**：`security.decode_token()` 只按 HS256 重算签名，未解析/校验 header；`config.jwt_secret()` 有仓库内默认值。
- **影响**：当前单算法实现下无法直接 alg 混淆攻击；但缺少防御性校验，且生产忘记设置环境变量时令牌可被伪造（安全审查已列 Medium）。
- **建议**：校验 `header.alg == "HS256"`、`typ == "JWT"`；生产模式强制环境变量。
- 相关：[[concepts/security-posture]]

### B5. 网关 async 端点内调用同步 httpx（确认）

- **证据**：`traffic.py:90` 为 `async def chat_completions`，但 `gateway.forward_chat()` 是同步函数（内部 `httpx.Client`，超时 10s）。
- **影响**：配置真实上游时，一个慢请求会阻塞事件循环，影响并发；离线模拟路径不受影响。
- **建议**：改 `httpx.AsyncClient` / `run_in_threadpool`，或在路由层用 `def`（FastAPI 会放线程池）。
- 相关：[[entities/backend-traffic-gateway]]

## C. 前端

### C1. 前端权限只做“可见性”，不是安全边界（部分确认）

- **证据**：路由守卫只校验 token，不校验 `meta.permission`；`DashboardView` 未检查 `dashboard.view`（其他治理页由页面级 error 态兜底）；`auth.user.permissions` 来自 `localStorage` 快照，可篡改且改角色后不自动刷新。
- **影响**：绕过前端可看到页面/按钮，但所有 API 仍会被服务端 403 拦截——安全上可接受，体验上可能出现“看得到点不了”。
- **建议**：加路由 meta 权限守卫；角色变更后主动 `fetchMe()`；文档明确前端只做体验。
- 相关：[[concepts/auth-rbac]]、[[concepts/security-posture]]

### C2. `KpiSpark` 用启发式判断“坐标 vs 数值”（确认）

- **证据**：`KpiSpark.vue` 用 `max <= 84 && min >= 0` 判断传入数组是 SVG y 坐标还是真实数值。
- **影响**：当真实流量计数恰好都 ≤84（小流量/7d 采样）时会被误当坐标数组，sparkline 形状错误。当前种子数据不会触发（今日 spark 来自原型坐标）。
- **建议**：显式 prop（`mode="coords" | "values"`）替代启发式；补小流量快照测试。
- 相关：[[entities/frontend-charts]]

### C3. `TrendChart` 绘图区底边固定 215.5（确认）

- **证据**：`TrendChart.vue` 的绘图区 `bottom` 常量，不随容器高度变化。
- **影响**：改图表卡片高度/响应式布局时曲线与坐标轴可能错位；当前设计尺寸下正常。
- **建议**：改为基于 SVG viewBox/容器高度计算。
- 相关：[[entities/frontend-charts]]、[[concepts/design-fidelity]]

### C4. 模型编辑无法把 `upstreamBaseUrl` 清空（确认）

- **证据**：`ModelsView.vue` 的 `buildPayload()` 省略空字符串字段；后端其实支持空串表示“清空/回退模拟上游”。
- **影响**：配置过真实上游后无法通过 UI 清空回离线模拟，只能直接调 API。
- **建议**：对 `upstreamBaseUrl` 显式提交空串（其他密钥字段保持“空=不改”）。
- 相关：[[entities/frontend-models-settings-views]]

### C5. 用户页外壳尺寸切换造成跳变（确认）

- **证据**：`App.vue` 的 `app--users` 在桌面端把侧栏压到 215px、顶栏 53px（对齐 `users.jpg` 基线）；Dashboard 是 256px/68px。
- **影响**：用户页与其他页切换时外壳宽度跳变；`/models` 可直达但侧栏无对应项、无高亮。
- **建议**：产品层面统一或接受（当前为设计基线取舍）；若加模型管理导航项会破坏原型 6 项结构。
- 相关：[[concepts/design-fidelity]]、[[entities/frontend-shell]]

## D. 工具链与文档漂移

### D1. 两套 QA 工具写同一份报告（确认）

- **证据**：`tools/e2e/run.mjs` 与旧 `tools/qa.sh` 都写 `docs/qa-report.md`；`qa.sh` 依赖的 sed 锚点 `## 9. Mismatch-pixel ranking` 已不存在（`tools/diff.mjs` 改为 `## Top mismatching regions`），摘要段恒为空。
- **影响**：先跑 E2E 再跑 `qa.sh` 会用视觉报告覆盖验收报告；旧脚本输出的“摘要”为空。
- **建议**：统一入口（只保留 `tools/e2e/run.mjs`）或让 `qa.sh` 写不同文件。
- 相关：[[entities/tools-pixel-qa]]、[[concepts/testing-verification]]

### D2. E2E 的副作用与顺序约束（确认）

- **证据**：`e2e-gateway.mjs` 真实创建 Key、发推理、触发 429/配额并写 `request_logs`/`usage_buckets`/`alerts`，会把今日 KPI 从 128,960 顶高；`run.mjs` 刻意把它排在最后。
- **影响**：验收顺序不当会让 console/pixel 断言失败；数据库被污染后需重置。
- **建议**：验收固定顺序（console → pixel → responsive → gateway），或使用独立临时 DB 跑网关 E2E。
- 相关：[[concepts/testing-verification]]

### D3. `pixel-check.mjs` 依赖 gitignore 的 Pillow（确认）

- **证据**：解码 `users.jpg` 依赖 `tools/pylib` 下的 Pillow；该目录被 `.gitignore` 忽略，新环境需按 `tools/` 的说明重新安装。
- **影响**：CI/新机器直接跑像素检查会失败。
- **建议**：在 `tools/README` 或 setup 脚本中固化 `tools/pylib` 安装步骤。

### D4. 文档漂移（确认）

| 文档 | 描述 | 实际 |
|---|---|---|
| `openspec/changes/archive/.../design.md` | `usage_buckets` 为小时桶、`sessions` 表 | 15 分钟桶（`BUCKET_MINUTES=15`）；`revoked_tokens`（另有 `token_usage`、`app_meta`） |
| `docs/system-architecture.md` | 历史静态版在 `src/users/` | 实际是 `static/`（`src/users/` 已删除） |
| `README.md` | `static/` 为“单文件” | 实际 5 个文件（index.html/styles.css/app.js + 2 字体），需打开 `static/index.html` |
| `README.md` | OpenSpec 命令用未归档路径 `changes/build-token-traffic-system/` | 实际已归档到 `changes/archive/2026-11-18-build-token-traffic-system/` |

- **建议**：下次文档维护时统一修正；归档的 design.md 属于历史记录，建议保留原文，在 README/本页标注漂移。

## 相关页面

- [[concepts/metering-analytics]]、[[concepts/token-governance]]、[[concepts/auth-rbac]]、[[concepts/security-posture]]
- [[concepts/testing-verification]]、[[concepts/design-fidelity]]
- [[entities/backend-seed-data]]、[[entities/backend-metering-rate-limit]]、[[entities/backend-users-router]]、[[entities/backend-traffic-gateway]]
- [[entities/frontend-charts]]、[[entities/frontend-models-settings-views]]、[[entities/frontend-shell]]
- [[entities/tools-pixel-qa]]、[[entities/openspec-change]]
