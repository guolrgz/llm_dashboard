---
title: 像素 QA 工具链（截图 / diff / 测量 / 裁剪）
source_files:
  - tools/shot.mjs
  - tools/diff.mjs
  - tools/measure.mjs
  - tools/reference-measure.mjs
  - tools/compare-crop.mjs
  - tools/compare-probes.mjs
  - tools/interaction-test.mjs
  - tools/qa.sh
  - tools/spec/analyze.py
  - tools/users/shot.mjs
  - tools/users/diff.mjs
  - tools/users/measure.py
updated: 2026-11-18
tags: [entity, tooling, testing]
---

# 像素 QA 工具链（截图 / diff / 测量 / 裁剪）

> 所属模块：[[modules/tools]]

这套脚本解决一个具体问题：**没有 Figma 源文件，只有 `index.png` 和 `users.jpg`**。它们把设计图当作“基线位图”，通过截图、逐像素比对、几何反解与局部放大，把“看起来差不多”变成可复现的坐标、颜色和差异百分比。

## 用途

- 截图：以固定视口/DPR/字体渲染参数产出确定性 PNG。
- 比对：与基线图逐像素比较，给出总体差异率、分区差异、热点区域与并排/热力图。
- 反解：从基线图量出盒子、字号、颜色、折线网格与环形图几何，形成 `docs/design-spec.md`。
- 定位：裁出差异区域放大对照，指导改 CSS。
- 冒烟：`interaction-test.mjs` 验证时间范围切换、图表 tooltip、侧栏折叠/移动抽屉。

## 主链路（Dashboard vs index.png）

```text
node tools/shot.mjs            → tools/out/current.png (+ current-meta.json)
node tools/diff.mjs            → docs/qa-report.md / docs/diff.png / docs/diff-heatmap.png
                                 docs/crops/hotspot-N.png / tools/out/diff-stats.json
node tools/reference-measure.mjs → 追加 docs/qa-report.md 详细测量段 + tools/out/detail.json
bash tools/qa.sh               → 以上三步串跑，并打印热点摘要
```

用户页是另一条并行链路：`tools/users/shot.mjs` → `tools/users/diff.mjs`，基线 `users.jpg`（1376×768 @2x → 2752×1536），报告写 `docs/users-qa-report.md`、`docs/users-diff.png`、`docs/users-crops/`。

## 入口与关键参数

| 脚本 | 参数 | 默认 / 说明 |
|---|---|---|
| `shot.mjs` | `--url` `--out` `--width` `--height` `--dpr` `--settle` `--fullpage` `--timeout` | 默认 `http://127.0.0.1:5173/`、`tools/out/current.png`、1672×941、DPR 1、settle 300ms |
| `diff.mjs` | `--base` `--current` `--report` `--image` `--heatmap` `--crops` `--stats` `--threshold` `--top` | `index.png` / `tools/out/current.png` / `docs/qa-report.md` / 阈值 24 / top 10 |
| `measure.mjs` | `--image` `--out` | 默认量 `index.png`，写 `tools/out/measure.json` |
| `reference-measure.mjs` | 无参数 | 固定读 `index.png` + `tools/out/current.png` |
| `compare-crop.mjs` | `--rect=x,y,w,h` `--scale` `--out` `--stack=v\|h` `--base` `--cur` `--gap` | 输出基线/当前并排图，缺图处填洋红 |
| `compare-probes.mjs` | `--base` `--cur` | 打印探针差值表 + 网格线行/列 + 环形图几何 |
| `interaction-test.mjs` | `--url` | 默认 `/`，1672×941；无登录态 |
| `spec/analyze.py` | `row Y`、`col X`、`px x,y`、`crop x0 y0 x1 y1 out [scale]`、`uniq` | 需要 `PYTHONPATH=tools/.pylibs` |

`shot.mjs` 的确定性设置：等 `document.fonts.ready`、`networkidle`（best-effort）、注入样式禁用动画/过渡/光标、`animations: 'disabled'`、按视口 `clip` 截图；页面高于视口时额外存 `*-full.png` 并在 meta 里记 `overflow`。

`diff.mjs` 的度量：先按命名分区（Sidebar / Topbar / Page header / KPI row / Chart row / Table row）统计，再做 16×8 网格，再用 16px 块做连通域找热点；某个像素的**最大通道差 > threshold(24)** 才算差异像素。判定档位为 `≤0.5% PASS`、`≤2% CLOSE`、`≤6% NEEDS WORK`、`>6% FAR OFF`。

## 产物路径

