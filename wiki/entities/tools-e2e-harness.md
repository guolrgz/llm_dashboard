---
title: E2E 验收套件（tools/e2e）
source_files:
  - tools/e2e/run.mjs
  - tools/e2e/lib.mjs
  - tools/e2e/e2e-console.mjs
  - tools/e2e/e2e-gateway.mjs
  - tools/e2e/pixel-check.mjs
  - tools/e2e/responsive-check.mjs
  - tools/e2e/recon.mjs
updated: 2026-11-18
tags: [entity, tooling, testing]
---

# E2E 验收套件（tools/e2e）

> 所属模块：[[modules/tools]]

一组 Node ESM 脚本，用 Playwright + 原生 `fetch` 对“真实前端 dev server + 真实后端”做功能与视觉验收。它们不启动服务、不 mock 接口，验收结论直接写进 `docs/qa-report.md`，是 `openspec/changes` 里各 capability 场景的最终证据。

## 用途

- 证明登录守卫、导航、用户 CRUD、网关调用、限流/配额、告警、响应式在浏览器里真的可用。
- 把每个检查点变成 `PASS/FAIL` 行 + JSON + 截图，失败时给出可复现命令。
- 作为回归入口：改前端或后端后重跑 `run.mjs`，与历史报告对比。

## 文件与职责

| 文件 | 职责 | 结果文件 |
|---|---|---|
| `run.mjs` | 总编排：就绪探测 → 顺序跑 4 个脚本 → 可选 build → pytest → 写报告 | `tools/out/e2e/run.json` |
| `lib.mjs` | 共享库：Chromium 环境、`apiCall`/`loginApi`、等待、选择器、`Report` | — |
| `e2e-console.mjs` | 登录/守卫/KPI/6 页导航/用户增查改停删/退出 | `e2e-console.json` |
| `e2e-gateway.mjs` | Key 签发 → 3 次推理 → SSE → 429 限流/配额 → 告警 → 吊销 | `e2e-gateway.json` |
| `pixel-check.mjs` | Dashboard vs `index.png`、用户页 vs `users.jpg` | `pixel-check.json` |
| `responsive-check.mjs` | 5 档宽度溢出 + 移动抽屉 | `responsive-check.json` |
| `recon.mjs` | DOM 侦察（导航/按钮/输入框/`data-testid` 摘要） | `recon.json` |

## 入口与关键函数

`lib.mjs` 是理解整套脚本的关键，导出：

- 环境常量：`HERE`、`TOOLS`、`PROJECT`、`OUT_DIR`、`DEFAULT_FRONTEND`、`DEFAULT_BACKEND`、`DEMO`（`admin/admin123`、两个演示 Key）。
- CLI/URL：`parseArgs(defaults)`（`--k=v` 或 `--flag`，键名转 camelCase）、`resolveUrls(args)`。
- HTTP：`apiCall(origin, pathname, { method, token, body, timeoutMs })`、`loginApi(origin)`。
- 就绪：`waitForBackend(base, {...})`（轮询 `/health`）、`waitForFrontend(base, {...})`。
- 浏览器：`launchBrowser()`、`newInstrumentedPage(browser, { token, viewport, dsf })`（注入 `localStorage.llm_token` + 收集 console/pageerror）、`primeToken`、`attachErrorCollectors`、`settle`、`screenshot`。
- 交互：`findVisible`、`hasVisible`、`fillFirst`、`clickFirst`、`selectByLabel`、`waitForBodyText`、`waitForAny`、`waitForConsoleReady`、`hasLoginForm`、`uiLogin`、`clickSidebarNav`、`gotoNav`、`hashOf`。
- 结果：`Report` 类（`pass/fail/check/step/info/shot/finish`）、`runScript(name, fn)`、`saveJson`、`readJson`、`parseSummaryFromPytest`、`NAV_LABELS/NAV_MARKERS/NAV_HASH`。

`run.mjs` 的参数：

| 参数 | 默认 | 作用 |
|---|---|---|
| `--frontend` | `http://127.0.0.1:5173` | 控制台地址（所有 API 也经它走 Vite 代理） |
| `--backend` | `http://127.0.0.1:8000` | 只用于 `/health` 就绪探测 |
| `--only` | `console,pixel,responsive,gateway` | 逗号分隔的子集 |
| `--build` | 关 | 追加 `npm run build` |
| `--skip-pytest` | 关 | 跳过后端 pytest |
| `--no-wait` / `--wait-timeout` | 180000ms | 跳过或调整就绪等待 |
| `--report` | `docs/qa-report.md` | 报告输出路径 |

退出码：`0` 全通过，`1` 有失败，`2` 服务未就绪（写“待复验”报告）。

