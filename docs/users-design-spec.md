# Design Spec — 用户管理（users.jpg 还原）

Source of truth: `/home/student/code/llm_dashboard/users.jpg` — **2752 × 1536 px**.

## 0. Scale convention (important)

The reference is a **2× (retina) screenshot** of a **1376 × 768 CSS px** viewport.

> **CSS px = image px ÷ 2** unless a row below is marked `img`. All numbers were measured
> on the JPEG (tools/users/measure*.py) and converted. QA screenshot must be taken at
> `viewport 1376×768, deviceScaleFactor 2` → exactly 2752×1536, then diffed against users.jpg.

Because the reference is a soft/blurry JPEG (278 KB), edges carry ~±2–4 img px (±1–2 CSS px)
antialias/compression fuzz. Prefer the rounded CSS values. Refine with the pixel diff.

Reference crops (zoomed, for visual comparison): `tools/users/crops/`
(`sidebar.png`, `brand-2x.png`, `topbar-right-2x.png`, `filter-left-2x.png`, `filter-mid-2x.png`,
`filter-right-2x.png`, `toolbar-2x.png`, `table-head-2x.png`, `table-rows.png`,
`pagination-2x.png`, `logout-zoom.png`, `nav-lower-2x.png`).

---

## 1. Global layout (CSS px)

| Region | Box (x0, y0 → x1, y1) | Size | Notes |
|---|---|---|---|
| Sidebar (fixed) | 0, 0 → 215, 768 | **215 × 768** | dark navy gradient; spans full height, no border |
| Topbar (sticky) | 215, 0 → 1376, 53 | 1161 × **53** | pure white `#ffffff` |
| Content area | 215, 53 → 1376, 768 | 1161 × 715 | page bg **`#ebf1fd`** |
| Card column | 239.5 → 1357.5 | **1118 wide** | left pad 24.5 from sidebar, right pad 18.5 |
| Filter card | 239.5, 153 → 1357.5, 231 | 1118 × **78** | radius 8 |
| Table card | 239.5, 245 → 1357.5, 684.5 | 1118 × **439.5** | radius 8 |
| Gap | filter → table | **14** | |

- Content top padding: H1 ink starts at y=79 (26 px below topbar).
- Bottom whitespace below table card: 768 − 684.5 = **83.5** (nothing else on the page).
- Cards: `background:#fff`, `border:1px solid #e8edf4`, `border-radius:8px`,
  shadow ≈ `0 1px 2px rgba(16,24,40,.05), 0 2px 5px rgba(16,24,40,.08)` — the reference shows a
  visible 1–2 px darker band under the cards (`#dae1ea` at img y=463 / 1370).

## 2. Palette (sampled)

| Token | Hex | Where |
|---|---|---|
| Content bg | **`#ebf1fd`** | entire content area |
| Card bg / border | `#ffffff` / **`#e8edf4`** | cards |
| Sidebar bg | **`#182541`** (slight gradient `#17233f → #192642`) | sidebar |
| Sidebar active bg | **`#24529b`** | 用户管理 row |
| Sidebar active accent | **`#3b87f7`**, 2 px | left edge of active row |
| Sidebar divider | `#2b3652`, 1 px | between 权限管理 and 流量监控 (y=280) |
| Sidebar text | **`#a5afc8`** | inactive nav labels/icons |
| Sidebar brand title | `#eef3fb` | “LLM推理” |
| Sidebar brand sub | `#b9c4d6` | “Token 流量管理系统” |
| Text primary | **`#111827`** (near-black; sampled ~`#050f2e`) | H1, table cells, header labels |
| Text secondary | `#4b5563` / **`#6b7280`** | subtitle, placeholder `#9aa1ad` |
| Button blue | **`#2077ed`** | 查询 / 新增用户 / current page |
| Button red | **`#d95a5c`** | 批量删除 |
| Button gray (disabled) | **`#d1d4dc`**, text `#8b93a1` | 批量启用/停用 |
| Control border | **`#d5dae4`**, radius 8 | input / selects / ghost buttons |
| Selected option pill | **`#e8effc`**, radius 8 | 全部 in both selects |
| Badge green | bg `#cdf6e2`, text `#1f9d63` | 已启用 |
| Badge red/pink | bg `#fbdcdd`, text `#d4556b` | 已停用 |
| Action pill blue | bg `#dcecfe`, text `#2f6fb5` | 停用 / 启用 |
| Link blue | `#2f6fd6` | 编辑 / 编改 |
| Danger text | `#d4556b` | 删除 |
| Table header row bg | **`#ebf2fd`** | header band y 318.5–359 |
| Row separator | `#e9edf4`, 1 px | |

