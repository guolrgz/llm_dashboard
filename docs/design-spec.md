# Design Spec — LLM Token 流量管理系统 Dashboard

Source of truth: `/home/student/code/llm_dashboard/index.png` (1672 × 941 px, 1:1 CSS px assumed).
All coordinates below are in image pixels, origin = top-left of the image.
Analyzed with Pillow (tools/spec/analyze.py; venv-free install at tools/.pylibs).
Crops for visual reference: `tools/spec/crops/` (`sidebar.png`, `topbar.png`, `header.png`,
`kpi-row.png`, `chart-line.png`, `chart-donut.png`, `table.png`, `sys-overview.png`,
plus 3–8× zooms `kpi1-left-4x.png`, `donut-3x.png`, `chart-card-2x.png`, …).

> NOTE: the reference is a soft AI-rendered dashboard: several gaps are 1–4 px irregular
> (e.g. KPI row right edge 1647 vs other rows 1651). Use the measured numbers below; where a
> "designed" rounded value is more practical it is given in parentheses.

---

## 1. Global layout

| Region | Box (x0, y0 → x1, y1) | Size | Notes |
|---|---|---|---|
| Sidebar (fixed) | 0, 0 → 255, 941 | **256 × 941** | dark navy, no border; content starts x=256 |
| Top bar (fixed) | 256, 0 → 1672, 68 | **1416 × 68** | solid white `#ffffff` |
| Scrollable content | 256, 68 → 1672, 941 | 1416 × 873 | page bg `#f4f6fb` (see §2) |
| Content inner (cards) | 291, … → 1651/1652 | **1361 wide** | left pad ≈35 px from sidebar, right pad ≈20 px |

Page-header block (inside content, y 68 – ~189):
- H1 "Dashboard": text ink x **297 → 488**, ink y **104 → 130** (baseline ≈130).
- Subtitle: ink x **297 → 654**, ink y **148 → 163**.
- Header row of `今日 / 近7天 / 近30天 / calendar` is vertically centred with the H1 (see §3).

Card grid (measured edges; gap values are real measurements, intended design ≈16 px):

| # | Card | x0 | y0 | x1 | y1 | w | h |
|---|---|---|---|---|---|---|---|
| 1 | KPI 总请求量 | 291 | 189 | 733 | 320 | 443 | 132 |
| 2 | KPI Token 使用量 | 748 | 189 | 1190 | 320 | 443 | 132 |
| 3 | KPI 成功率 | 1206 | 189 | 1647 | 320 | 442 | 132 |
| 4 | 请求量趋势 (line) | 291 | 338 | 1129 | 673 | 839 | 336 |
| 5 | Token 使用量分布 (donut) | 1139 | 338 | 1651 | 673 | 513 | 336 |
| 6 | 近期请求记录 (table) | 291 | 696 | 1006 | 905 | 715 | 210 |
| 7 | 系统概览 (tiles) | 1020 | 696 | 1651 | 905 | 632 | 210 |

Gaps measured: KPI row ≈15 px (733→748, 1190→1206); chart row ≈10 px (1129→1139);
bottom row ≈14 px (1006→1020). Rows: KPI→chart 18 px (320→338), chart→bottom 23 px (673→696).
Bottom whitespace 905→941 = 36 px.

Card chrome (all 7 cards): background **`#ffffff`** (sampled `#fefefe`), **border-radius 12 px**,
1 px border `#eef1f6` (very subtle; often reads as `#f0f2f7`), shadow approx
`0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.05)` — visible as a 1–3 px soft gray
`#e5e9ef → #f4f6fb` falloff directly under each card's bottom edge.

---

## 2. Color palette (hex sampled from the PNG)

