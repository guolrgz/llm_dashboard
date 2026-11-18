---
title: 设计稿还原与「数据一致性」取舍
source_files:
  - index.png
  - users.jpg
  - docs/design-spec.md
  - docs/users-design-spec.md
  - src/styles.css
  - tools/shot.mjs
  - tools/diff.mjs
  - docs/qa-report.md
updated: 2026-11-18
tags: [concept, design, fidelity, frontend]
---

# 设计稿还原与「数据一致性」取舍

## 来源与目标

系统有两份设计基线：

| 基线 | 尺寸 | 页面 |
|---|---|---|
| `index.png` | 1672×941 | Dashboard（深色侧栏 256px、白色顶栏 68px、7 个卡片） |
| `users.jpg` | 1376×768 CSS @2x（2752×1536 图像） | 用户管理（紧凑侧栏 215px、顶栏 53px、筛选卡 + 表格 + 分页） |

项目最初是“像素级静态还原”任务，后来演进为可运行系统；视觉基线、设计 token、字体、响应式行为全部保留，数据由 mock 切换为真实 API。历史原生静态版仍在 `static/`（见 [[modules/static-legacy]]）。

## 视觉实现要点

- **颜色 token**：侧栏 `#19223a`、选中态 `#3254a0`、页面背景 `#f4f6fb`、主蓝 `#3f7cf5`、成功绿 `#10b981`、紫 `#8b5cf6`、橙 `#f59e0b`、卡片白底 + 12px 圆角 + 极浅描边/阴影，均按设计稿取色。
- **字体**：Inter + Noto Sans SC 可变字重，本地 `woff2` 子集（按设计稿用字裁剪，约 60KB）；系统扩展新文案后补充了 `noto-sans-sc-extra.woff2`（覆盖全部 800+ 汉字），以 `"Noto Sans SC Ext"` 字形回退接入。见 [[modules/frontend]]。
- **零图表依赖**：折线/面积图、环形图、sparkline 全部原生 SVG 手写（单调三次插值、渐变面积、分段圆环、十字准星 tooltip），未引入 ECharts/Chart.js。见 [[entities/frontend-charts]]。
- **响应式**：以 1672 宽为基准对齐；1500/1280/1080 断点收敛栅格；≤900px 侧栏变抽屉；≤700px 单列、环形图纵排、表格横向滚动。1672/1440/1024/768/390 均无横向溢出。
- **用户页列映射照设计稿**：设计稿表头「用户ID」列显示 `username`、「用户名」列显示 `userNo`，与语义相反，但为了像素基线**照抄**；代码与文档都明确标注这是设计稿已知不一致。见 [[entities/frontend-users-view]]。

## 核心取舍：设计稿自身数据不自洽

`index.png` 的图表数据与 KPI 数值互相矛盾：

- 趋势图 95 个点求和约 483 万请求，而 KPI「总请求量」是 128,960；
- 两条曲线（总请求/成功请求）隐含成功率约 88.5%，而 KPI「成功率」是 99.2%；
- 环形图视觉有 5 段（含一段未标注色块），图例只有 4 项且合计 100%。

作为**可运行系统**，必须选一个口径。当前决策：

1. **KPI 精确复现原型**：128,960 / 1.24B / 99.2%。
2. **趋势曲线保留原型形状**，但按比例缩放到与 128,960 一致的总量 → y 轴变成 0–2.5k（原型写 0–100k）。
3. **成功率按 99.2% 生成** → 绿色成功曲线与蓝色总请求曲线几乎重合（原型有明显缺口）。
4. **环形图按真实数据渲染 4 段**（40.2/32.6/18.1/9.1，合计 100%），不保留未标注的第 5 段。
5. 布局、卡片几何、颜色、字号、间距保持像素基线；差异集中在“数据文本/曲线高度”。

这就是 Dashboard 像素差异 ≈5.5% 的主要来源；**外壳区域（侧栏/顶栏/页头）与历史基线逐像素一致**（4.36% / 2.50% / 3.49% 是设计图与 headless Chromium 的既有渲染差异）。

## 测量与验收方法

- `tools/shot.mjs`：Playwright 固定视口截图（1672×941、DPR 1），并处理 Chromium 系统库/字体环境。
- `tools/diff.mjs` / `tools/compare-*.mjs` / `tools/measure.mjs`：逐像素差异、分区 bbox 统计、裁剪对比。
- `tools/e2e/pixel-check.mjs`：登录后截图 Dashboard 与用户页，与设计稿比对并输出总差异/分区差异/热力图；报告写入 `docs/qa-report.md`。
- 判定口径：**总体 ≤6% + 外壳区域不高于历史基线**，并区分“结构性回归”与“数据差异”。

## 坑与注意点

- **不要为了降 diff 伪造数据**：接口返回什么就渲染什么（前端不做硬编码），否则系统失去真实性。
- **字体裁剪会缺字**：新增中文文案需重新裁剪字体子集，否则出现“豆腐块”；当前已用 extra 字体兜底。
- **headless 渲染差异是基线的一部分**：设计图是 AI 渲染的软图，文字抗锯齿/JPEG 噪点无法归零；不要追 0%。
- **用户页 128 条数据 vs 设计 48 条**：分页变成 13 页、表格内容不同，属于数据差异而非布局回归。

## 相关页面

- [[modules/frontend]]、[[modules/tools]]、[[modules/static-legacy]]
- [[entities/frontend-dashboard-view]]、[[entities/frontend-charts]]、[[entities/frontend-users-view]]
- [[entities/tools-pixel-qa]]、[[concepts/testing-verification]]
- [[flows/dashboard-aggregation]]
