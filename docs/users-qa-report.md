# 视觉 QA 报告 — 用户管理页面（users.jpg 像素还原）

生成时间: 2026-11-18T02:36:13.229Z  
Baseline: `users.jpg` (2752×1536，解码缓存 `tools/out/users-baseline.png`)  
Current: `tools/out/users.png` (2752×1536)  
Scale: 1376×768 CSS px @2x（图片 px = CSS px × 2）  
像素阈值: max channel Δ > 24  

## 总体: 3.63% 像素不一致 — 🟠 NEEDS WORK (≤6%)

| 指标 | 数值 |
|---|---|
| 差异像素 | 153,560 / 4,227,072 |
| 差异率 | 3.63% |
| 平均绝对通道差 | 4.52 / 255 |
| 截图尺寸匹配 | 是（2752×1536） |

> 说明：baseline 是 JPEG（有损压缩），文字边缘天然存在 1–2 CSS px 的模糊/振铃，
> 因此即使完全还原也会残留少量低幅差异；重点看热点位置与区域差异率。

## 截图信息（meta）

| 项 | 值 |
|---|---|
| URL | http://127.0.0.1:5173/users.html |
| HTTP 状态 | 200 |
| viewport / dsf | 1376×768 / 2 → 期望 2752×1536 |
| scrollWidth / scrollHeight | 1376 / 768（期望 1376 / 768） |
| 字体 | Inter 100 900 loaded；Noto Sans SC 100 900 loaded |
| console.error | 0 条 |
| pageerror | 0 条 |

## 区域差异

| 区域 | bbox (img px) | CSS px | 差异率 | 平均Δ | 状态 | 负责 |
|---|---|---|---|---|---|---|
| 侧边栏 Sidebar | 0,0,430,1536 | 0.0,0.0 → 215.0,768.0 | 3.23% | 4.6 | 🟠 | shell-dev |
| 顶栏 Topbar | 430,0,2322,106 | 215.0,0.0 → 1376.0,53.0 | 1.65% | 2.0 | 🟡 | shell-dev |
| 页头 Page header | 431,106,2321,200 | 215.5,53.0 → 1376.0,153.0 | 2.12% | 3.2 | 🟠 | content-dev |
| 筛选卡 Filter card | 479,306,2237,156 | 239.5,153.0 → 1358.0,231.0 | 5.53% | 7.1 | 🟠 | content-dev |
| 工具栏 Toolbar | 479,491,2237,145 | 239.5,245.5 → 1358.0,318.0 | 3.87% | 5.0 | 🟠 | content-dev |
| 表头+数据行 Table header + rows | 479,637,2237,595 | 239.5,318.5 → 1358.0,616.0 | 5.72% | 9.0 | 🟠 | content-dev |
| 分页 Pagination | 479,1232,2237,138 | 239.5,616.0 → 1358.0,685.0 | 3.25% | 5.3 | 🟠 | content-dev |

各区域建议核对：
- **侧边栏 Sidebar**（shell-dev）: 核对宽度 215 CSS px、深蓝渐变 #182541、导航行高 45.5（active 48）、active 行 y131.5–179.5 + 左侧 2px #3b87f7、divider y279.5、菜单文案（Dashboard/用户管理/模型管理/权限管理/流量监控/系统设置）、退出登录 y713。
- **顶栏 Topbar**（shell-dev）: 核对高度 53、纯白底、汉堡 x240.5（3 条 2px 线 y17.5/24/30.5）、铃铛 x1217.5 + 红点“2”、头像 d30.5、admin 文案 x1305 13.5px/500、右侧 padding 22。
- **页头 Page header**（content-dev）: 核对 H1“用户管理” 30px/800 左 ink x243.5、ink y79–106.5；副标题 14px 左 x242.5、ink y119–133；页头底到筛选卡间距 17。
- **筛选卡 Filter card**（content-dev）: 核对卡片 y153–231（h78）、控件高 39、搜索框 x257.5 w229、状态/角色 select 内联选项与选中 pill #e8effc、查询 #2077ed x1198.5、重置白底描边 x1273。
- **工具栏 Toolbar**（content-dev）: 核对按钮 y263.5–300.5（h37）右对齐 padding 18，新增 #1f7bf2、批量删除 #d95a5c、批量启用/停用 #d1d4dc（无选中时灰态）。
- **表头+数据行 Table header + rows**（content-dev）: 核对表头 band y318.5–359 bg #ebf2fd、列 x（318.5/424.5/529.5/650.5/854/1046/1151.5）、行高 64.5、4 行文案、状态徽章、操作列（编辑/编改、停用 pill、删除）。
- **分页 Pagination**（content-dev）: 核对分页文案“共 48 条记录，每页 10 条” x258.5 16px、按钮 h34、页码 1 active #2077ed、上一页/下一页位置、表格卡底 y684.5。