| Token | Hex | Where |
|---|---|---|
| Sidebar base | **`#19223a`** (mix of `#19223a` / `#182138` / `#1a233b`) | whole sidebar |
| Sidebar active item bg | **`#3254a0`** (measured `#3155a0`–`#3354a0`) | Dashboard row |
| Sidebar active left accent | **`#6bb3f5`** | 3 px wide bar x 0–2 of active row |
| Sidebar divider | `#333c54` | 1 px line between nav groups |
| Sidebar faint text | `#94a3b8` / measured `#abb4cb` | inactive nav labels |
| Page bg | **`#f4f6fb`** | lower content area |
| Page bg (header band y 68–195) | **`#f1f3f8`** | slightly darker due to topbar shadow; use `#f4f6fb` + soft top shadow |
| Card bg | **`#ffffff`** | all cards |
| Card border | `#eef1f6` | 1 px |
| Text primary / headings | **`#0f172a`** (Titles, KPI values, `#10162f` sampled) | |
| Text body (table cells) | `#1f2937` / `#334155` | |
| Text secondary (subtitle, labels) | `#64748b` / `#6b7280` (sampled `#7d818d`) | |
| Table header text | `#475569` | |
| Axis tick text | `#6b7280` (sampled `#4c4b51` core) | |
| Accent blue (solid) | **`#3f7cf5`** (今日 pill avg; ≈ `#3b82f6`) | |
| Chart series blue | **`#3b82f6`** (sampled `#3175f0`) | |
| KPI icon blue | `#2f6bf1` | |
| Green (success) | **`#10b981`** (icon `#5bc094`), delta text ~`#16a34a` | |
| Purple (成功率 icon) | **`#8b5cf6`** (sampled `#8663f2`) | |
| Orange | **`#f59e0b`** (Qwen ring `#efac7f`) | |
| Badge green bg | **`#e7f6ed`** (`#ebf6f0` sampled) | 成功 pill |
| Badge green text | `#16a34a` (sampled `#3f9d5c`) | |
| Badge red | `#ef4444` (sampled `#e35156`) | bell notification |
| Table header row bg | **`#eff2f9`** | |
| Table row separator | `#f5f7fa` | |
| Tile tints | `#eff4fc` blue / `#f3f1fc` purple / `#f1faf7` mint / `#fcf7f2` orange | 系统概览 tiles |
| Control group bg (近7天/近30天) | `#f9fbfe` | looks like white @ ~90 % |
| Calendar button bg | `#ffffff` | |
| Gridline (chart) | `#eef1f6`–`#f1f2f6` | vertical + horizontal |

---

## 3. Top bar (x 256–1672, y 0–68, bg #ffffff)

- **Hamburger menu**: 3 horizontal bars, box x **292–314**, y **25–42** (22 × 17), bar thickness ≈2.5 px,
  gap ≈5 px, colour `#1e293b`; left margin from sidebar = 36 px.
- **Bell icon** (outline, stroke `#334155`, ~22 px): x **1478–1500**, y **21–48**.
- **Red notification badge**: circle d≈15 px, x **1490–1505**, y **15–30**, bg `#ef4444`,
  white number **“3”** (⚠ this is **3**, not 9 – the task brief said 9), font 9–10 px / 700.
- **Avatar**: 40 px circle x **1539–1579**, y **14–54**; pale blue-lavender bg `#dbe4f3`,
  flat illustrated person (dark navy hair/shirt + skin-tone face).
- **User name “admin”**: ink x **1584–1626**, y **28–38**, 15 px / 500, `#1e293b`.
- **Chevron-down** next to it: x **1636–1643**, y **31–35**, stroke `#475569`.
- Top bar bottom edge: no visible border, but a very soft shadow darkens the page bg below it
  (bg reads `#f1f3f8` from y 68 down to ≈195, then `#f4f6fb`).

---

## 4. Sidebar (0–255, full height, bg #19223a)

### 4.1 Logo block (y 0 – 104)
- **Brain/cloud-circuit logo**: cyan cloud outline `#38bdf8` containing circuit nodes/dots and
  connecting traces (two “hemispheres”); box x **24–70**, y **18–64** (≈46 × 44).
- Text block x **101 → ~237**:
  - line 1 **“LLM推理”** — 16 px / 700, white `#f8fafc`, ink y **24–38**.
  - line 2 **“Token 流量管理系统”** — 13 px / 400, `#94a3b8`, ink y **45–60**.

### 4.2 Nav items (block layout x 0–255)
Active item: **Dashboard**, rect **y 105 → 161** (h 57), full width, bg `#3254a0`,
left accent bar **#6bb3f5** x 0–2 (3 px); text white, ink x 72–153, y 129–140 (16 px / 600).