> Colors were sampled through JPEG blur; solid button fills (`#2077ed`, `#d95a5c`, `#d1d4dc`)
> are reliable, text tints are approximations — tune via diff.

---

## 3. Sidebar (0–215 CSS px)

| Item | CSS geometry |
|---|---|
| Brand logo | x 19 → 61.5, y 14.5 → 49.5 (≈43 × 35) — reuse `#i-logo` from `src/components/IconsSprite.vue` |
| Brand line 1 “LLM推理” | x 75.5, ink y 17 → 28.5; **14 px / 700** |
| Brand line 2 “Token 流量管理系统” | x 75.5, ink y 34.5 → 46.5; **14 px / 400** |
| Nav item height | **45.5** (active row **48**) |
| Nav icon box | x 23 → ~41 (≈18 × 20) |
| Nav label | x 58.5; **14 px**; active = 600 / white |
| Nav chevron | right edge at x ≈ 196.5; ~10 px wide, chevron for 用户管理 points **up**, for 流量监控 / 系统设置 points down |
| Active band | y 131.5 → 179.5, full width, bg `#24529b`, 2 px `#3b87f7` accent on the left |
| Rows (text ink centers) | Dashboard 107.75 · 用户管理 155.75 (active) · 模型管理 201.25 · 权限管理 246.25 |
| Divider | y 279.5 → 280.5, color `#2b3652` |
| 流量监控 center | 315.5 (chevron down) |
| 系统设置 center | 361.25 (chevron down) |
| Logout | icon x 24.5 → 40.5, y 705 → 721.5; text x 58.5, ink y 707 → 719; 14 px; row center y 713 |
| Menu order | Dashboard, 用户管理(active, chevron-up), 模型管理, 权限管理, divider, 流量监控, 系统设置 — **note: 模型管理 (not 角色管理)** |

Nav labels: **Dashboard**, **用户管理**, **模型管理**, **权限管理**, **流量监控**, **系统设置**, **退出登录**.
The Dashboard item links to `index.html` (the existing dashboard page).

## 4. Topbar (y 0–53)

| Item | CSS geometry |
|---|---|
| Hamburger | x 240.5 → 259 (19 wide), bars y 17.5 / 24 / 30.5, 2 px thick, color `#141c33` |
| Bell icon | x 1217.5 → 1240 (22.5), y 10.5 → 33.5 |
| Bell badge | circle d≈12.5, center ≈ (1233.5, 17), bg `#ef4444`, number **“2”** white 8 px |
| Avatar | circle d **30.5**, x 1265 → 1295, y 10 → 40; pale blue `#dbe4f3` person (reuse `#i-avatar`) |
| “admin” | x 1305, ink y 19.5 → 29; **13.5 px / 500**, color `#1f2937` |
| Chevron | x 1347 → 1354, y 22.5 → 26 |
| Right padding | 22 from viewport edge |

Topbar burger sits at content left edge (x≈240.5) = same left alignment as cards.

## 5. Page header

- H1 **用户管理**: x 243.5 (ink), ink y 79 → 106.5; **30 px / 800**, color `#0f172a`, letter-spacing ≈ 0.
- Subtitle 对系统用户进行新增、删除、修改、停用和查询等管理操作: x 242.5, ink y 119 → 133; **14 px / 400**, color `#4b5563`.
- Header block bottom → filter card top = 17 px gap.

