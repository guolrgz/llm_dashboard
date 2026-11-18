---
title: 已归档变更 build-token-traffic-system
source_files:
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/.openspec.yaml
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/proposal.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/design.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/tasks.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/specs/auth-rbac/spec.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/specs/user-management/spec.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/specs/model-channel/spec.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/specs/api-key-quota/spec.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/specs/traffic-gateway/spec.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/specs/traffic-analytics/spec.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/specs/management-console/spec.md
updated: 2026-11-18
tags: [entity, openspec, specs]
---

# 已归档变更 build-token-traffic-system

> 所属模块：[[modules/openspec]]

这是仓库唯一一次完整走完的 OpenSpec 变更：把“像素级静态 Dashboard”升级成“带鉴权、网关、计量与告警的 Token 流量管理系统”。归档目录保留了 propose 阶段的四类产物（proposal / design / tasks / 7 份 delta specs），是理解当前代码“为什么长这样”的第一手材料。

## 用途

- **追溯设计意图**：每个后端接口、前端页面都能回指某条 requirement。
- **验收对照**：72 个 Scenario 是 pytest 与 E2E 断言的来源，`docs/qa-report.md` 的检查项可逐条对上。
- **避免重复讨论**：D1–D7 已经把技术选型、数据模型、安全、限流、模拟上游、前端集成、测试策略的取舍写死；改方向前先读这里。
- **归档样例**：`.openspec.yaml`（`schema: spec-driven`、`created: 2026-11-18`）与“日期前缀目录名”是 OpenSpec archive 的实际形态。

## 产物结构

```text
2026-11-18-build-token-traffic-system/
  .openspec.yaml                    schema + created
  proposal.md                       46 行：Why / What Changes / Capabilities / Impact
  design.md                         95 行：Context / Goals / D1–D7 / Risks / Migration / Open Questions
  tasks.md                          91 行：10 组任务，全部 [x]
  specs/<capability>/spec.md        7 份 delta specs（# Spec Delta + ## ADDED Requirements）
```

## proposal.md 的骨架

- **Why**：旧仓库只有静态还原，数据写死、无账号、无治理能力，“看起来像 Dashboard 但不能登录/管理/计量”。
- **What Changes**：11 条，覆盖后端、登录、RBAC、用户管理、模型渠道、Key/配额/限流、网关、分析告警、控制台页面、系统设置、自动化验证。
- **Capabilities**：7 个 New Capabilities（`auth-rbac`、`user-management`、`model-channel`、`api-key-quota`、`traffic-gateway`、`traffic-analytics`、`management-console`），Modified 为空（当时 `specs/` 为空）。
- **Impact**：新增 `backend/`、`src/api/`、`src/views/`；修改 `App.vue`、`router`、Dashboard/Users 视图、`vite.config.js`；新增 `/api/*`、`/v1/chat/completions`、`/health`。

## design.md 的七个决策

| 决策 | 内容 | 实现落点 |
|---|---|---|
| D1 | FastAPI + stdlib `sqlite3`（WAL、每请求连接），`create_app(db_path)` 便于测试 | [[entities/backend-app-factory]]、[[entities/backend-db-schema]] |
| D2 | 12 张表的领域模型 + 种子策略（128,960 / 1.24B / 99.2% / 96 点） | [[entities/backend-seed-data]] |
| D3 | PBKDF2 密码、自实现 HS256 JWT、Key 只存 SHA-256、`require_permission` | [[entities/backend-security]]、[[entities/backend-deps-authz]] |
| D4 | 60s 滑动窗口 RPM/TPM、日/月配额、拒绝也审计但不计量 | [[entities/backend-metering-rate-limit]] |
| D5 | 上游转发 + 确定性离线模拟；`stream=true` SSE | [[entities/backend-traffic-gateway]] |
| D6 | 单 SPA + hash 路由、`users.html` 兼容重定向、Vite 代理 | [[entities/frontend-api-client]]、[[entities/frontend-router-guard]] |
| D7 | pytest + Playwright E2E + 像素回归 | [[concepts/testing-verification]] |

## tasks.md 的十组任务