Inactive items (h ≈55–56 px each; icon 20×20 at x **29–48**, label left-aligned x **72**,
label ink height ≈14 px → font 16 px / 400, colour `#94a3b8`–`#abb4cb`; chevron `⌄`
right-aligned around x **225–237**, stroke `#94a3b8` 12 px):

| Label | Label ink y | Row centre y | Icon (20×20) | Chevron |
|---|---|---|---|---|
| 用户管理 | 186–199 | 192.5 | x29–48, y183–202 — two-person outline | yes |
| 角色管理 | 241–254 | 247.5 | x29–49, y238–257 — user + shield | no |
| 权限管理 | 296–309 | 302.5 | x29–48, y292–313 — shield with “+” | no |
| *(divider at y ≈ 343, 1 px `#333c54`, x 20–236)* | | | | |
| 流量监控 | 380–396 | 388 | x29–48, y378–397 — chart/monitor | yes |
| 系统设置 | 435–448 | 441.5 | x29–48, y431–452 — gear | yes |

### 4.3 Logout (bottom)
- Icon (arrow-out-of-door, 20 px): x **30–48**, y **860–879**.
- Label **“退出登录”**: ink x **71–132**, y **862–876**, 16 px, `#94a3b8`.

---

## 5. Page header (content x 291…, y 68–189)

- **H1 “Dashboard”** — x **297**, ink y 104–129 (cap height 26 → **font-size 36 px, weight 700**),
  colour `#0f172a`, letter-spacing normal.
- **Subtitle** — `实时监控 LLM 推理服务的 Token 流量与使用情况`; x **297**, ink y 148–163,
  ink width 358; **16 px / 400**, `#6b7280` (slightly muted, `#64748b` works).
- Right-side controls (vertically centred with H1):
  - **今日** pill: rect **x 1367–1430 (w 63), y 95–135 (h 40)**; bg blue **`#3f7cf5`**
    (subtle top→bottom gradient `#4887ef → #417ef4` acceptable); radius 8–10 px; text
    **“今日”** white, ink x 1386–1411, y 109–120 → **14 px / 500**.
  - **Segmented group** (近7天 / 近30天): rect **x 1443–1589 (w 146), y 96–135 (h 39)**;
    bg `#f9fbfe`, radius 8–10 px, no visible divider between the two options.
    Labels **“近7天”** ink x 1456–1492, **“近30天”** ink x 1528–1572, both ink y 109–121,
    **14 px / 500**, `#475569` (active/pressed styling is not distinguishable).
  - **Calendar button**: rect **x 1598–1644 (w 46), y 96–135 (h 39)**, bg `#ffffff`,
    radius 8–10; calendar icon (outline, 16 px) x **1613–1628**, y **107–123**, stroke `#475569`.

---

## 6. KPI cards (y 189–320, h 132)

Card boxes: c1 **291–733**, c2 **748–1190**, c3 **1206–1647**. bg white, radius 12, border/shadow per §1.
Common internal layout: icon badge on the left, text column starting at x ≈ card_x+104,
sparkline occupying the right ~40 %.

### 6.1 Card 1 — 总请求量
- **Icon**: pale blue circle `#e8eefc` d≈60, box **x 312–372, y 202–262** (centre 342,232);
  inside it a **blue chat-bubble** rounded square **x 322–362, y 211–249** (`#2f6bf1`) with 3 white
  dots + a tail, and a second smaller pale-blue bubble `#a8c6f9` at bottom-right (part of icon art).
- **Label 总请求量**: x **395–463**, ink y **218–234** → **18 px / 600**, `#334155`.
- **Value 128,960**: x **397–522**, digit ink y **250–273** (cap 24 → **font-size 32 px / 700**),
  `#0f172a`.
- **Delta ↑ 12.5%**: x **397–457**, ink y **288–299** → **14–15 px / 600**, green `#16a34a`
  (arrow + text; arrow ≈10 px).