## 6. Filter card (239.5, 153 → 1357.5, 231)

All controls height **39** (y 172.5 → 211.5), vertically centered; radius 8.

| Control | CSS box | Style |
|---|---|---|
| Search input | x 257.5 → 486.5 (229 wide) | white, 1 px `#d5dae4`; placeholder “用户名/用户 ID” 15 px `#9aa1ad`; magnifier icon right (≈18 px, `#98a0ad`) |
| Label 状态: | x 507 → 539.5 | 15 px `#111827` |
| Status select | x 548.5 → 756 (207.5) | white + border; inline options: **全部** (selected pill bg `#e8effc`), 启用, 停用, then chevron ~x 740 |
| Label 角色: | x 775 → 817.5 | 15 px |
| Role select | x 819 → 1042.5 (223.5) | inline options **全部**(selected), 管理员, 普通用户, chevron |
| 查询 button | x 1198.5 → 1264.5 (66), h 39 | bg `#2077ed`, white 15 px/600, radius 8 |
| 重置 button | x 1273 → 1339.5 (66.5), h 39 | white, border `#d5dae4`, text 15 px |

Left padding inside card 18, right padding 18. Selected option pill padding ≈ 6 × 10, radius 8.
Both “selects” visually show **all options inline** (selected one highlighted) followed by a
chevron — this is how the reference is drawn; implement as a custom select that renders that
row and opens a dropdown to change the selection.

## 7. Table card (239.5, 245 → 1357.5, 684.5)

### 7.1 Toolbar (top-right)
Buttons y **263.5 → 300.5** (h 37), gaps 8.5, right-aligned to card padding 18:

| Button | CSS box | Style |
|---|---|---|
| ＋ 新增用户 | x 954.5 → 1066 (111.5) | bg `#1f7bf2`, white, plus icon |
| 🗑 批量删除 | x 1074.5 → 1185.5 (111) | bg `#d95a5c`, white, trash icon |
| 🚫 批量启用/停用 | x 1194 → 1339.5 (145.5) | bg `#d1d4dc`, text `#8b93a1`, circle-slash icon — disabled look when nothing selected |
Text 15 px / 500, radius 8. (Toolbar has 18.5 top padding from card top.)

### 7.2 Table header row
- Band y **318.5 → 359** (h 40.5), bg `#ebf2fd`, text **15 px**, color `#1f2937` (dark), left aligned.
- Header labels at x: 用户ID **318.5**, 用户名 **424.5**, 角色 **529.5**, 邮箱/联系方式 **650.5**, 创建时间 **854**, 状态 **1046** (centered over badge column), 操作 **1151.5**.

### 7.3 Columns (CSS x of content start, card left = 239.5)
| # | Column | content x | notes |
|---|---|---|---|
| 1 | checkbox | box x 273.5 → 289.5 (16×16) | rounded 4, border `#c8ced8`, header has a select-all checkbox at same x |
| 2 | 用户ID | 318.5 | **data shown is the username** (admin, user123, …) — reference inconsistency, replicate |
| 3 | 用户名 | 424.5 | **data shown is the ID** (10001 …) — replicate |
| 4 | 角色 | 529.5 | |
| 5 | 邮箱/联系方式 | 650.5 | |
| 6 | 创建时间 | 854 | |
| 7 | 状态 | badge centered around 1076 | |
| 8 | 操作 | 1151.5 (header); actions start at 1163 | |

### 7.4 Rows (4 visible rows; 64.5 px each, 1 px `#e9edf4` separator)
Data (exact reference text):

| row | col2 (用户ID) | col3 (用户名) | 角色 | 邮箱 | 创建时间 | 状态 | actions |
|---|---|---|---|---|---|---|---|
| 1 | admin | 10001 | 超级管理员 | admin@example.com | 2024-03-12 10:00:00 | 已启用 (green) | 编辑 / 停用 (blue pill) / 删除 |
| 2 | user123 | 10002 | 普通用户 | user123@example.com | 2025-05-22 14:30:15 | 已启用 (green) | **编改** / 停用 (pink pill) / 删除 |
| 3 | alice | 10003 | 开发者 | alice@example.com | 2025-05-22 20:44:57 | 已启用 (green) | 编辑 / 停用 (pink pill) / 删除 |
| 4 | bob | 10004 | 普通用户 | bob@example.com | 2025-05-22 20:44:33 | 已停用 (pink) | 编辑 / 启用 (blue pill) / 删除 |

