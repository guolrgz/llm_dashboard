---
title: 系统总览 — LLM 推理 Token 流量管理系统
source_files:
  - README.md
  - docs/system-architecture.md
  - package.json
  - start.sh
  - backend/app/main.py
  - src/main.js
updated: 2026-11-18
tags: [overview, architecture]
---

# 系统总览

## 一句话定位

面向 LLM 推理场景的 **Token 流量治理系统**：以 OpenAI 兼容网关为流量入口，完成「API Key 鉴权 → 配额/限流 → 上游转发或离线模拟 → Token 计量 → 请求日志 → 聚合分析 → 告警」闭环，并提供一套以 `index.png` 设计稿为视觉基线的 Vue 管理控制台。

系统不是纯前端原型：后端真实持久化（SQLite）、有登录与 RBAC、有可签发的 API Key、有可被外部业务方调用的推理入口，控制台所有页面读取真实接口数据。

## 技术栈与运行形态

| 层 | 技术 | 说明 |
|---|---|---|
| 控制台 | Vue 3 + Vite + vue-router（hash） | 8 个页面，原生 SVG 图表，无图表库；按设计稿像素级还原 |
| 服务端 | Python FastAPI + Uvicorn | 应用工厂 + 分层路由/服务；OpenAI 兼容网关 |
| 存储 | SQLite（WAL 模式，stdlib `sqlite3`） | 单文件 `backend/data/app.db`，首次启动建表 + 幂等种子 |
| 测试 | pytest + Playwright（tools/） | 86 个后端用例；浏览器 E2E / 像素回归 / 响应式验收 |
| 规格 | OpenSpec（spec-driven） | `openspec/changes/archive/2026-11-18-build-token-traffic-system/`，7 个 capability |

```text
Browser (Vue SPA, hash router)
   │  /api/*  Bearer <JWT>          /v1/*  Bearer sk-...
   ▼
FastAPI (127.0.0.1:8000)
   ├─ 管理 API：auth / users / rbac / models / keys / quota / settings
   ├─ 分析 API：traffic / analytics / alerts
   └─ 推理网关：鉴权 → 配额 → 限流 → 上游/模拟 → 计量 → 日志
   ▼
SQLite app.db（11 张表）
   ▲
Vite dev server (:5173) 通过 proxy 转发 /api、/v1、/health
```

## 仓库布局（顶层）

| 目录/文件 | 角色 | Wiki 页面 |
|---|---|---|
| `backend/` | FastAPI 服务、SQLite 数据层、网关、测试 | [[modules/backend]] |
| `src/` | Vue 3 控制台（路由、页面、组件、样式） | [[modules/frontend]] |
| `tools/` | 开发期 QA：Playwright E2E、截图/像素 diff、旧交互测试 | [[modules/tools]] |
| `static/` | 上一阶段的原生静态还原版（历史来源/参考） | [[modules/static-legacy]] |
| `openspec/` | 规格驱动变更与归档后的 7 份 capability 规格 | [[modules/openspec]] |
| `docs/` | 设计规格、API、架构、QA 报告、安全审查报告 | 见 [[modules/frontend]] / [[concepts/testing-verification]] |
| `index.png` / `users.jpg` | 设计基线（Dashboard 1672×941；用户页 1376×768 @2x） | [[concepts/design-fidelity]] |

## 核心领域模型

- **用户与权限**：`users` 通过 `role_id` 关联 5 个角色；角色通过 `role_permissions` 绑定 17 个权限键；超级管理员拥有 `*`。见 [[concepts/auth-rbac]]。
- **模型渠道**：`models` 保存模型名、供应商、上游地址/密钥、输入输出单价、流量权重与启停状态；网关按权重路由。见 [[entities/backend-admin-routes]]。
- **API Key**：`api_keys` 保存 `key_hash` + 前缀，可覆盖 RPM/TPM/日/月配额；明文仅在创建/轮换响应出现一次。见 [[entities/backend-admin-routes]]。
- **流量事实**：`request_logs`（逐请求审计，含失败）与 `usage_buckets`（15 分钟 × 模型聚合，Dashboard 主数据源）；`token_usage` 保存用户/Key 的日/月累计。见 [[concepts/metering-analytics]]。
- **告警**：`alerts` 记录配额阈值/超限/限流事件，支持已读与未读徽标。见 [[flows/alert-generation]]。

## 关键设计决策（及其代价）

1. **设计稿 vs 数据一致性**：`index.png` 自身的趋势图日累计（约 483 万）与 KPI 128,960、成功率 88.5% 与 KPI 99.2% 互相矛盾。系统选择以数据一致性为准：曲线保留原型形状并缩放到 128,960，成功率按 99.2% 生成，因此 y 轴刻度为 0–2.5k 而非原型的 0–100k。详见 [[concepts/design-fidelity]]。
2. **离线可运行**：模型渠道未配置上游时使用确定性模拟上游（token 按字符数估算），使系统无外网也能完整演示计量/限流/告警。见 [[concepts/token-governance]]。
3. **单机 SQLite + 应用层限流**：演示与单实例场景足够；限流窗口在重启后清零，多实例部署需外部共享计数（设计文档已标注）。
4. **前后端分离但同仓库**：开发态 Vite proxy 转发，生产态 FastAPI 托管 `dist/`（单进程即可发布）；见 [[modules/backend]]。
5. **种子基线精确复现原型**：今日 128,960 请求 / 1.24B Token / 99.2% 成功率 / 模型占比 40.2/32.6/18.1/9.1，真实网关流量在其上自然叠加。见 [[entities/backend-seed-data]]。
6. **规格驱动**：先 OpenSpec proposal/specs/design/tasks，再实现、验收、归档；见 [[concepts/openspec-workflow]]。

## 推荐阅读路径

- **新人/接手者**：本页 → [[modules/backend]] → [[modules/frontend]] → [[flows/gateway-request]] → [[concepts/token-governance]]。
- **排查 Token 不生效**：[[flows/gateway-request]] → [[entities/backend-metering-rate-limit]] → [[concepts/metering-analytics]]。
- **改 Dashboard**：[[flows/dashboard-aggregation]] → [[entities/backend-analytics]] → [[entities/frontend-dashboard-view]] / [[entities/frontend-charts]]。
- **改登录/权限**：[[flows/login-session]] → [[entities/backend-security]] / [[entities/backend-deps-authz]] → [[flows/role-permission-change]]。
- **跑验收**：[[concepts/testing-verification]] → [[entities/tools-e2e-harness]] / [[entities/tools-pixel-qa]]。
- **安全评审**：[[concepts/security-posture]]（含 `vue-security-review-report.md` 结论）。
- **避坑/接手**：[[concepts/known-issues]] — 已核实的实现坑、文档漂移与技术债（seed 版本、限流窗口、策略不一致、前端启发式等），动手前先读。

## 当前质量基线（2026-11-18）

- 后端 pytest：86 passed / 0 failed。
- 浏览器 E2E 37/37，网关端到端 15/15，响应式 22/22，像素回归 9/9。
- Dashboard vs `index.png` 总体差异 ≈5.5%（外壳区域与历史基线逐像素一致）；用户页 vs `users.jpg` ≈5.8%（差异为真实 128 行数据/导航增强等数据差异）。
- 详见 [[concepts/testing-verification]] 与 `docs/qa-report.md`。