- **Sparkline**: box **x 548–718, y 228–312** (170 × 84). Stroke `#3b82f6`, ≈2 px, smooth
  (monotone) curve rising left→right with wiggles; ~8 local maxima. Area below curve filled with
  vertical gradient `rgba(59,130,246,.16) → rgba(59,130,246,0)` (reads `#eef4ff` at top → white).
  Normalised points (x, y; y=0 top, 1 bottom), 21 samples:
  (0.00,.98)(0.05,.96)(0.10,.86)(0.15,.87)(0.20,.89)(0.25,.89)(0.30,.86)(0.35,.91)(0.40,.90)
  (0.45,.75)(0.50,.67)(0.55,.71)(0.60,.65)(0.65,.56)(0.70,.58)(0.75,.65)(0.80,.62)(0.85,.55)
  (0.90,.46)(0.95,.39)(1.00,.30)

### 6.2 Card 2 — Token 使用量
- **Icon**: pale mint circle `#e7f7f4` d≈60, box **x 768–828, y 202–262** (centre 798,232);
  **green database/coin-stack** icon (3 stacked ellipses) `#10b981`–`#5bc094`, box x 782–824,
  y 216–257.
- **Label Token 使用量**: x **847–953**, ink y **219–234** (18 px / 600, `#334155`).
- **Value 1.24B**: x **849–934**, ink y **250–273** (32 px / 700, `#0f172a`).
- **Delta ↑ 18.7%**: x **849–908**, ink y 288–299, green.
- **Sparkline**: box **x 1010–1176, y 228–312**; stroke `#10b981`, gradient fill
  `rgba(16,185,129,.16) → transparent`; low start, steady climb, small dips.
  Normalised points: (0,1.0)(0.05,.90)(0.10,.81)(0.15,.84)(0.20,.86)(0.25,.79)(0.30,.82)
  (0.35,.90)(0.40,.78)(0.45,.59)(0.50,.49)(0.55,.55)(0.60,.46)(0.65,.27)(0.70,.33)(0.75,.43)
  (0.80,.41)(0.85,.27)(0.90,.14)(0.95,.0)(1.0,.08)

### 6.3 Card 3 — 成功率
- **Icon**: pale lavender circle `#edeafb` d≈60, box **x 1226–1286, y 202–262** (centre 1256,232);
  **purple filled circle `#8663f2`** d≈44 (x 1240–1282, y 224–258) with **white check-mark**
  (stroke ~4 px).
- **Label 成功率**: x **1306–1356**, ink y **219–234** (18 px / 600, `#334155`).
- **Value 99.2%**: x **1307–1400**, ink y **250–273** (32 px / 700, `#0f172a`).
- **Delta ↑ 0.1%**: x **1308–1358**, ink y 288–299, green.
- **Sparkline**: box **x 1462–1633, y 228–312**; stroke **`#8b5cf6`** (renders soft, ~70 % opacity,
  sampled `#a590e3`), gradient fill lavender; starts mid-height, large spikes.
  Normalised points: (0,.99)(0.05,.92)(0.10,.80)(0.15,.67)(0.20,.80)(0.25,.74)(0.30,.74)
  (0.35,.82)(0.40,.81)(0.45,.60)(0.50,.49)(0.55,.48)(0.60,.46)(0.65,.38)(0.70,.37)(0.75,.36)
  (0.80,.41)(0.85,.36)(0.90,.33)(0.95,.32)(1.0,.24)

---

## 7. Line chart card — 请求量趋势 (x 291–1129, y 338–673)

- **Card title row** (y ≈365–382):
  - Bar-chart icon 3 blue bars `#3b82f6`: box x **314–332**, y **365–382**.
  - Title **“请求量趋势”**: ink x **346–435**, y **365–382**, **18 px / 600**, `#0f172a`.
  - Legend, right aligned: blue dot d≈11 centre **(899, 375.5)**, colour `#3b82f6`;
    label **“总请求量”** ink x **915–970**, y 369–381, 14 px / 500, `#334155`.
    Green dot d≈11 centre **(994.5, 375.5)** `#10b981`; label **“成功请求”** ink x **1012–1065**.
- **Plot box**: x **357 → 1110**, y **416 → 605** (753 × 189). White plot bg, no border box;
  horizontal gridlines `#eef1f6` (1 px) at y = **416, 463.5, 510, 557.5, 605**
  (spacing 47.25 px = 25k units).
- **Y axis ticks** (right-aligned, right edge x ≈341; 13–14 px, `#6b7280`):
  `100k` ink y 413–423; `75k` 460–470; `50k` 510–519; `25k` 558–568; `0` ≈587–600 (centred on y=605 line).
  Domain: **0 → 100,000** (25k per gridline, y = 605 − value/100000·189).