## 网格差异（16×8，单元内差异像素 %）

| 行 \ 列 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 (y0-192) | 10.1 | 9.3 | 4.0 | 4.8 | 0.6 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 8.6 | 2.6 |
| 2 (y192-384) | 7.9 | 5.5 | 3.2 | 9.7 | 5.9 | 5.9 | 8.6 | 1.7 | 1.8 | 3.4 | 2.3 | 2.7 | 0.1 | 0.3 | 3.6 | 2.2 |
| 3 (y384-576) | 7.6 | 4.8 | 0.6 | 3.3 | 1.7 | 2.0 | 3.4 | 2.4 | 2.5 | 4.2 | 3.1 | 11.1 | 6.2 | 7.8 | 9.3 | 5.9 |
| 4 (y576-768) | 5.8 | 4.0 | 0.5 | 3.3 | 1.6 | 2.9 | 3.1 | 4.0 | 5.4 | 0.6 | 5.0 | 2.0 | 5.4 | 4.7 | 1.8 | 0.8 |
| 5 (y768-960) | 0.0 | 0.0 | 0.3 | 4.8 | 3.6 | 4.1 | 11.7 | 4.9 | 14.0 | 4.9 | 10.2 | 8.2 | 8.7 | 8.6 | 10.3 | 5.6 |
| 6 (y960-1152) | 0.0 | 0.0 | 0.0 | 2.7 | 1.0 | 2.3 | 3.5 | 2.6 | 7.5 | 1.7 | 4.4 | 4.3 | 5.1 | 4.5 | 6.1 | 2.9 |
| 7 (y1152-1344) | 0.0 | 0.0 | 0.0 | 7.7 | 5.1 | 2.2 | 5.4 | 3.0 | 7.3 | 1.2 | 5.0 | 6.8 | 10.9 | 8.9 | 9.6 | 6.5 |
| 8 (y1344-1536) | 3.1 | 2.4 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |

## Top 10 差异热点

