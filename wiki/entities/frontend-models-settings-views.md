---
title: 前端模型管理与系统设置页
source_files:
  - src/views/ModelsView.vue
  - src/views/SettingsView.vue
  - src/components/console/ConsoleModal.vue
  - src/components/console/ConsoleState.vue
  - src/components/console/StatusPill.vue
  - src/components/console/ToastHost.vue
  - src/components/console/useToast.js
updated: 2026-11-18
tags: [entity, frontend, models, settings]
---

> 所属模块：[[modules/frontend]]

# 前端模型管理与系统设置页

`ModelsView.vue` 管理上游模型渠道（名称、供应商、单价、权重、启停、上游地址/密钥）；`SettingsView.vue` 管理默认配额/限流/告警阈值与运行时信息，并作为 `/models` 的入口。两页都用 `ConsoleModal` + `ConsoleState` + `StatusPill` + Toast 的通用套件。

## ModelsView

### 页面结构

```
main.content.console-page.models-page
├─ .page-head：标题 + “返回系统设置” + 新增模型（canManage）
├─ ConsoleState（!canView）
└─ section.card.models-card
   ├─ card-head：已启用 X / 共 Y + 刷新
   ├─ ConsoleState（loading/error/empty）
   └─ 表格：模型名称/供应商/单价/权重/状态/上游配置/操作
+ ConsoleModal（新增/编辑，640px）
+ ConsoleModal（删除确认，440px）
+ ToastHost
```

- 模型名称列主行显示 `displayName || name`，副行 `name`；单价按 `$输入 / $输出` 每 1K Token 展示（4 位小数）；权重直接显示；状态用 `StatusPill`（启用绿/停用灰）。
- 上游配置列：`hasUpstreamKey` 为真显示“已配置 + upstreamKeyMasked”，否则“未配置 + upstreamBaseUrl 或 默认模拟上游”。后端从不返回密钥明文。
- 操作列仅 `canManage` 时显示“编辑/停用或启用/删除”，否则“只读”。

### 数据与写操作

- `load()` → `GET /api/models`；`canView = models.view`，`canManage = models.manage`。
- 新增 → `POST /api/models`；编辑 → `PUT /api/models/{id}`；启停 → `POST /api/models/{id}/status`，body `{status}`；删除 → `DELETE /api/models/{id}`。
- 表单字段：`name*`、`displayName`、`provider*`、`status`、`inputPrice`、`outputPrice`、`weight`、`upstreamBaseUrl`、`upstreamApiKey`、`description`。
- `validate()`：名称/供应商必填；输入/输出单价必须为非负有限数；权重必须为非负整数。
- `buildPayload()`：基础字段全部 `Number()`；`displayName/upstreamBaseUrl/upstreamApiKey/description` **仅在非空时**加入 payload。
- 保存成功 Toast 并重载列表；`409` 特判为“模型名称已存在”。
- 删除确认文案说明“历史流量统计会保留，但该模型将不再参与推理路由”。

模型渠道如何参与上游转发/模拟上游，见 [[entities/backend-traffic-gateway]]；权重与配额的治理语义见 [[concepts/token-governance]]。

## SettingsView

### 页面结构

```
main.content.console-page.settings-page
├─ .page-head：标题 + 只读模式徽标 + 保存设置（canManage）
├─ ConsoleState（!canView / loading / error）
└─ .settings-grid
   ├─ section.card.settings-card（配额与限流表单）
   │  ├─ siteName / defaultDailyQuota / defaultMonthlyQuota
   │  ├─ defaultRpm / defaultTpm / alertThreshold(%)
   │  └─ 还原 + 保存设置
   └─ aside.settings-side
      ├─ 系统运行：运行时长 / 启动时间 / 当前站点
      └─ “模型管理”入口卡（router.push('/models')）
```

### 状态与阈值换算

