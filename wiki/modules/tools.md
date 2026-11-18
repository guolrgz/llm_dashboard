---
title: 开发期 QA 与验证工具（tools/）
source_files:
  - tools/e2e/run.mjs
  - tools/e2e/lib.mjs
  - tools/e2e/e2e-console.mjs
  - tools/e2e/e2e-gateway.mjs
  - tools/e2e/pixel-check.mjs
  - tools/e2e/responsive-check.mjs
  - tools/e2e/recon.mjs
  - tools/shot.mjs
  - tools/diff.mjs
  - tools/measure.mjs
  - tools/reference-measure.mjs
  - tools/compare-crop.mjs
  - tools/compare-probes.mjs
  - tools/interaction-test.mjs
  - tools/qa.sh
  - tools/package.json
  - tools/spec/analyze.py
  - tools/users/diff.mjs
  - tools/users/interaction-test.mjs
updated: 2026-11-18
tags: [module, tools]
---

# 开发期 QA 与验证工具（tools/）

`tools/` 不是产品运行时代码，而是开发与验收期的工具链：给 Dashboard / 用户页做像素级复刻，给整套系统做浏览器端到端验收，并把结果写成 `docs/qa-report.md`、`docs/backend-test-report.md` 这类可交付证据。运行期应用不 import 这里的任何文件。

## 职责

- **视觉回归**：截图 → 逐像素 diff → 分区/热区统计 → 裁剪对照图，基线是 `index.png`（1672×941）与 `users.jpg`（1376×768 @2x → 2752×1536）。
- **设计反解**：从原型图量出盒子、颜色、字号、网格线坐标，反哺 `docs/design-spec.md`、`docs/users-design-spec.md`。
- **功能验收**：Playwright 驱动真实前后端，覆盖登录守卫、导航、用户 CRUD、推理网关、限流/配额、告警与五档响应式。
- **报告汇总**：`tools/e2e/run.mjs` 生成整套验收报告；旧版 `tools/qa.sh` 生成视觉版报告。

## 目录结构

```text
tools/
  e2e/                 新一代验收套件（需前后端在跑）
    run.mjs            总入口：就绪探测 → 4 个脚本 → build → pytest → 报告
    lib.mjs            共享库：Chromium 环境、断言、截图、HTTP、报告
    e2e-console.mjs    控制台 E2E（登录/守卫/KPI/导航/用户 CRUD/退出）
    e2e-gateway.mjs    推理网关端到端（Key/usage/SSE/429/告警）
    pixel-check.mjs    Dashboard 与用户页像素回归
    responsive-check.mjs 五档宽度 + 移动抽屉
    recon.mjs          DOM 侦察，调试用，不参与结论
  shot.mjs             定视口截图（可换 URL/宽高/DPR）
  diff.mjs             与 index.png 比对并写视觉 QA 报告
  measure.mjs          从 index.png 反解几何/颜色/图表坐标
  reference-measure.mjs 基线图与当前图的双图对照测量
  compare-crop.mjs     裁一块区域做基线/当前并排图
  compare-probes.mjs   双图几何与颜色探针差值表
  interaction-test.mjs 交互冒烟（旧，未处理登录态）
  qa.sh                shot → diff → reference-measure 串跑
  spec/analyze.py      Pillow 像素分析（row/col/px/crop/uniq）
  users/               用户管理页专用截图/diff/测量/交互脚本
  package.json         playwright + pngjs
  out/                 全部产物（gitignore）
```

## 入口命令

| 目的 | 命令 | 前置 |
|---|---|---|
| 完整验收 | `node tools/e2e/run.mjs --frontend=http://127.0.0.1:5173 --backend=http://127.0.0.1:8000 --build` | 前后端已启动 |
| 只跑部分用例 | `node tools/e2e/run.mjs --only=console,pixel` | 同上；key 为 `console/pixel/responsive/gateway` |
| 单跑控制台 E2E | `node tools/e2e/e2e-console.mjs` | 同上 |
| 单跑网关用例 | `node tools/e2e/e2e-gateway.mjs` | 会真实写入流量并创建/吊销 Key |
| 像素回归 | `node tools/e2e/pixel-check.mjs` | 需登录态（脚本自行 API 登录注入 token） |
| 响应式 | `node tools/e2e/responsive-check.mjs` | 同上 |
| 旧版视觉 QA | `bash tools/qa.sh` | 默认抓 `http://127.0.0.1:5173/` |
| 单步截图/比对 | `node tools/shot.mjs --url=file:///.../static/index.html`、`node tools/diff.mjs` | 需要 `tools/node_modules` 与 `tools/browsers` |

## 产出物