| # | bbox (x0,y0)-(x1,y1) | 尺寸 | 差异像素 | 密度 | baseline 均色 | current 均色 | 位移估计 | 邻近区域 | 负责 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | (1904,528)-(2384,608) | 480×80 | 8,342 | 21.7% | #988fb9 | #9a8fbc | (+1,0) px | 工具栏 Toolbar | content-dev |
| 2 | (1296,896)-(1632,928) | 336×32 | 4,446 | 41.4% | #c7c9ce | #d1d2d5 | (+2,-3) px | 表头+数据行 Table header + rows | content-dev |
| 3 | (144,32)-(400,96) | 256×64 | 4,033 | 24.6% | #3b455e | #36435c | (0,+1) px | 侧边栏 Sidebar | shell-dev |
| 4 | (1296,1152)-(1568,1184) | 272×32 | 3,661 | 42.1% | #c5c7cd | #cfd0d3 | (+2,-3) px | 表头+数据行 Table header + rows | content-dev |
| 5 | (1296,1024)-(1584,1056) | 288×32 | 3,638 | 39.5% | #c7c8ce | #d0d1d4 | (+3,-1) px | 表头+数据行 Table header + rows | content-dev |
| 6 | (1696,1152)-(2016,1184) | 320×32 | 3,313 | 32.4% | #cacbd0 | #d4d5d8 | (+1,-2) px | 表头+数据行 Table header + rows | content-dev |
| 7 | (1712,768)-(2000,800) | 288×32 | 3,191 | 34.6% | #c5c7cc | #d1d3d6 | (+2,-1) px | 表头+数据行 Table header + rows | content-dev |
| 8 | (2416,544)-(2656,592) | 240×48 | 3,145 | 27.3% | #bfc3cb | #c2c6cf | (+6,0) px | 工具栏 Toolbar | content-dev |
| 9 | (480,240)-(832,272) | 352×32 | 3,143 | 27.9% | #c2cad7 | #c8cfdb | 内容不同（无匹配） | 页头 Page header | content-dev |
| 10 | (1296,656)-(1504,704) | 208×48 | 3,070 | 30.7% | #b6bcca | #cad1dd | 内容不同（无匹配） | 表头+数据行 Table header + rows | content-dev |

> 位移估计 = 让 current 内容重新对齐 baseline 所需整数 (dx,dy)；正值表示 current 内容偏右/偏下。

热点放大图（左 baseline | 右 current，2× 最近邻）：
- 热点 1: `docs/users-crops/hotspot-1.png`（窗口 (1894,518)-(2394,618)）
- 热点 2: `docs/users-crops/hotspot-2.png`（窗口 (1286,886)-(1642,938)）
- 热点 3: `docs/users-crops/hotspot-3.png`（窗口 (134,22)-(410,106)）
- 热点 4: `docs/users-crops/hotspot-4.png`（窗口 (1286,1142)-(1578,1194)）
- 热点 5: `docs/users-crops/hotspot-5.png`（窗口 (1286,1014)-(1594,1066)）
- 热点 6: `docs/users-crops/hotspot-6.png`（窗口 (1686,1142)-(2026,1194)）
- 热点 7: `docs/users-crops/hotspot-7.png`（窗口 (1702,758)-(2010,810)）
- 热点 8: `docs/users-crops/hotspot-8.png`（窗口 (2406,534)-(2666,602)）
- 热点 9: `docs/users-crops/hotspot-9.png`（窗口 (470,230)-(842,282)）
- 热点 10: `docs/users-crops/hotspot-10.png`（窗口 (1286,646)-(1514,714)）

### 最热 64×64 单元（细粒度定位）

| # | bbox (x0,y0)-(x1,y1) | 差异率 | baseline 均色 | current 均色 | 邻近区域 | 负责 |
|---|---|---|---|---|---|---|
| 1 | (2560,896)-(2624,960) | 36.1% | #fffcf9 | #ffffff | 表头+数据行 Table header + rows | content-dev |
| 2 | (1984,512)-(2048,576) | 36.1% | #1f7ef2 | #1f7ef2 | 工具栏 Toolbar | content-dev |
| 3 | (2560,1024)-(2624,1088) | 35.9% | #fff9fa | #ffffff | 表头+数据行 Table header + rows | content-dev |
| 4 | (2560,1152)-(2624,1216) | 35.3% | #eccbd2 | #ffffff | 表头+数据行 Table header + rows | content-dev |
| 5 | (2560,768)-(2624,832) | 34.9% | #fffffd | #ffffff | 表头+数据行 Table header + rows | content-dev |
| 6 | (64,64)-(128,128) | 33.2% | #3e9aef | #172440 | 侧边栏 Sidebar | shell-dev |
| 7 | (2240,512)-(2304,576) | 32.3% | #d85859 | #d85859 | 工具栏 Toolbar | content-dev |
| 8 | (2048,512)-(2112,576) | 32.2% | #217ff3 | #1f7ef2 | 工具栏 Toolbar | content-dev |
| 9 | (2112,1152)-(2176,1216) | 28.5% | #e4a5ae | #fbdcdd | 表头+数据行 Table header + rows | content-dev |
| 10 | (2560,0)-(2624,64) | 27.0% | #ffffff | #ffffff | 顶栏 Topbar | shell-dev |
| 11 | (1728,640)-(1792,704) | 26.5% | #c0c8db | #ebf2fd | 表头+数据行 Table header + rows | content-dev |
| 12 | (1472,896)-(1536,960) | 26.5% | #fffffd | #ffffff | 表头+数据行 Table header + rows | content-dev |
| 13 | (2304,1152)-(2368,1216) | 26.5% | #f0ffff | #ffffff | 表头+数据行 Table header + rows | content-dev |
| 14 | (1344,640)-(1408,704) | 26.3% | #081023 | #404957 | 表头+数据行 Table header + rows | content-dev |
| 15 | (256,64)-(320,128) | 25.9% | #192744 | #172440 | 侧边栏 Sidebar | shell-dev |

