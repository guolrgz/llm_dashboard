---
title: 测试与验收体系
source_files:
  - backend/tests
  - tools/e2e
  - docs/qa-report.md
  - docs/backend-test-report.md
  - package.json
updated: 2026-11-18
tags: [concept, testing, quality]
---

# 测试与验收体系

## 分层策略

系统有三层自动化验证，彼此互补：

| 层 | 工具/位置 | 覆盖 | 当前结果 |
|---|---|---|---|
| 后端接口/单元 | pytest，`backend/tests/` | 认证、RBAC、用户 CRUD、模型/Key/配额/设置、网关全分支、分析聚合、告警、seed 基线 | **86 passed / 0 failed** |
| 浏览器 E2E | Playwright，`tools/e2e/` | 登录守卫、Dashboard 真实数据、导航、用户 CRUD、退出、网关端到端、流式、限流/配额、像素/响应式 | 37/37 + 15/15 + 9/9 + 22/22 |
| 构建/静态 | `npm run build` / Vite | 生产构建、懒加载 chunk、字体/样式产出 | 通过（约 4–7s） |

## 后端测试（pytest）

- **隔离方式**：`backend/tests/conftest.py` 为每个测试创建独立临时 SQLite 文件（`create_app(tmp_path / "app.db")`），不污染演示库；`client` / `auth_headers` / `admin_token` / `demo_api_key` 为共享 fixture。
- **依赖**：`backend/install.sh` 把 FastAPI/Uvicorn/Pydantic/httpx/pytest vendored 到 `backend/vendor/`（该目录 gitignore），运行时通过 `PYTHONPATH` 引入。
- **运行**：
  ```bash
  npm run api:test
  # 等价于 cd backend && PYTHONPATH="$(pwd)/vendor:$(pwd)" python3 -m pytest tests/ -q
  ```
- **覆盖文件**：`test_smoke`（seed 基线：128,960/1.24B/99.2%）、`test_security`（PBKDF2/JWT/API Key）、`test_auth`、`test_rbac`、`test_users`、`test_models_keys`、`test_quota_settings`、`test_traffic`（网关成功/流式/401/403/404/400/限流/配额/上游）、`test_analytics`（三范围/非法范围/分布/趋势点位）、`test_alerts`。
- **注意**：`test_analytics` 的断言直接锁原型基线数值（128,960 / 1.24B / 99.2%、yTicks、分布），改动 seed/聚合口径时必须同步更新。

## 浏览器 E2E（tools/e2e）

入口 `node tools/e2e/run.mjs`（可加 `--frontend` / `--backend` / `--build`），串行跑 4 个脚本并生成 `docs/qa-report.md` 与 `docs/backend-test-report.md`：

1. `e2e-console.mjs`：未登录守卫 → 登录 → Dashboard KPI（≥128,960 基线容差）→ 侧栏 6 页导航与高亮 → 用户新增/搜索/编辑角色/停用/删除 → 退出；含 `pageerror` / console error 检查。
2. `e2e-gateway.mjs`：经 Vite 代理创建真实 Key → 3 次非流式校验 `usage` 与日志一致 → SSE `[DONE]` → 低 RPM 429+`Retry-After` → 低配额 429 → 告警/流量页可见 → 吊销清理；同时断言 Key 列表不泄露明文。
3. `pixel-check.mjs`：登录态 1672×941 截 Dashboard、1376×768@2x 截用户页，与 `index.png` / `users.jpg` 逐像素比对，输出总差异/分区差异/热力图。
4. `responsive-check.mjs`：1672/1440/1024/768/390 × 多页面检查横向溢出与移动端抽屉。

**运行前置**：前端 5173、后端 8000 就绪；Playwright/Chromium 在 `tools/node_modules`、`tools/browsers`，脚本自行设置 `PLAYWRIGHT_BROWSERS_PATH` 与 `LD_LIBRARY_PATH`（复用 `tools/shot.mjs` 的做法）。

## 像素验收口径

- Dashboard：总体 ≤6%，且外壳（侧栏/顶栏/页头）不高于历史基线；数据文本与曲线数值差异不计为回归。
- 用户页：外壳区域不高于历史基线；内容区差异需区分“真实 128 行数据/分页/导航增强”与布局回归。
- 结果：Dashboard ≈5.51%、用户页 ≈5.83%（2026-11-18 最终轮）。

## 坑与注意点

- **网关测试会写库**：E2E 会真实创建 Key、写请求日志/用量/告警，导致 Dashboard KPI 增量（+个位数请求）。验收顺序应先 console/pixel 再 gateway，或验收后重置 DB；报告会分“测试前基线 / 测试后增量”记录。
- **DB 重置**：删 `backend/data/app.db*` 并重启即可回到 128,960 原型基线（会丢真实流量）。
- **测试数据污染**：用户 CRUD 用例会增删用户，最终应保持 128 用户；QA 脚本会自行清理。
- **旧交互测试已过时**：`tools/interaction-test.mjs` 等未适配登录守卫，以 `tools/e2e/` 为准。
- **npm audit**：生产依赖 0 漏洞；开发链 Vite→tinyglobby/picomatch 有 4 个 high（ReDoS，dev-only），见 [[concepts/security-posture]]。

## 相关页面

- [[modules/tools]]、[[entities/tools-e2e-harness]]、[[entities/tools-pixel-qa]]
- [[modules/backend]]、[[entities/backend-seed-data]]
- [[flows/gateway-request]]、[[flows/login-session]]
- [[concepts/design-fidelity]]