- Row 2 “编改” is literally in the reference (typo) — replicate.
- Cell text 15 px, color `#111827`; row text ink y ≈ 384.5–397 (row 1).
- Status badges: pill h≈27, radius full, bg/text as palette; text 15 px/500.
  Badge left edge ≈ 1048, width ≈ 57.
- Action link 编辑/编改: x 1163, color `#2f6fd6`, 15 px.
- Action pill 停用/启用: x ≈ 1210 → 1262 (w≈52, h≈31), bg `#dcecfe`, text `#2f6fb5` 15 px.
- 删除: x 1280, color `#d4556b`, 15 px.
- Hover: row bg `#f8fafd` (inferred); checkbox/action buttons pointer.

### 7.5 Pagination (bottom bar, below last separator at y 615.5)
- Left text 共 48 条记录，每页 10 条: x **258.5**, ink y **641.5 → 657.5**, **16 px**, color `#111827`.
- Buttons height **34** (y 632.5 → 666), radius 8, white + border `#d5dae4`, text 15 px:
  上一页 x 994.5 → 1062 · [1] x 1071.5 → 1103 (**active blue `#2077ed` white**) ·
  [2] 1111.5 → 1142.5 · [3] 1151.5 → 1182 · … (x≈1200, text ellipsis) · [5] 1231 → 1261.5 ·
  下一页 x 1271 → 1339.5.
- Gaps between pagination buttons ≈ 9.

---

## 8. Interaction requirements

- **查询**: filter by username/user-id substring + status + role; **重置** clears all filters.
- **Custom selects** 状态/角色: click any inline option to select it directly, chevron also opens a
  menu; selection changes the highlighted pill and immediately filters on 查询.
- **新增用户**: opens a modal form (用户名, 邮箱, 角色, 状态) → prepends a row; toast “新增成功”.
- **批量删除 / 批量启用/停用**: requires selection; disabled-looking third button becomes enabled
  when rows are selected; confirm dialog; updates data and count.
- **编辑**: modal prefilled, saves changes. **停用/启用**: toggles status badge + action pill.
- **删除**: confirm dialog, removes row, count decrements.
- **Select-all** checkbox in header + per-row checkboxes.
- **Pagination**: 48 records, 10 per page (reference says 每页 10 条). Default page 1 must still
  LOOK exactly like the reference: the table body is a fixed-height viewport showing the 4
  measured rows (rows 5–10 reachable by scrolling the table body; scrollbar hidden/overlay).
- **Empty state** when filters match nothing: small centered “暂无数据”.
- Toast / dialog styling: match the existing design language (white card, radius 10–12, blue
  primary button).

## 9. Responsive (secondary)

Breakpoint at **1100 px**: sidebar becomes an off-canvas drawer (hamburger toggles, backdrop,
Esc closes), content padding shrinks, filter bar wraps, table gets horizontal scroll.
At **640 px**: toolbar buttons wrap, pagination wraps. No horizontal page overflow at 1376 / 1024 / 768 / 390.

## 10. Reference inconsistencies (decisions)

1. Header 用户ID/用户名 labels are swapped relative to the row data — **replicate as drawn**.
2. Card says “每页 10 条” but shows 4 rows — implement 10/page with a fixed-height scrollable
   body so page 1 matches the reference visually.
3. Role filter offers 全部/管理员/普通用户 while data has 超级管理员/普通用户/开发者 — keep the
   drawn options; map 管理员 → roles containing “管理员”.
4. Toolbar 批量删除 looks enabled while 批量启用/停用 looks disabled in the reference — keep both
   looks at rest; behaviour is selection-gated.
