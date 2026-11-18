/* SVG 创建与平滑曲线工具（无第三方图表库） */
export const NS = 'http://www.w3.org/2000/svg'

export function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name)
  for (const key in attrs) node.setAttribute(key, attrs[key])
  return node
}

/** 单调三次插值：与设计稿折线的平滑度一致，且不会过冲 */
export function monotonePath(pts) {
  const n = pts.length
  if (n < 2) return ''
  const dx = []
  const dy = []
  const slope = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0]
    dy[i] = pts[i + 1][1] - pts[i][1]
    slope[i] = dy[i] / dx[i]
  }
  const m = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0
    else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i])
    }
  }
  m[n - 1] = slope[n - 2]
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i][0]
    const y0 = pts[i][1]
    const x1 = pts[i + 1][0]
    const y1 = pts[i + 1][1]
    const c1x = x0 + dx[i] / 3
    const c1y = y0 + (m[i] * dx[i]) / 3
    const c2x = x1 - dx[i] / 3
    const c2y = y1 - (m[i + 1] * dx[i]) / 3
    d += `C${c1x},${c1y} ${c2x},${c2y} ${x1},${y1}`
  }
  return d
}
