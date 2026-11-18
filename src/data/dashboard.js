/* =========================================================
   仪表盘静态数据（从设计稿内容整理）
   ========================================================= */

/* ---------- 侧边导航 ---------- */
export const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'i-home', size: 24 },
  { id: 'users', label: '用户管理', icon: 'i-users', size: 28, chevron: true },
  { id: 'roles', label: '角色管理', icon: 'i-role', size: 28 },
  { id: 'permissions', label: '权限管理', icon: 'i-shield', size: 28 },
  { id: 'traffic', label: '流量监控', icon: 'i-traffic', size: 28, chevron: true, dividerBefore: true },
  { id: 'settings', label: '系统设置', icon: 'i-settings', size: 28, chevron: true },
]

/* ---------- 时间范围筛选 ---------- */
export const ranges = [
  { id: 'today', label: '今日' },
  { id: '7d', label: '近7天' },
  { id: '30d', label: '近30天' },
]

/* ---------- KPI 卡片 ---------- */
export const kpis = [
  { id: 'requests', label: '总请求量', value: '128,960', delta: '12.5%', tone: 'blue', spark: 'requests', icon: 'chat' },
  { id: 'tokens', label: 'Token 使用量', value: '1.24B', delta: '18.7%', tone: 'green', spark: 'tokens', icon: 'database' },
  { id: 'success', label: '成功率', value: '99.2%', delta: '0.1%', tone: 'purple', spark: 'success', icon: 'check' },
]

export const sparkTones = {
  blue: { line: '#3b82f6', stop: '#3b82f6' },
  green: { line: '#10b981', stop: '#10b981' },
  purple: { line: '#8b5cf6', stop: '#8b5cf6' },
}

/* 24h 请求量 / 成功请求（0.25h 步长） */
export const TOTAL = [
    9900, 11900, 13900, 15900, 15900, 17200, 20000, 23000,
    25100, 27700, 29300, 31100, 33200, 34200, 35200, 34200,
    35200, 36200, 36200, 36200, 34200, 33200, 33200, 33200,
    34200, 35200, 35200, 36200, 37200, 39200, 41600, 43300,
    44300, 45300, 47000, 49400, 52400, 54700, 57500, 59500,
    59500, 58500, 56500, 53400, 51400, 50400, 49400, 49400,
    50400, 52400, 54400, 57500, 59500, 60500, 60500, 59500,
    58500, 58500, 58500, 59500, 61500, 61500, 61500, 61500,
    61500, 59500, 57500, 55400, 53400, 51200, 50400, 50400,
    50400, 51400, 53400, 56500, 59600, 62500, 66000, 71500,
    78230, 81000, 82200, 82700, 82800, 82800, 82600, 82200,
    81500, 80500, 79500, 78000, 76000, 74000, 71500,
  ]

export const SUCCESS = [
    8900, 8900, 9900, 10900, 10900, 11900, 12900, 14800,
    17000, 20000, 22000, 24700, 27200, 29100, 30100, 29100,
    29100, 30100, 30100, 29100, 27200, 26100, 24100, 24100,
    24100, 25100, 26100, 28100, 30800, 33200, 35200, 36200,
    37200, 38200, 39900, 42300, 44700, 46400, 48400, 50300,
    50400, 49400, 47900, 45300, 43300, 41300, 41300, 41300,
    42800, 45300, 47500, 50400, 52400, 54400, 54400, 54400,
    53400, 53400, 54400, 55400, 56500, 56500, 56500, 56300,
    55400, 55400, 53400, 51900, 49000, 46100, 44200, 43300,
    43300, 44900, 47600, 51000, 54600, 63000, 69000, 75200,
    77102, 78200, 79000, 78800, 78600, 78400, 78200, 77600,
    76800, 75800, 74500, 73000, 71200, 69600, 69000,
  ]

export const HOURS = TOTAL.map((_, i) => i * 0.25)

export const KPI_SPARKS = {
    requests: [50, 49, 47, 43, 40, 38, 40, 42, 41, 39, 38, 40, 43, 44, 40, 33, 28, 25, 26, 28, 26, 19, 14, 15, 18, 21, 22, 21, 17, 13, 10, 5, 2, 4],
    tokens:   [54, 52, 47, 44, 43, 45, 47, 46, 44, 42, 45, 48, 49, 44, 37, 32, 28, 28, 31, 30, 24, 17, 16, 19, 23, 25, 24, 20, 15, 12, 7, 3, 3],
    success:  [47, 43, 39, 35, 34, 37, 40, 38, 35, 34, 37, 41, 41, 36, 29, 24, 19, 15, 14, 13, 12, 7, 7, 11, 15, 18, 15, 9, 5, 4, 2, 2, 4]
  }

/* ---------- 折线图 ---------- */
export const chart = {
  /* 设计稿中 x 轴刻度标签整体略右移于网格线 */
  vGrid: [118, 242, 366, 490, 614, 738],
  xLabels: [74, 202, 331, 457, 584, 708],
  yTicks: [0, 25000, 50000, 75000, 100000],
  yLabels: { 0: '0', 25000: '25k', 50000: '50k', 75000: '75k', 100000: '100k' },
  defaultHour: 20,
  tooltip: { time: '20:00', total: '78,230', success: '77,102' },
}

/* ---------- 环形图（顺序与设计稿视觉一致） ---------- */
export const donutSegments = [
  { key: 'gpt', from: 0, to: 145, color: '#518af6' },
  { key: 'qwen', from: 145, to: 228, color: '#f1ad7c' },
  { key: 'claude', from: 228, to: 274, color: '#97d486' },
  { key: 'lightblue', from: 274, to: 326, color: '#70b7f6' },
  { key: 'other', from: 326, to: 360, color: '#a6baf9' },
]

export const donutLegend = [
  { tone: 'blue', name: 'GPT-4o', value: '40.2%' },
  { tone: 'green', name: 'Claude-3.5', value: '32.6%' },
  { tone: 'orange', name: 'Qwen-Max', value: '18.1%' },
  { tone: 'lavender', name: '其他', value: '9.1%' },
]

/* ---------- 近期请求记录 ---------- */
export const requestRows = [
  { time: '2025-05-22 20:45:12', user: 'user123', model: 'GPT-4o', tokens: '2,048', status: '成功' },
  { time: '2025-05-22 20:44:57', user: 'alice', model: 'Claude-3.5', tokens: '1,024', status: '成功' },
  { time: '2025-05-22 20:44:33', user: 'bob', model: 'Qwen-Max', tokens: '4,096', status: '成功' },
  { time: '2025-05-22 20:44:20', user: 'admin', model: 'GPT-4o', tokens: '768', status: '成功' },
]

/* ---------- 系统概览 ---------- */
export const overviewTiles = [
  { type: 'users', label: '用户总数', value: '128' },
  { type: 'roles', label: '角色数量', value: '5' },
  { type: 'cube', label: '接入模型', value: '4' },
  { type: 'clock', label: '系统运行时长', value: '15', unit: '天' },
]
