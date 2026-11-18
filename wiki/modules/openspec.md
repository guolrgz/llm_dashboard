---
title: OpenSpec 规格驱动流程与目录（openspec/）
source_files:
  - openspec/config.yaml
  - openspec/specs/auth-rbac/spec.md
  - openspec/specs/user-management/spec.md
  - openspec/specs/model-channel/spec.md
  - openspec/specs/api-key-quota/spec.md
  - openspec/specs/traffic-gateway/spec.md
  - openspec/specs/traffic-analytics/spec.md
  - openspec/specs/management-console/spec.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/.openspec.yaml
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/proposal.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/design.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/tasks.md
updated: 2026-11-18
tags: [module, openspec]
---

# OpenSpec 规格驱动流程与目录（openspec/）

`openspec/` 是这个项目“先写规格、再写代码”的载体。它记录了一次完整的 **propose → apply → archive**：7 个 capability 的 delta spec 在 `changes/` 里被提出、实现、勾选任务，最后归档合并进 `specs/`。它不参与运行时，但决定了后端接口、前端页面与验收项的形状。

## 职责

- **规格源**：每个 capability 用 `Requirement + Scenario` 描述可验证行为，是后端 pytest 与浏览器 E2E 的验收依据。
- **变更记录**：proposal 说明为什么做，design 记录技术决策与取舍，tasks 记录实施清单与完成状态。
- **归档基线**：归档后 `specs/<capability>/spec.md` 成为当前系统的“合同”，后续变更以 delta 形式叠加。
- **术语对齐**：`auth-rbac`、`traffic-gateway`、`management-console` 等名字同时出现在 Wiki 概念页与代码注释里。

## 目录结构

```text
openspec/
  config.yaml                        schema: spec-driven（其余为注释示例）
  specs/
    .gitkeep
    auth-rbac/spec.md                已合并的 7 份主规格
    user-management/spec.md
    model-channel/spec.md
    api-key-quota/spec.md
    traffic-gateway/spec.md
    traffic-analytics/spec.md
    management-console/spec.md
  changes/
    archive/
      .gitkeep
      2026-11-18-build-token-traffic-system/
        .openspec.yaml               schema: spec-driven / created: 2026-11-18
        proposal.md                  Why / What Changes / Capabilities / Impact
        design.md                    Context / Goals / D1–D7 / Risks / Migration
        tasks.md                     10 组任务，全部 [x]
        specs/<capability>/spec.md   7 份 delta specs（ADDED Requirements）
```

## 7 个 capability

| capability | 规格范围 | 主要落地位置 |
|---|---|---|
| `auth-rbac` | 登录、令牌会话、退出吊销、权限目录、5 角色、接口级授权、前端守卫 | `backend/app/{security,deps,catalog}.py`、`routers/{auth,rbac}.py`、`src/stores/auth.js`、`src/router/index.js` |
| `user-management` | 用户列表/筛选/分页、增删改、启停、批量、128 种子用户 | `backend/app/routers/users.py`、`backend/app/seed.py`、`src/views/UsersView.vue` |
| `model-channel` | 4 个模型渠道、CRUD、启停、单价、权重路由 | `backend/app/routers/models.py`、`src/views/ModelsView.vue` |
| `api-key-quota` | Key 签发/吊销/轮换、日/月配额、RPM/TPM 限流、策略读写 | `backend/app/routers/{keys,quota}.py`、`services/rate_limit.py` |
| `traffic-gateway` | `/v1/chat/completions`、拦截顺序、上游转发/模拟、计量、日志、`/health` | `backend/app/routers/traffic.py`、`services/{gateway,metering}.py` |
| `traffic-analytics` | Dashboard 聚合、KPI/趋势/分布/近期请求/概览、告警与未读 | `backend/app/routers/{analytics,alerts}.py`、`services/alerts.py`、`src/api/analytics.js` |
| `management-console` | 信息架构、8 个页面、真实数据接入、响应式与可访问性 | `src/App.vue`、`src/views/*`、`src/styles.css` |