- **X axis ticks** (14 px, `#6b7280`, ink y **637–646**), ink boxes and centres:
  `00:00` 370–402 (c 386) · `04:00` 498–531 (c 514.5) · `08:00` 627–660 (c 643.5) ·
  `12:00` 754–785 (c 769.5) · `16:00` 880–912 (c 896) · `20:00` 1004–1036 (c 1020).
  Spacing ≈126–128 px per 4 h. Vertical gridlines `#f1f2f6` at x = **431, 554, 679, 802, 927, 1057**
  (note: in the reference they are offset ~30–45 px right of the tick-label centres — an artefact;
  a Chart.js/ECharts render with labels centred on gridlines looks correct and closer to intent).
- **Series** (2 px lines, markers r≈3.5 at data points, both lines smooth/monotone):
  - 总请求量: stroke **`#3b82f6`**; 成功请求: stroke **`#10b981`**.
  - Area fills under each line, vertical gradient: blue `rgba(59,130,246,.18)` top → transparent;
    green `rgba(16,185,129,.20)` top → transparent (combined area reads mint `#e6f5f2` mid-plot).
  - Approx values (derived from pixel y, domain 0–100k; curve is what matters):
    | tick | 00:00 | 04:00 | 08:00 | 12:00 | 16:00 | 20:00 | end (~22:00) |
    |---|---|---|---|---|---|---|---|
    | 总请求量 | ≈12.5k | ≈31.4k | ≈51.2k | ≈58.3k | ≈49.7k | **78,230** | ≈66k |
    | 成功请求 | ≈6.9k | ≈24.1k | ≈43.3k | ≈49.5k | ≈44.1k | **77,102** | ≈65k |
  - Additional shape info (y in px at x): blue: (358,594)(425,561)(494,542)(562,544)(631,516)
    (699,510)(768,495)(836,492)(905,514)(973,495)(1042,450)(1107,483);
    green: (360,596)(425,576)(494,554)(562,561)(631,531)(699,526)(768,508)(836,501)(905,527)
    (973,490)(1042,452)(1107,486). Peaks ≈ y 470 around x 660–700 and x 1070; trough near x 900.
- **Tooltip** (open, anchored near the 20:00 point, right side of plot):
  - Box **x 900–1057, y 406–488** (157 × 82), radius 10, bg `#ffffff`, border `#eef1f6`,
    shadow `0 8px 24px rgba(15,23,42,.14)`; a soft 1 px outline/shadow all round.
  - Line 1 **“20:00”**: ink x **916–948**, y **422–431**, 14–15 px / 600, `#0f172a`.
  - Line 2: blue dot d≈11 at x **915–926**, y **444–454**; text **“请求量: 78,230”**
    (label 14 px `#334155`, value 600 `#0f172a`) starting x ≈934, ink y ≈438–452.
  - Line 3: green dot d≈11 at x **915–925**, y **463–474**; text **“成功请求: 77,102”**,
    ink y ≈458–473.
  - (Optional) thin vertical crosshair/gridline at x ≈1057 behind the tooltip.

---

## 8. Donut card — Token 使用量分布 (x 1139–1651, y 338–673)

- **Title** **“Token 使用量分布”**: ink x **1161–1315**, y **369–386**, **18 px / 600**, `#0f172a`.
- **Donut**: centre ≈ **(1283, 535)**; outer radius **107**, inner radius **71** (ring thickness 36).
  No white gaps between arcs (pure butt-joins), slight antialias at boundaries.