## 建议修复顺序

1. **表头+数据行 Table header + rows**（5.72% 差异，content-dev）— 核对表头 band y318.5–359 bg #ebf2fd、列 x（318.5/424.5/529.5/650.5/854/1046/1151.5）、行高 64.5、4 行文案、状态徽章、操作列（编辑/编改、停用 pill、删除）。
2. **侧边栏 Sidebar**（3.23% 差异，shell-dev）— 核对宽度 215 CSS px、深蓝渐变 #182541、导航行高 45.5（active 48）、active 行 y131.5–179.5 + 左侧 2px #3b87f7、divider y279.5、菜单文案（Dashboard/用户管理/模型管理/权限管理/流量监控/系统设置）、退出登录 y713。
3. **筛选卡 Filter card**（5.53% 差异，content-dev）— 核对卡片 y153–231（h78）、控件高 39、搜索框 x257.5 w229、状态/角色 select 内联选项与选中 pill #e8effc、查询 #2077ed x1198.5、重置白底描边 x1273。
4. **工具栏 Toolbar**（3.87% 差异，content-dev）— 核对按钮 y263.5–300.5（h37）右对齐 padding 18，新增 #1f7bf2、批量删除 #d95a5c、批量启用/停用 #d1d4dc（无选中时灰态）。
5. **分页 Pagination**（3.25% 差异，content-dev）— 核对分页文案“共 48 条记录，每页 10 条” x258.5 16px、按钮 h34、页码 1 active #2077ed、上一页/下一页位置、表格卡底 y684.5。
6. **页头 Page header**（2.12% 差异，content-dev）— 核对 H1“用户管理” 30px/800 左 ink x243.5、ink y79–106.5；副标题 14px 左 x242.5、ink y119–133；页头底到筛选卡间距 17。
7. **顶栏 Topbar**（1.65% 差异，shell-dev）— 核对高度 53、纯白底、汉堡 x240.5（3 条 2px 线 y17.5/24/30.5）、铃铛 x1217.5 + 红点“2”、头像 d30.5、admin 文案 x1305 13.5px/500、右侧 padding 22。

## 交互 + 响应式验证（Playwright）

运行时间: 2026-11-18T02:36:08.170Z  
URL: http://127.0.0.1:5173/users.html  
viewport: 1376×768 (desktop) + 1024×768 / 768×1024 / 390×844 (responsive)  

汇总: ✅ 66 通过 / ❌ 0 失败 / 共 66 项