| 路径 | 生成者 | 说明 |
|---|---|---|
| `docs/qa-report.md` | `e2e/run.mjs`（新）/ `diff.mjs`（旧） | 同名文件，两套工具会互相覆盖 |
| `docs/backend-test-report.md` | `e2e/run.mjs` | pytest 结果解析与日志尾部 |
| `tools/out/e2e/*.json` | 各 e2e 脚本 `Report.finish()` | 机器可读结果（steps/infos/screenshots） |
| `tools/out/e2e/logs/*.log` | `run.mjs` | console/pixel/responsive/gateway/build/pytest 日志 |
| `tools/out/e2e/*.png` | `Report.shot()` | 截图，文件名前缀为脚本名 |
| `tools/out/current.png` + `*-meta.json` | `shot.mjs` | 旧视觉链路的当前截图与元数据 |
| `docs/diff.png`、`docs/diff-heatmap.png`、`docs/crops/hotspot-N.png` | `diff.mjs` | 并排图、热力图、热点裁剪 |
| `tools/out/measure.json`、`tools/out/detail.json`、`tools/out/diff-stats.json` | `measure.mjs` / `reference-measure.mjs` / `diff.mjs` | 测量与统计 JSON |

## 与主应用的关系

- 只读取 `src/` 构建出的页面与 `backend/` 暴露的 API，不修改业务代码；产物全部落在 `docs/` 与 `tools/out/`。
- 依赖主应用的两个约定：前端 hash 路由（`#/login`、`#/users`…）与登录令牌写 `localStorage.llm_token`（见 [[entities/frontend-api-client]]、[[entities/frontend-router-guard]]）。
- 视觉基线来自仓库根的 `index.png` / `users.jpg`；像素回归的具体做法见 [[entities/tools-pixel-qa]]。
- 验收结论支撑 [[concepts/testing-verification]] 与 [[concepts/design-fidelity]] 两个主题页。

## 设计要点与坑

1. **两代工具链并存**：`tools/e2e/*` 是接入后端后的验收套件，`tools/{shot,diff,measure,compare-*,qa.sh}` 是纯前端像素复刻期的工具。功能重叠但输出路径冲突，见下条。
2. **`docs/qa-report.md` 是共享且会被覆盖的文件**：`e2e/run.mjs` 的 `--report` 默认 `docs/qa-report.md`，`tools/diff.mjs` 的 `--report` 默认也是它。先跑完 e2e 再跑 `qa.sh`，验收报告会被视觉报告替换。
3. **Chromium 运行时靠环境变量**：Playwright 与浏览器分别在 `tools/`、`tools/browsers`，系统库解包在 `tools/libs`。所有脚本必须在 `import('playwright')` **之前**设置 `PLAYWRIGHT_BROWSERS_PATH` 与 `LD_LIBRARY_PATH`；`lib.mjs`、`shot.mjs`、`interaction-test.mjs` 各自复制了这段样板。
4. **必须有已启动的前后端**：e2e 脚本只做就绪探测，不代起服务；`run.mjs` 在服务未就绪时以退出码 `2` 写出“待复验”报告，而不是报错崩溃。
5. **网关用例会改数据**：`e2e-gateway.mjs` 真实签发 Key、发推理请求、触发 429 并写告警；`run.mjs` 故意把它排在最后，避免污染 Dashboard 像素基线的 KPI 数值。跑完想回到 128,960 基线需删 `backend/data/app.db*` 重新种子。
6. **旧 `interaction-test.mjs` 不带登录态**：它直接打开 `/` 并断言时间范围 tab 与抽屉，当前 SPA 会先跳 `/login`，因此 `npm run test:ui` 需要先注入 token 或改用 e2e 套件。
7. **`qa.sh` 的 sed 段落已过期**：它按 `## 9. Mismatch-pixel ranking` 截取摘要，而 `diff.mjs` 现在写的是 `## Top mismatching regions`，最后一段摘要为空；`shot.mjs` 默认抓 `/` 也会落在登录页。
8. **`tools/package.json` 是 `"type": "commonjs"`**，而脚本都是 `.mjs`；新增脚本请继续用 `.mjs`，否则 `import` 语法会失效。
9. **产物目录全部 gitignore**：`tools/out/`、`tools/browsers/`、`tools/libs/`、`tools/pylib/`、`tools/spec/crops/`、`tools/node_modules/`、`tools/.venv*`，不要把它们当提交内容引用。

## 相关页面

- [[entities/tools-e2e-harness]] — 六个 `tools/e2e/*.mjs` 的入口、参数与产物。
- [[entities/tools-pixel-qa]] — 截图/diff/测量/裁剪链路与 `qa.sh`。
- [[modules/static-legacy]] — 像素链路的原始对照对象。
- [[concepts/testing-verification]]、[[concepts/design-fidelity]]
