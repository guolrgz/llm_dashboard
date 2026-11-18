# Wiki Log

Chronological, append-only. Format: `## [YYYY-MM-DD] <op> | <scope>` (op = ingest | query | lint).

## [2026-11-18] ingest | cold start — overview + wiki schema + skeleton index

- 读取 `CLAUDE.md` 模板并落地为仓库根 `CLAUDE.md`（`CLAUDE.md` 原本不存在，未覆盖任何文件）。
- 创建 `wiki/{modules,entities,concepts,flows}/`、`wiki/index.md` 骨架、本日志。
- 建立全站页面清单（5 modules / 28 entities / 8 concepts / 6 flows + overview），作为并行 ingest 的链接契约。

## [2026-11-18] ingest | backend module + 13 backend entities

- 范围：`backend/app/{main,config,db,security,catalog,deps,errors,utils,seed}.py`、`routers/*`、`services/*`。
- 产出：`modules/backend.md` + `entities/backend-*.md`（app-factory、db-schema、security、deps-authz、auth-router、users-router、rbac-router、admin-routes、traffic-gateway、metering-rate-limit、analytics、alerts、seed-data）。
- 核实要点：网关准入顺序与失败审计、配额策略合并优先级、15 分钟桶与 `token_usage`、种子基线（128,960 / 1.24B / 99.2%）。

## [2026-11-18] ingest | frontend module + 11 frontend entities

- 范围：`src/{main.js,App.vue,router,api,stores,views,components,styles.css}`、`vite.config.js`、入口 HTML。
- 产出：`modules/frontend.md` + `entities/frontend-*.md`（api-client、auth-store、router-guard、shell、login-view、dashboard-view、charts、users-view、roles-permissions-views、traffic-view、models-settings-views）。
- 核实要点：API client 的 401 处理、路由守卫、Dashboard props 化、原生 SVG 图表与设计稿基线、权限只做可见性。

## [2026-11-18] ingest | tools / static-legacy / openspec modules + 4 entities

- 范围：`tools/**`、`static/**`、`openspec/**`、`start.sh`、`package.json`、`docs/qa-report.md`、`docs/backend-test-report.md`。
- 产出：`modules/{tools,static-legacy,openspec}.md` + `entities/{tools-e2e-harness,tools-pixel-qa,static-legacy-app,openspec-change}.md`。
- 核实要点：E2E 四脚本编排与副作用、像素工具依赖（gitignored `tools/pylib`）、OpenSpec 归档结构、历史静态版与 SPA 的关系。

## [2026-11-18] ingest | concepts (8) + flows (6) + overview

- 产出：`overview.md`；`concepts/{auth-rbac,token-governance,metering-analytics,design-fidelity,testing-verification,security-posture,openspec-workflow,known-issues}.md`；`flows/{login-session,gateway-request,dashboard-aggregation,user-management,role-permission-change,alert-generation}.md`。
- `concepts/known-issues.md` 汇总建设期逐文件核实的实现坑与文档漂移（seed 版本读写错位、限流窗口自放大、Key 策略两套合并、最后超管无保护、前端权限可见性、图表启发式等）。

## [2026-11-18] lint | full graph — 48 content pages

- 检查项：frontmatter 完整性与 YAML 可解析、`source_files` 全部存在、wikilink 目标存在、实体页 module 回链、代码围栏配平、页面长度、入链孤立页。
- 索引：`index.md` 已覆盖 48 个内容页（1 overview + 5 modules + 28 entities + 8 concepts + 6 flows）。
- 已知待办：文档漂移（`README.md` 的 static/OpenSpec 路径、`docs/system-architecture.md` 的 `src/users/` 旧描述、归档 `design.md` 的 `usage_buckets` 小时桶/`sessions` 表）已记录在 [[concepts/known-issues]]，本轮不修改源码与归档规格。
- 维护建议：代码变更后按 `CLAUDE.md` 的 ingest 流程更新对应 module/entity/concept/flow 页，并重跑 lint；提交 `wiki/` 即形成审计历史。