- `data` 保存服务端原值，`form` 是编辑副本；`syncForm()` 在加载/保存成功后把 `data` 同步进 `form`。
- `alertThreshold` 后端是 0~1 比例，前端输入是 0~100 百分比：
  - `thresholdToPercent(v)`：`v <= 1` 时乘 100（并保留两位）；
  - `percentToThreshold(v)`：除以 100 再提交。
- `load()` → `GET /api/settings`，写入 `siteName/defaultDailyQuota/defaultMonthlyQuota/defaultRpm/defaultTpm/alertThreshold/systemStartedAt/uptimeDays`。
- `saveSettings()` → `PUT /api/settings`，提交六个字段（阈值已换算）；成功用响应回填 `data`（缺失字段回落到表单值），再 `syncForm()` 并 Toast。
- “还原”按钮实际调用 `load()` 从服务端重拉，不是恢复初始快照。
- 校验：四个数值字段必须非负有限数；阈值必须在 0~100；月配额不得小于日配额。

### 权限与只读

- `canView = settings.view`，`canManage = settings.manage`。
- 无 view：整页“无权查看系统设置”。
- 有 view 无 manage：所有输入 `disabled`、不给保存按钮（顶部按钮 disabled），显示“只读模式”徽标与提示“仅可查看配置，无法保存修改”。
- 顶部与底部各有一个“保存设置”按钮，共用 `saveSettings()`；顶部还额外受 `loading`、`error` 约束。

## 错误/加载/空态

- 模型页：首次加载 `ConsoleState` loading；失败 error + 重试；列表为空显示“暂无模型渠道，点击新增开始配置”。
- 设置页：首次加载才显示 loading；失败 error + 重试；无“空态”，因为设置总有默认值。
- 两页保存失败都会在表单下方显示 `form-error`，并额外弹一条 Toast；表单不关闭，便于修正。
- 保存中按钮变“保存中…”并禁用；模型弹窗用 `confirmLoading` 锁定。

## 坑与注意点

- **编辑无法清空可选字段**：`buildPayload()` 只在非空时带上 `displayName/upstreamBaseUrl/upstreamApiKey/description`。想把已配置的 `upstreamBaseUrl` 改回“使用模拟上游”时，空串根本不会发给后端（后端其实支持 `upstreamBaseUrl: ""` 覆盖），只能删了重建。
- **上游密钥“留空保持”是前端约定**：编辑时 `upstreamApiKey` 永远从空开始，只有填写才提交；这和后端“空串保持原值”的语义一致，但没有“清除密钥”的入口。
- **没有分页/搜索**：模型页一次性渲染全部渠道；当前只有 4 个种子模型没问题，渠道多了会退化。
- **供应商是自由文本**：没有下拉或枚举校验，前端可写入任意字符串，影响的是后续按供应商统计/展示的一致性。
- **删除是硬删**：前端只承诺“历史统计保留”，没有软删除/回收站；误删后只能重建（ID 变化）。
- **设置保存不是原子快照**：`form` 与服务端可能因并发修改而不一致；“还原”会丢弃当前编辑且没有二次确认。
- **站点名称前端不校验**：`validate()` 只查数字与阈值，`siteName` 允许空串提交；后端会以 `400` 拒绝（“站点名称不能为空”），错误只能等接口返回后才在表单下方显示。
- **阈值边界**：`thresholdToPercent(1)` 会得到 100%，`thresholdToPercent(1.5)` 则按 1.5% 处理（因为 >1 不再乘 100）；后端契约保证 0~1，越界数据会出现歧义。
- **月配额校验仅在前端**：`月 >= 日` 是前端规则，直接调 API 可绕过；后端是否校验需以 [[entities/backend-app-factory]]/设置路由为准。
- **入口双向但不对称**：设置页有醒目的“模型管理”卡片，模型页只有一行“返回系统设置”文字链；侧栏两者都不在主导航里（`/models` 甚至无高亮）。
- **`uptimeDays` 只读**：运行时长来自 `settings.systemStartedAt` 推导，前端不可编辑，也没有时区说明。
