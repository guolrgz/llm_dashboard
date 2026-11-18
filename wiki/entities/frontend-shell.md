---
title: 前端外壳 App 侧栏顶栏与图标精灵
source_files:
  - src/App.vue
  - src/components/AppSidebar.vue
  - src/components/AppTopbar.vue
  - src/components/IconsSprite.vue
updated: 2026-11-18
tags: [entity, frontend, shell]
---

> 所属模块：[[modules/frontend]]

# 前端外壳 App 侧栏顶栏与图标精灵

外壳由四部分组成：`App.vue` 负责“登录页裸渲染 / 业务页带侧栏顶栏”的分支与响应式抽屉状态；`AppSidebar.vue` 渲染固定 6 项导航；`AppTopbar.vue` 渲染汉堡按钮、未读告警徽标与用户下拉；`IconsSprite.vue` 提供全站 `<symbol>` 图标。

## 组件树

```
App.vue
├─ IconsSprite            （始终渲染，隐藏的 SVG symbol 集合）
├─ RouterView             （route.name === 'login' 时只渲染这个）
└─ div.app                （其余路由）
   ├─ AppSidebar          :items="navItems" :active="activeNav"
   ├─ div.sidebar-backdrop（移动端遮罩，点击关闭）
   └─ div.main
      ├─ AppTopbar        :expanded="sidebarExpanded"
      └─ RouterView
```

## App.vue 的状态与行为

| 名称 | 类型 | 说明 |
|---|---|---|
| `sidebarOpen` | ref | 移动端抽屉是否打开；控制 `sidebar-open` 类 |
| `sidebarCollapsed` | ref | 桌面端侧栏是否被汉堡收起；控制 `sidebar-collapsed` 类 |
| `isMobile` | ref | 由 `matchMedia('(max-width: 900px)')` 驱动 |
| `isLogin` | computed | `route.name === 'login'`，决定是否渲染外壳 |
| `isUsers` | computed | 用户页标记，给根节点加 `app--users`（设计稿外壳尺寸特例） |
| `sidebarExpanded` | computed | 移动端看抽屉、桌面端看折叠，传给顶栏做 `aria-expanded` |
| `navItems` | 常量 | 直接复用 `data/dashboard.js` 的 6 项 |
| `activeNav` | computed | 由路由名映射到导航 id |

关键函数：

- `toggleSidebar()`：移动端切抽屉，桌面端切折叠。
- `closeMobile()`：关闭抽屉，`onNavigate()`、遮罩点击、Esc、路由变化都会调用。
- `onNavigate(id)`：经 `routeMap`（含 `models`）`router.push`；已在当前路径则不跳。
- `onLogout()`：`await auth.logout()` 后 `router.replace('/login')`。
- `syncViewport(event)`：断点变化时重置两个侧栏状态；`onKeydown` 处理 Esc。

副作用：`watch(sidebarOpen)` 切换 `document.body.classList('sidebar-locked')` 锁滚动；`watch(route.fullPath)` 自动收起抽屉；`watch(route.meta.title)` 兜底设置标题；`onMounted` 注册 media query 与 keydown，`onBeforeUnmount` 全部移除。

## AppSidebar

- Props：`items`（数组，必填）、`active`（默认 `'dashboard'`）。
- Emits：`navigate(item.id)`、`logout`。
- 结构：品牌区（`#i-logo` + 两行标题）→ `<nav>` 循环 `items`（支持 `dividerBefore`、`size`、`chevron`）→ 底部“退出登录”。
- 每项是 `<a href="#">` + `@click.prevent`，用 `aria-current="page"` 标记激活；图标走 `<use :href="'#'+item.icon">`。
- 自身无状态，所有高亮与跳转都由父组件驱动。

## AppTopbar

- Props：`expanded`（布尔，默认 `true`）；Emits：`toggle-sidebar`、`logout`。
- 左侧汉堡按钮带 `aria-controls="sidebar"` 与 `aria-expanded`；右侧是通知铃铛与用户按钮。
- 未读数：`unread` 初始为设计稿兜底值 `3`，`onMounted` 调 `fetchUnreadAlertCount()`；失败也回落到 3。监听 `window` 的 `llm:alerts-unread` 自定义事件，Dashboard 拉到 `alerts.unread` 后会广播。
- 用户菜单：`menuOpen` 控制；`displayName` 取 `nickname || username || 'admin'`，`roleLabel` 取 `roleName || role || '成员'`；`document mousedown` 点外部关闭，Esc 关闭，卸载时移除监听。
- 通知按钮目前没有点击行为，仅展示徽标。

## IconsSprite

- 一个隐藏的 `<svg class="svg-defs">`（全局 CSS 置为 0×0），内部 `<defs>` 集中定义 `<symbol id="i-*">`，全站用 `<use href="#i-*">` 引用。
- 图标覆盖：导航（`i-home`/`i-users`/`i-role`/`i-shield`/`i-traffic`/`i-settings`/`i-logout`）、通用（`i-menu`/`i-bell`/`i-chevron-*`/`i-calendar`/`i-arrow-up`/`i-search`/`i-plus`/`i-trash`/`i-ban`/`i-close`）、品牌（`i-logo`）、头像（`i-avatar`）。
- 描摹自设计稿：导航图标是 28×28 的填充轮廓，KPI/概览图标另在 `KpiIcon.vue`/`OverviewIcon.vue` 内联，未复用精灵里的 48×48/40×40 版本。
- 精灵里还留有 `i-message`/`i-database`/`i-check-circle`/`i-users-solid`/`i-cube`/`i-clock`/`i-bars` 等未被引用的 symbol，属于设计稿早期素材。

## 坑与注意点

- **`/models` 无高亮项**：`routeMap` 与 `activeNav` 都支持 `models`，但 `navItems` 只有 6 项；进入 `/models` 时侧栏没有任何 `is-active`。这是“侧栏照抄设计稿、模型页从设置进入”的直接后果。
- **用户页外壳尺寸跳变**：`app--users` 在 ≥901px 把侧栏压到 215px、顶栏压到 53px，其他页面是 260px/68px；在用户页与 Dashboard 之间切换会看到外壳宽度变化。
- **折叠状态不持久化**：`sidebarCollapsed` 只在内存里，刷新或跨断点都会重置；`syncViewport()` 每次断点变化都会强制展开。
- **未读徽标兜底 3**：后端不可达时仍显示 3，是设计稿还原优先于真实性的取舍；且只在挂载时拉一次，没有轮询，页面内的 `llm:alerts-unread` 事件才是刷新渠道。
- **精灵结构不规整**：`i-model`/`i-search`/`i-plus`/`i-trash`/`i-ban`/`i-close` 被嵌在 `i-message` 的 `<defs>` 内部，而不是与其它 symbol 平级；新增图标建议放在顶层 `<defs>`，避免依赖浏览器的容错解析。
- **重复的渐变 ID**：精灵里的 `chatGrad` 与 `KpiIcon.vue` 内联的 `linearGradient id="chatGrad"` 同名，同一文档出现重复 id；目前颜色一致未出问题，但改其一会影响不可预期。
- **可访问性**：侧栏用 `<a href="#">` 承担按钮语义、顶栏通知按钮无行为，键盘用户能聚焦但无法触发通知；Esc 只关抽屉/菜单，不处理焦点回收。
- 登录页不渲染外壳，依赖 `App.vue` 的 `isLogin` 分支而非路由布局组件；新增“无外壳”页面时必须同步改这里。