| # | 分组 | 检查项 | 结果 | 说明 |
|---|---|---|---|---|
| 1 | 加载/布局 | 页面可访问（HTTP 200 + Vue 挂载） | ✅ 通过 | status=200 |
| 2 | 加载/布局 | 1376×768 页面无纵向滚动（scrollHeight=768） | ✅ 通过 | scrollHeight=768 |
| 3 | 加载/布局 | 无横向溢出（scrollWidth ≤ clientWidth） | ✅ 通过 | scrollWidth=1376 clientWidth=1376 |
| 4 | 加载/布局 | console/page error 为 0 | ✅ 通过 | console=0 page=0 |
| 5 | 加载/布局 | 字体已加载（Inter / Noto Sans SC） | ✅ 通过 | loaded=2 bodyFont=Inter, "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "So |
| 6 | 加载/布局 | H1 为「用户管理」 | ✅ 通过 | h1=["用户管理"] |
| 7 | 加载/布局 | 侧边栏宽度 ≈215px 且贴左 | ✅ 通过 | {"x":0,"w":215,"h":768} |
| 8 | 加载/布局 | 顶栏高度 ≈53px | ✅ 通过 | {"h":53,"w":1161} |
| 9 | 加载/布局 | 默认第 1 页可见 4 行（设计稿） | ✅ 通过 | rows=10 visible=4 container=258/645 |
| 10 | 加载/布局 | 默认记录数文案「共 48 条记录，每页 10 条」 | ✅ 通过 |  |
| 11 | 查询 | 存在搜索输入框 | ✅ 通过 |  |
| 12 | 查询 | 输入 user 查询 → 仅保留匹配行 | ✅ 通过 | visible=1 texts=["user123 10002 普通用户 user123@example.com 2025-05-22 14:30:15 已启用 编改 停用 删除"] |
| 13 | 查询 | 输入 user 查询 → 行数减少 | ✅ 通过 | visible=1 |
| 14 | 查询 | 不存在值 → 显示空状态「暂无数据」 | ✅ 通过 | emptyState=true visible=0 |
| 15 | 查询 | 重置 → 清空输入并恢复 4 行 | ✅ 通过 | value="" visible=4 |
| 16 | 筛选 | 存在状态/角色筛选控件 | ✅ 通过 |  |
| 17 | 筛选 | 状态=启用 → 只剩已启用行 | ✅ 通过 | clicked=true visible=4 |
| 18 | 筛选 | 状态=停用 → 只剩已停用行 | ✅ 通过 | clicked=true visible=4 |
| 19 | 筛选 | 角色=管理员 → 只剩管理员行（含超级管理员） | ✅ 通过 | clicked=true visible=4 texts=["admin 10001 超级管理员 admin@example.com 2024-03-12 10:00:00 已启用 编辑 停用 删除","emma 10007 运维管理员 emma@example.com 2025-05-24 11:26:19 已停用 编辑 启用 删除","leo 10014 超级管理员 le |
| 20 | 筛选 | 重置后恢复默认 4 行 | ✅ 通过 | visible=4 |
| 21 | 新增 | 点击「新增用户」打开弹窗 | ✅ 通过 | clicked=true dialog=true |
| 22 | 新增 | 弹窗包含表单输入（用户名/邮箱） | ✅ 通过 | inputs=2 |
| 23 | 新增 | 提交后弹窗关闭并出现 toast | ✅ 通过 | submitted=true stillOpen=false toast="新增成功" |
| 24 | 新增 | 新增后记录数 +1 且列表出现新用户 | ✅ 通过 | before=48 after=49 hasRow=true |
| 25 | 编辑/启停 | 找到第 1 行（admin） | ✅ 通过 |  |
| 26 | 编辑/启停 | 停用/启用前状态为已启用 | ✅ 通过 | admin 10001 超级管理员 admin@example.com 2024-03-12 10:00:00 已启用 编辑 停用 删除 |
| 27 | 编辑/启停 | 点击「编辑」打开预填弹窗 | ✅ 通过 | clicked=true dialog=true |
| 28 | 编辑/启停 | 编辑弹窗预填用户名/邮箱 | ✅ 通过 | values=["admin","admin@example.com"] |
| 29 | 编辑/启停 | 保存后弹窗关闭、出现 toast 且行内容更新 | ✅ 通过 | toast="保存成功" updated=true |
| 30 | 编辑/启停 | 点击「停用」→ 徽章变已停用 | ✅ 通过 | clicked=true row=admin 10001 超级管理员 admin@example.com 2024-03-12 10:00:00 已停用 编辑 启用 删除 |
| 31 | 编辑/启停 | 点击「启用」→ 徽章恢复已启用 | ✅ 通过 | clicked=true row=admin 10001 超级管理员 admin@example.com 2024-03-12 10:00:00 已启用 编辑 停用 删除 |
| 32 | 删除 | 找到 bob 行 | ✅ 通过 |  |
| 33 | 删除 | 删除需确认（有确认弹窗） | ✅ 通过 | clicked=true confirm=true native=0 |
| 34 | 删除 | 确认后行被移除且记录数 -1 | ✅ 通过 | before=48 after=47 stillHasBob=false |
| 35 | 删除 | 删除后出现 toast 提示 | ✅ 通过 | toast="删除成功" |
| 36 | 批量 | 无选中时批量启用/停用禁用或给出提示 | ✅ 通过 | visualDisabled=true hint="请先选择用户" dialog=false |
| 37 | 批量 | 存在批量删除/批量启用停用按钮 | ✅ 通过 | toggle=true delete=true |
| 38 | 批量 | 表格行有复选框 | ✅ 通过 | found=2/2 |
| 39 | 批量 | 勾选行后批量启用/停用可用（确认后切换状态） | ✅ 通过 | activeLook=true dialog=true row=admin 10001 超级管理员 admin@example.com 2024-03-12 10:00:00 已停用 编辑 启用 删除 |
| 40 | 批量 | 表头全选勾选当前页所有行 | ✅ 通过 | {"total":10,"checked":10} |
| 41 | 批量 | 批量删除选中行（确认后记录数 -2） | ✅ 通过 | before=48 after=46 dialog=true toast="已删除 2 个用户" |
| 42 | 分页 | 分页文案「共 48 条记录，每页 10 条」 | ✅ 通过 |  |
| 43 | 分页 | 初始第 1 页为 active 且上一页禁用 | ✅ 通过 | [{"text":"1","testid":"page-btn-1","active":true},{"text":"2","testid":"page-btn-2","active":false},{"text":"3","testid":"page-btn-3","active":false},{"text":"5","testid":"page-btn-5","active":false}] |
| 44 | 分页 | 页码样式为 1/2/3/…/5（含省略号） | ✅ 通过 | pages=1,2,3,5 ellipsis=true |
| 45 | 分页 | 下一页 → 第 2 页 active | ✅ 通过 | [{"text":"1","testid":"page-btn-1","active":false},{"text":"2","testid":"page-btn-2","active":true},{"text":"3","testid":"page-btn-3","active":false},{"text":"5","testid":"page-btn-5","active":false}] |
| 46 | 分页 | 翻页后列表内容变化 | ✅ 通过 | admin 10001 超级管理员 admin@example.com 2024 → ivy 10011 普通用户 ivy@example.com 2025-05-2 |
| 47 | 分页 | 点击页码 3 → 第 3 页 active | ✅ 通过 | [{"text":"1","testid":"page-btn-1","active":false},{"text":"2","testid":"page-btn-2","active":false},{"text":"3","testid":"page-btn-3","active":true},{"text":"5","testid":"page-btn-5","active":false}] |
| 48 | 分页 | 上一页 → 回到第 2 页 active | ✅ 通过 | [{"text":"1","testid":"page-btn-1","active":false},{"text":"2","testid":"page-btn-2","active":true},{"text":"3","testid":"page-btn-3","active":false},{"text":"5","testid":"page-btn-5","active":false}] |
| 49 | 响应式 | 1376×768: 桌面侧栏常驻可见 | ✅ 通过 | {"exists":true,"onScreen":true,"openClass":false,"expanded":"true","x":0,"w":215,"visibility":"visible","display":"flex"} |
| 50 | 响应式 | 1024×768: 无横向溢出 | ✅ 通过 | scrollWidth=1024 clientWidth=1024 |
| 51 | 响应式 | 1024×768: 汉堡按钮可见 | ✅ 通过 |  |
| 52 | 响应式 | 1024×768: 抽屉默认关闭 | ✅ 通过 | {"exists":true,"onScreen":false,"openClass":false,"expanded":"false","x":-215,"w":215,"visibility":"visible","display":"flex"} |
| 53 | 响应式 | 1024×768: 汉堡打开抽屉（.sidebar-open/侧栏可见） | ✅ 通过 | {"exists":true,"onScreen":true,"openClass":true,"expanded":"true","x":0,"w":215,"visibility":"visible","display":"flex"} |
| 54 | 响应式 | 1024×768: Esc关闭抽屉 | ✅ 通过 | {"exists":true,"onScreen":false,"openClass":false,"expanded":"false","x":-215,"w":215,"visibility":"visible","display":"flex"} |
| 55 | 响应式 | 768×1024: 无横向溢出 | ✅ 通过 | scrollWidth=768 clientWidth=768 |
| 56 | 响应式 | 768×1024: 汉堡按钮可见 | ✅ 通过 |  |
| 57 | 响应式 | 768×1024: 抽屉默认关闭 | ✅ 通过 | {"exists":true,"onScreen":false,"openClass":false,"expanded":"false","x":-215,"w":215,"visibility":"visible","display":"flex"} |
| 58 | 响应式 | 768×1024: 汉堡打开抽屉（.sidebar-open/侧栏可见） | ✅ 通过 | {"exists":true,"onScreen":true,"openClass":true,"expanded":"true","x":0,"w":215,"visibility":"visible","display":"flex"} |
| 59 | 响应式 | 768×1024: 遮罩关闭抽屉 | ✅ 通过 | {"exists":true,"onScreen":false,"openClass":false,"expanded":"false","x":-215,"w":215,"visibility":"visible","display":"flex"} |
| 60 | 响应式 | 390×844: 无横向溢出 | ✅ 通过 | scrollWidth=390 clientWidth=390 |
| 61 | 响应式 | 390×844: 汉堡按钮可见 | ✅ 通过 |  |
| 62 | 响应式 | 390×844: 抽屉默认关闭 | ✅ 通过 | {"exists":true,"onScreen":false,"openClass":false,"expanded":"false","x":-215,"w":215,"visibility":"visible","display":"flex"} |
| 63 | 响应式 | 390×844: 汉堡打开抽屉（.sidebar-open/侧栏可见） | ✅ 通过 | {"exists":true,"onScreen":true,"openClass":true,"expanded":"true","x":0,"w":215,"visibility":"visible","display":"flex"} |
| 64 | 响应式 | 390×844: Esc关闭抽屉 | ✅ 通过 | {"exists":true,"onScreen":false,"openClass":false,"expanded":"false","x":-215,"w":215,"visibility":"visible","display":"flex"} |
| 65 | 汇总 | 全程 console/page error 为 0 | ✅ 通过 | console=0 page=0 |
| 66 | 汇总 | 无失败的网络请求 | ✅ 通过 |  |

补充说明：
- 自动化识别「切换后是否生效」以可见行文本/记录数/active class 为准，不依赖具体 DOM 类名（优先文本定位）。

## 产物

- 三联对比图: `docs/users-diff.png`（左 baseline | 中 current | 右差异热力图，50% 缩放）
- 热点放大图: `docs/users-crops/hotspot-*.png`（每个热点左右并排，2×）
- 机器可读统计: `tools/out/users-diff-stats.json`
- 截图: `tools/out/users.png`，meta: `tools/out/users-meta.json`