## 运行方式

```bash
bash start.sh                                   # 另开终端，保持前后端运行
node tools/e2e/run.mjs --frontend=http://127.0.0.1:5173 \
  --backend=http://127.0.0.1:8000 --build
node tools/e2e/e2e-console.mjs                  # 单跑，也支持 --frontend/--backend
node tools/e2e/pixel-check.mjs --threshold=24
node tools/e2e/recon.mjs --routes=/,/users,/traffic
```

`e2e-console.mjs` 会用 API 预登录，然后在页面里真实提交表单；测试用户名形如 `e2e_<base36 时间戳>`，结束时删除残留用户。`e2e-gateway.mjs` 通过 `POST /api/keys` 创建三类 Key（普通 `rpmLimit=120`、限流 `rpmLimit=2`、配额 `dailyQuota=100`），最后 `DELETE /api/keys/{id}` 清理。

## 产物路径

```text
tools/out/e2e/
  run.json / e2e-console.json / e2e-gateway.json / pixel-check.json / responsive-check.json
  logs/{console,pixel,responsive,gateway,build,pytest}.log
  e2e-console-01-login.png … e2e-console-10-logout.png
  pixel-check-dashboard-1672x941.png / pixel-check-users-1376x768@2x.png
  pixel-dashboard-diff.png / pixel-dashboard-heatmap.png / pixel-dashboard-diff.json
  pixel-users-diff.png / pixel-users-heatmap.png / pixel-users-diff.json
  responsive-check-*.png / e2e-gateway-traffic-page.png / e2e-gateway-dashboard-after-gateway.png
docs/qa-report.md
docs/backend-test-report.md
```

## 与源码/文档的对应

- `run.mjs` 的执行顺序对应 `docs/qa-report.md` §4 的结果表；`e2e-console` / `e2e-gateway` 的检查项对应报告 §5.1 / §5.4。
- `pixel-check.mjs` 的分区 bbox（Sidebar 0,0,260,941；Topbar 260,0,1412,68；KPI row 291,190,1360,130 …）与 `tools/diff.mjs`、`docs/design-spec.md` 同源。
- 断言里的接口路径与 [[entities/backend-traffic-gateway]]、[[entities/backend-analytics]] 的实现一致；token 注入方式见 [[entities/frontend-api-client]]。
- 报告结论支撑 [[concepts/testing-verification]]。

## 坑与注意点

1. **必须在 `import('playwright')` 之前设置环境**：`PLAYWRIGHT_BROWSERS_PATH=tools/browsers`、`LD_LIBRARY_PATH` 指向 `tools/libs` 下解包的 `.deb` 系统库。`lib.mjs` 在模块顶层做了这件事，新增脚本请复用它而不是直接 import playwright。
2. **`--backend` 不承载业务请求**：所有 `/api`、`/v1` 调用都发往 `frontend`，目的就是验证 Vite 代理；后端地址只用于健康检查。代理配置见 [[modules/frontend]]。
3. **网关用例必须最后跑**：它会真实写 `request_logs`、`usage_buckets`、`alerts`，让 KPI 从 128,960 增长；提前跑会让像素基线数值失配（报告 §3.5 专门记录这个增量）。
4. **像素结论依赖干净种子**：`users.jpg` 基线是 48 行、设计稿导航含“模型管理”，而实现是 128 用户、6 项导航，所以“用户页差异”永远包含数据差异；判定看外壳 ≤6% 而非总体。
5. **JPEG 基线要 Pillow**：`pixel-check.mjs` 用 `PYTHONPATH=tools/pylib` 调 Python 把 `users.jpg` 无损转 PNG；`tools/pylib` 是 gitignore 的 vendor 目录，缺失时该检查直接抛错。
6. **报告文件是共享的**：`run.mjs` 与旧 `tools/diff.mjs` 都默认写 `docs/qa-report.md`，先跑旧工具会覆盖验收报告。
7. **选择器是“候选列表”而非精确契约**：`DIALOG_ROOTS`、`CONFIRM_BUTTONS`、`HAMBURGER_SELECTORS` 都是一组候选，改 DOM 时优先补候选或加 `data-testid`，不要把脚本改成只认某一个 class。
8. **单跑脚本不会自动拉起服务**：先 `bash start.sh`，否则 `waitForBackend` 超时、退出码非 0；`--no-wait` 只适合你确信服务已在。

## 相关页面

- [[modules/tools]]、[[entities/tools-pixel-qa]]
- [[flows/gateway-request]]、[[flows/login-session]]
- [[concepts/testing-verification]]、[[concepts/design-fidelity]]