capability 与代码目录不是一一对应：`management-console` 横跨整个前端，`traffic-gateway` 同时承担计量与审计。

## 入口命令

```bash
openspec status --change build-token-traffic-system        # 规划进度（归档前）
openspec instructions apply --change build-token-traffic-system
openspec validate build-token-traffic-system --strict      # 规格校验
openspec archive build-token-traffic-system                # 归档并合并 specs
```

命令来自 README §9；环境里 `openspec` CLI 可用（`command -v openspec` 命中）。归档后 change 目录已移到 `changes/archive/`，上述 `--change` 形式应按当前 CLI 对已归档 change 的支持情况使用，日常以直接阅读归档文件为准。

## 产出物

- `openspec/specs/<capability>/spec.md`：7 份主规格，标题为 `# <capability> Specification`，正文 `## Requirements`。
- `changes/archive/2026-11-18-build-token-traffic-system/`：提案、设计、任务与 delta specs 的完整快照。
- 由此衍生的文档：`docs/system-architecture.md`（系统全貌）、`docs/api-contract.md`、`docs/qa-report.md`（验收结论）。验收证据与规格场景一一对应，见 [[concepts/testing-verification]]。

## 与主应用的关系

规格里的每个 Scenario 都能在后端测试或 E2E 用例中找到对应断言：例如 `traffic-gateway` 的“无 Key 401 / 缺 messages 400 / 未知模型 404”由 `tools/e2e/e2e-gateway.mjs` 直接验证（[[entities/tools-e2e-harness]]）；`auth-rbac` 的守卫场景由 `tools/e2e/e2e-console.mjs` 验证。规格不是“文档装饰”，改接口前应先看对应 capability。

## 设计要点与坑

1. **`config.yaml` 基本是空模板**：只有 `schema: spec-driven` 生效，`context`、`rules`、`operations` 全是注释掉的示例。把注释当配置读会误以为存在“提案不超过 500 词”之类的约束。
2. **变更已归档，不在 `changes/` 根下**：README §9 与 `docs/system-architecture.md` 仍写 `openspec/changes/build-token-traffic-system/`，实际路径带 `archive/2026-11-18-` 前缀；按旧路径找文件会扑空。
3. **归档时规格被改写**：归档内是 `# Spec Delta` + `## ADDED Requirements`，主 specs 已合并为 `# <capability> Specification` + `## Requirements`。在当前 specs 里搜 `ADDED` 是搜不到的。
4. **design.md 与实现有漂移**：D2 把 `usage_buckets` 描述为“小时桶”，实现是 15 分钟桶（`BUCKET_MINUTES = 15`）；D3 提到 `sessions` 表，实际是 `revoked_tokens`，另外还有 `token_usage`、`app_meta` 两张设计里没列的表。以 [[entities/backend-db-schema]] 为准。
5. **任务全勾选 ≠ 无遗留**：`tasks.md` 10 组全部 `[x]`，但 design 的 Open Questions 写着“告警去重窗口、模型权重算法可在实现中微调”，这类细节不在规格里，需要读代码确认。
6. **目录名不等于 change 名**：change 名是 `build-token-traffic-system`，归档目录是“日期 + change 名”；引用时不要把日期当成 ID 的一部分。
7. **不要把项目叙述塞进 config**：模板注释明确要求“Keep general project documentation out”，所以背景、启动方式在 README，架构在 `docs/`，OpenSpec 只保留规格与决策。

## 相关页面

- [[entities/openspec-change]] — 已归档 change 的四份产物与落地映射。
- [[concepts/openspec-workflow]] — propose/apply/archive 的工作流视角。
- [[modules/backend]]、[[modules/frontend]] — 规格的实现侧。
- [[concepts/auth-rbac]]、[[concepts/token-governance]]、[[concepts/metering-analytics]]