| 路径 | 说明 |
|---|---|
| `tools/out/current.png`、`current-meta.json` | 当前截图 + 尺寸/溢出/字体/console error |
| `tools/out/measure.json` | 基线图的组件盒子、图表标定、环形图角度 |
| `tools/out/detail.json` | 双图对照的逐组件测量 |
| `tools/out/diff-stats.json` | 差异像素、分区、网格、热点（机器可读） |
| `docs/qa-report.md` | 视觉 QA 报告（会被新 E2E 套件同名覆盖） |
| `docs/diff.png`、`docs/diff-heatmap.png` | 并排图、差异热力图 |
| `docs/crops/hotspot-N.png` | 每个热点的基线/当前 2× 放大对照 |
| `tools/spec/crops/*.png` | 反解基线时保存的参考裁剪（`sidebar.png`、`donut-3x.png` 等，gitignore） |
| `tools/out/mobile-drawer.png` | `interaction-test.mjs` 的移动抽屉截图 |

## tools/spec 与 crops 流程

1. `PYTHONPATH=tools/.pylibs python3 tools/spec/analyze.py row 190 0 1672` 扫描某一行，得到色块区间（`x a-b #hex len=N`）。
2. `col` 扫列、`px` 取点色、`uniq` 统计区域内主色，确定边框/底色/文字色。
3. `crop` 把可疑区域放大 3–8 倍存到 `tools/spec/crops/`，肉眼确认圆角、渐变、图标形状。
4. 结论写进 `docs/design-spec.md`（全局布局、色板、字号、卡片几何、图表标定），成为 CSS 与 `diff.mjs` 分区 bbox 的来源。
5. 实现完成后用 `compare-crop.mjs --rect=...` 反复对照同一块区域，直到热点收敛。

## 与源码/文档的对应

- 分区 bbox 与 `docs/design-spec.md` 的卡片表、`tools/e2e/pixel-check.mjs` 的 `DASHBOARD_REGIONS` / `USERS_REGIONS` 同源。
- 测量出的设计 token 落在 `static/styles.css` 与 `src/styles.css` 的 `:root`（侧栏 `#19223a`、主蓝 `#3f7cf5`、`--sidebar-w: 260px`、`--radius-card: 12px`）。
- 视觉结论与“允许的数据差异”解释见 [[concepts/design-fidelity]]；验收口径见 [[concepts/testing-verification]]。

## 坑与注意点

1. **`qa.sh` 的摘要段已经失效**：它 `sed` 的区间是 `## 9. Mismatch-pixel ranking`，而 `diff.mjs` 当前输出的是 `## Top mismatching regions`；起始地址匹配不到时 `sed` 不输出任何行，`head -14` 也就为空。报告文件本身仍然正常生成。
2. **`qa.sh` 会覆盖验收报告**：`diff.mjs` 默认写 `docs/qa-report.md`，与 `tools/e2e/run.mjs` 同一个文件。跑完 E2E 后再跑 `qa.sh`，`docs/qa-report.md` 会从“系统验收报告”变成“视觉回归报告”。
3. **`shot.mjs` 默认 URL 在 SPA 上会拍到登录页**：`http://127.0.0.1:5173/` 受登录守卫保护。要么用 e2e 套件（会注入 token），要么指向静态版 `--url=file:///home/student/code/llm_dashboard/static/index.html`。
4. **`analyze.py` 里写死了绝对路径**：`IMG = "/home/student/code/llm_dashboard/index.png"`，换机器/换目录需先改这行；它依赖 `PYTHONPATH=tools/.pylibs`（Pillow 13）。
5. **`diff.mjs` 只吃 PNG**：`users.jpg` 必须先无损解码为 PNG（`pixel-check.mjs` 用 `tools/pylib` 的 Pillow 做这一步），直接传 JPEG 会读失败。
6. **尺寸必须严格一致**：基线 1672×941、用户页 2752×1536；DPR 或视口差一点，差异率就会暴涨。用户页要 `--dpr=2` / `deviceScaleFactor: 2`。
7. **阈值是“最大通道差”**：`--threshold=24` 意味着轻微抗锯齿/子像素不会计入，但颜色偏差 20 也不会被发现；改阈值要同步解释报告结论。
8. **数据驱动区域天然有差异**：趋势曲线、sparkline、KPI 数字来自真实 API，`Chart row`/`KPI row` 的 7% 左右差异是预期的；判定看外壳（侧栏/顶栏/页头）是否回退。
9. **字体渲染是跨机器的**：headless Chromium 的 hinting/抗锯齿与设计图渲染栈不同，小字号 0–2% 差异属正常，不要为此改字号。
10. **`interaction-test.mjs` 是旧脚本**：它不登录、直接断言 `#chartTip` 与时间范围 tab；在当前带守卫的 SPA 上 `npm run test:ui` 会停在登录页。功能验收请用 [[entities/tools-e2e-harness]]。
11. **`tools/users/shot.mjs` 的默认 URL 也已过时**：默认抓 `http://127.0.0.1:5173/users.html`，而该地址现在只是跳转到 `#/users` 的别名且受登录守卫保护；要复现旧报告需注入 token 或直接用 `pixel-check.mjs`。

## 相关页面

- [[modules/tools]]、[[entities/tools-e2e-harness]]
- [[modules/static-legacy]]、[[entities/static-legacy-app]]
- [[concepts/design-fidelity]]、[[concepts/testing-verification]]