1. 后端基座与数据层（骨架、`create_app`、建表、种子角色/权限、密码/JWT、128 用户、种子流量）
2. 认证与 RBAC（登录三态、`/me`、logout、权限依赖、角色权限更新、用户列表/CRUD、Key 生命周期）
3. 模型、配额与设置（渠道 CRUD、权重、策略读写、Key 用量、设置持久化）
4. 流量网关与计量（非流式、错误分支、RPM/TPM、配额、日志、SSE、上游转发）
5. 分析与告警（Dashboard 三范围、趋势/分布/近期/概览、告警生成与已读、日志查询）
6. 前端基座与登录（api client、auth store、登录页、守卫、代理、顶栏/侧栏）
7. Dashboard 真实数据（API 接入、图表 props、三态、像素回归）
8. 用户管理与角色权限页面（API 驱动、Toast、角色/权限页、`users.html` 重定向）
9. 流量监控、模型与系统设置页面（筛选分页、模型 CRUD、设置保存、导航、响应式）
10. 集成验证与文档（pytest、build、E2E、网关端到端、api/architecture/README、`validate --strict`）

全部勾选，尾部的 “Workflow follow-up” 记录了 `openspec archive` 动作本身。

## 落地映射

| capability | 规格规模（Requirement / Scenario） | 代码与页面 |
|---|---|---|
| `auth-rbac` | 5 / 14 | `routers/auth.py`、`routers/rbac.py`、`security.py`、`deps.py`、`catalog.py`；`stores/auth.js`、`router/index.js` |
| `user-management` | 4 / 10 | `routers/users.py`、`seed.py`；`views/UsersView.vue` |
| `model-channel` | 3 / 7 | `routers/models.py`；`views/ModelsView.vue` |
| `api-key-quota` | 4 / 10 | `routers/keys.py`、`routers/quota.py`、`services/rate_limit.py` |
| `traffic-gateway` | 5 / 12 | `routers/traffic.py`（`gateway_router`）、`services/gateway.py`、`services/metering.py` |
| `traffic-analytics` | 4 / 9 | `routers/analytics.py`、`routers/alerts.py`、`services/alerts.py`；`views/DashboardView.vue`、`views/TrafficView.vue` |
| `management-console` | 5 / 10 | `src/App.vue`、8 个 views、`styles.css`、`components/*` |

合计 30 条 Requirement / 72 个 Scenario。验收侧：backend pytest 86 passed；浏览器 E2E 37/37；网关 15/15；响应式 22/22；像素 Dashboard 5.51%、用户页 5.83%（详见 `docs/qa-report.md`、`docs/backend-test-report.md`）。

## 坑与注意点

1. **归档路径带日期前缀**：README §9 与 `docs/system-architecture.md` 仍引用 `openspec/changes/build-token-traffic-system/`，真实路径是 `changes/archive/2026-11-18-build-token-traffic-system/`。
2. **delta spec 与主 spec 不是同一份文本**：归档里是 `# Spec Delta` + `## ADDED Requirements`，`openspec/specs/` 里已合并为 `# <capability> Specification` + `## Requirements`；引用时优先用主 specs。
3. **design 有实现漂移**：D2 说 `usage_buckets` 为“小时桶”，实现是 15 分钟（`BUCKET_MINUTES = 15`）；D3 的 `sessions` 表实际叫 `revoked_tokens`，且多了 `token_usage`、`app_meta`；D6 说静态产物由 `backend/app/static` 托管，实际 `main.py` 挂载仓库根的 `dist/`。
4. **Migration Plan 的开关没落地**：设计提到“保留一个 `USE_MOCK` 开关”，代码里只有 `VITE_API_BASE`（`src/api/client.js`），没有 mock 开关；`src/users/*` 也不存在，旧数据源实际是 `static/`。
5. **proposal 的 Impact 与现状有出入**：它说“前端 mock 文件保留为离线降级/演示数据”，当前 `src/data/` 只剩导航与展示常量，不再有 mock 用户/流量数据。
6. **设计稿数值是硬约束**：D2 的种子基线（128,960 / 1.24B / 99.2% / 40.2·32.6·18.1·9.1）与 `traffic-analytics` 的 Scenario 绑定；改种子会让 E2E 与像素报告同时失败。
7. **任务勾选不代表没有 P2**：`docs/qa-report.md` §8 仍列了用户页视觉偏差、Dashboard 图表数据差异、390px 曾出现的横向溢出等观察项；读 tasks 时要配合 QA 报告。

## 相关页面

- [[modules/openspec]]、[[concepts/openspec-workflow]]
- [[concepts/token-governance]]、[[concepts/metering-analytics]]、[[concepts/auth-rbac]]
- [[flows/gateway-request]]、[[flows/login-session]]、[[flows/role-permission-change]]