- **Segments** (clockwise, 0° = 12 o'clock; measured):
  | start→end | colour | approx share | legend match |
  |---|---|---|---|
  | 0° → 144° | **`#4d87f5`** (blue) | 40 % | GPT-4o 40.2 % ✓ |
  | 144° → 228° | **`#efac7f`** (orange) | 23 % | Qwen-Max 18.1 % (oversized in image) |
  | 228° → 276° | **`#98d683`** (green) | 13 % | Claude-3.5 32.6 % (undersized in image) |
  | 276° → 330° | **`#70b7f6`** (light blue) | 15 % | *(no legend row)* |
  | 330° → 360° | **`#a6baf9`** (lavender) | 8 % | 其他 9.1 % ✓ |
  ⚠ The reference ring visually has **5 arcs** (the Claude green arc is short and a light-blue arc
  appears at 10–11 o'clock); the legend only has 4 rows with % summing to 100.
  For a faithful look use the 5-arc layout above; for a semantically correct chart use
  blue 144.7° / green 117.4° / orange 65.2° / lavender 32.8°.
- **Centre text**: **“1.24B”** ink x **1247–1323**, y **518–540** (cap 21 → **30 px / 700**),
  `#0f172a`; **“总使用量”** ink x **1249–1298**, y **549–563**, **14 px / 400**, `#64748b`.
- **Legend (right column)** — 4 rows, dot Ø13 at x **1430–1443**, label x **1457**, % right-aligned
  to x **1630**; row centres y = **423, 469, 515, 561** (46 px pitch); labels 15 px `#334155`,
  percentages 15 px / 600 `#0f172a`:
  | dot colour | label | % |
  |---|---|---|
  | `#3b82f6` | GPT-4o | 40.2% |
  | `#10b981` | Claude-3.5 | 32.6% |
  | `#f97316` | Qwen-Max | 18.1% |
  | `#a5b4fc` | 其他 | 9.1% |

---

## 9. Table card — 近期请求记录 (x 291–1006, y 696–905)

- **Title** **“近期请求记录”**: ink x **314–429**, y **715–732**, **18 px / 600**, `#0f172a`.
- **查看更多 ›**: blue text ink x **909–983**, y **717–731** (14 px / 500, `#3b82f6`); chevron ›
  at the far right (~x 976–983).
- **Header row**: rect **y 748 → 780** (h 33), x ≈310–990, bg **`#eff2f9`**, radius 8;
  header text ink y **758–769**, **14 px / 600**, `#475569`.
  Column x-positions (left edges of ink): 时间 **322**, 用户 **534**, 模型 **660**,
  Token 数量 **777**, 状态 **922** (状态 is centred in the status column ≈937).
- **Body rows**: 4 rows, pitch ≈30 px, text ink height 12–13 → **14 px / 400**, `#1f2937`;
  row text ink y: row1 789–801 (centre 795), row2 819–831 (825), row3 849–860 (854.5),
  row4 879–890 (884.5). Thin separators `#f5f7fa`.
- **Status badge** 成功: pill ≈ **47 × 21 px** at **x 913–959**, y 785–805 (row 1; same x for all rows),
  radius 10.5, bg **`#e7f6ed`**, text **“成功”** 13 px / 500 `#16a34a` (ink x 924–949, y 789–801).
- **Exact rows** (columns: 时间 / 用户 / 模型 / Token 数量 / 状态):
  | 时间 | 用户 | 模型 | Token 数量 | 状态 |
  |---|---|---|---|---|
  | 2025-05-22 20:45:12 | user123 | GPT-4o | 2,048 | 成功 |
  | 2025-05-22 20:44:57 | alice | Claude-3.5 | 1,024 | 成功 |
  | 2025-05-22 20:44:33 | bob | Qwen-Max | 4,096 | 成功 |
  | 2025-05-22 20:44:20 | admin | GPT-4o | 768 | 成功 |

---

## 10. 系统概览 card (x 1020–1651, y 696–905)

- **Title** **“系统概览”**: ink x **1042–1113**, y **715–732**, 18 px / 600, `#0f172a`.
- **4 tiles**, rect y **748 → 890** (h 143), radius 12, no border:
  | # | box x0–x1 | bg | icon (colour) | label (15 px, `#475569`) | value (28–30 px / 700, `#0f172a`) |
  |---|---|---|---|---|---|
  | 1 | 1038–1179 (w 142) | **`#eff4fc`** | two-user icon `#3b82f6`, x1092–1124, y771–799 | 用户总数 | **128** |
  | 2 | 1195–1335 (w 141) | **`#f3f1fc`** | two-user “group” icon `#8b5cf6`, x1250–1281, y772–799 | 角色数量 | **5** |
  | 3 | 1351–1491 (w 141) | **`#f1faf7`** | 3-D package/box icon `#10b981`, x1408–1434, y772–798 | 接入模型 | **4** |
  | 4 | 1508–1640 (w 133) | **`#fcf7f2`** | clock icon `#f59e0b`, x1560–1588, y771–799 | 系统运行时长 | **15 天** |
  - Tile gaps ≈16–17 px; label ink y ≈825–840; value ink y ≈855–883 (value block centred).
  - Values: 128, 5, 4, 15 天 (the “天” is smaller, ≈16 px, 400 weight, same navy).

---

## 11. Typography summary

Font stack: Chinese UI sans — `"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif`;
Latin/numerals look like **Inter / SF Pro** (use `Inter, system-ui` with `font-feature-settings: "tnum"`).

| Element | Size | Weight | Colour | Evidence (ink height) |
|---|---|---|---|---|
| H1 “Dashboard” | **36 px** | 700 | `#0f172a` | cap 26 px |
| Page subtitle | **16 px** | 400 | `#6b7280` | ink 16 px / 358 px wide |
| Section/card titles (请求量趋势, Token 使用量分布, 近期请求记录, 系统概览) | **18 px** | 600 | `#0f172a` | ink 17 px |
| KPI label (总请求量 …) | **18 px** | 600 | `#334155` | ink 16 px |
| KPI value (128,960 / 1.24B / 99.2%) | **32 px** | 700 | `#0f172a` | digit cap 24 px |
| KPI delta (↑ 12.5%) | **14–15 px** | 600 | `#16a34a` | ink 12 px |
| Donut centre value | **30 px** | 700 | `#0f172a` | cap 21 px |
| Donut centre label / legend | 14–15 px | 400/600 | `#64748b` / `#334155` | |
| Chart title | 18 px | 600 | `#0f172a` | |
| Chart legend | 14 px | 500 | `#334155` | |
| Axis ticks | 13–14 px | 400 | `#6b7280` | digit cap 10 px |
| Tooltip title / rows | 14–15 px | 600 / 400 | `#0f172a` / `#334155` | |
| Table header | 14 px | 600 | `#475569` | |
| Table cells | 14 px | 400 | `#1f2937` | |
| Status badge | 13 px | 500 | `#16a34a` | |
| Sys tile label | 15 px | 400 | `#475569` | |
| Sys tile value | 28–30 px | 700 | `#0f172a` | |
| Nav labels | 16 px | 400 (active 600) | `#94a3b8` (active `#fff`) | |
| Logo line 1 / line 2 | 16 px / 700, 13 px / 400 | | `#f8fafc` / `#94a3b8` | |
| Topbar user name | 15 px | 500 | `#1e293b` | |
| Header buttons | 14 px | 500 | `#ffffff` / `#475569` | |

---

## 12. Exact copy strings (reading order)

Sidebar:
```
LLM推理
Token 流量管理系统
Dashboard
用户管理
角色管理
权限管理
流量监控
系统设置
退出登录
```
Top bar: `admin` (notification badge shows `3`)
Header: `Dashboard` / `实时监控 LLM 推理服务的 Token 流量与使用情况` / `今日` / `近7天` / `近30天`
KPI row: `总请求量` `128,960` `↑ 12.5%` — `Token 使用量` `1.24B` `↑ 18.7%` — `成功率` `99.2%` `↑ 0.1%`
Line chart: `请求量趋势` / `总请求量` / `成功请求` / y: `100k` `75k` `50k` `25k` `0` /
x: `00:00` `04:00` `08:00` `12:00` `16:00` `20:00` /
tooltip: `20:00`, `请求量: 78,230`, `成功请求: 77,102`
Donut: `Token 使用量分布` / `1.24B` / `总使用量` / `GPT-4o 40.2%` / `Claude-3.5 32.6%` /
`Qwen-Max 18.1%` / `其他 9.1%`
Table: `近期请求记录` / `查看更多` / `时间` `用户` `模型` `Token 数量` `状态` /
`2025-05-22 20:45:12` `user123` `GPT-4o` `2,048` `成功` /
`2025-05-22 20:44:57` `alice` `Claude-3.5` `1,024` `成功` /
`2025-05-22 20:44:33` `bob` `Qwen-Max` `4,096` `成功` /
`2025-05-22 20:44:20` `admin` `GPT-4o` `768` `成功`
System overview: `系统概览` / `用户总数 128` / `角色数量 5` / `接入模型 4` / `系统运行时长 15 天`

---

## 13. Icon inventory

| Icon | Where | Box (px) | Description |
|---|---|---|---|
| brain/cloud circuit (logo) | sidebar top-left | x24–70, y18–64 | cyan cloud silhouette with circuit-board traces, round nodes/dots, two-lobe “brain”; stroke/fill `#38bdf8` + lighter `#7dd3fc` |
| home | active nav Dashboard | x28–49, y124–144 (centre 134) | solid/duotone house with door cut-out, white |
| users (2-person) | nav 用户管理 | x29–48, y183–202 | two person silhouettes (outline/duotone) |
| user + shield | nav 角色管理 | x29–49, y238–257 | person with small shield beside |
| shield-plus | nav 权限管理 | x29–48, y292–313 | shield containing “+” |
| chart/monitor | nav 流量监控 | x29–48, y378–397 | bar chart with trend line / monitor |
| gear | nav 系统设置 | x29–48, y431–452 | cog, outline |
| logout | sidebar bottom | x30–48, y860–879 | arrow exiting a rounded door |
| chevron-down | nav right + admin | ~x225–237 (nav, 12 px); x1636–1643 (topbar, 8 px) | thin 2 px stroke chevron |
| hamburger | topbar left | x292–314, y25–42 | 3 bars, rounded caps, `#1e293b` |
| bell | topbar right | x1478–1500, y21–48 | outline bell, stroke `#334155`; red dot badge “3” at x1490–1505, y15–30 |
| avatar | topbar right | x1539–1579, y14–54 | 40 px circle, pale bg, flat-illustrated male bust |
| calendar | header | x1613–1628, y107–123 | outline calendar, 16 px |
| chat bubbles | KPI1 | x312–372, y202–262 | pale-blue circle + blue rounded-square speech bubble with 3 white dots + tail + secondary pale bubble |
| database stack | KPI2 | x768–828, y202–262 (icon x782–824, y216–258) | 3 stacked ellipses (“database”), green gradient |
| check circle | KPI3 | x1226–1286, y202–262 (icon x1240–1282, y224–258) | lavender circle + purple filled circle + white check |
| bar-chart (title) | chart card | x314–332, y365–382 | 3 vertical rounded bars, blue |
| legend dots | chart + donut | Ø10–11 / Ø13 | filled circles in series colours |
| user-group | tile1 | x1092–1124, y771–799 | two/three person glyph, `#3b82f6` |
| user-group (roles) | tile2 | x1250–1281, y772–799 | person + small group, `#8b5cf6` |
| package/box | tile3 | x1408–1434, y772–798 | 3-D isometric cube, `#10b981` |
| clock | tile4 | x1560–1588, y771–799 | filled clock, `#f59e0b` |

---

## 14. Gotchas / surprising details

1. **Bell badge shows “3”, not “9”** (task brief said 9). Confirmed at 8× zoom.
2. Page bg is **not uniform**: `#f1f3f8` in the header band (y≈68–195) vs `#f4f6fb` below —
   consistent with a very soft shadow under the white top bar; replicate with a large soft
   `box-shadow` under the topbar rather than two backgrounds.
3. Card right edges are inconsistent in the reference (KPI row ends at **1647**, other rows **1651**);
   use 1651 for all (container right pad 20 px, left pad 35 px).
4. Chart vertical gridlines are **offset 30–45 px from the x tick labels** in the reference — an
   artefact of the source render; centre labels under gridlines for the correct look.
5. Donut ring has **5 arcs** (extra light-blue arc at 10–11 o'clock) while the legend lists 4
   entries / 100 %; arcs are not proportional to the percentages.
6. KPI sparkline strokes look muted (e.g. purple samples `#a590e3`) because they are drawn at
   ~70 % opacity over white — use full-strength stroke + area gradient.
7. "Token 数量" header has a space: `Token 数量`; KPI2 label `Token 使用量`; tooltip lines use a
   full-width colon+space `请求量: 78,230`.
8. Number formatting: thousands comma (`128,960`, `78,230`, `2,048`); `1.24B` suffix; `99.2%`;
   deltas always prefixed with a green up arrow `↑`.
