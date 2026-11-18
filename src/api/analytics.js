/* =========================================================
   Dashboard / 告警分析接口
   契约见 docs/api-contract.md
   ========================================================= */
import { request } from './client.js'

/**
 * Dashboard 聚合数据
 * @param {'today'|'7d'|'30d'} range
 * @param {{signal?: AbortSignal}} [options]
 */
export function fetchDashboard(range = 'today', options = {}) {
  return request(`/api/analytics/dashboard?range=${encodeURIComponent(range)}`, {
    signal: options.signal,
  })
}

/** 顶栏未读告警数 */
export function fetchUnreadAlertCount(options = {}) {
  return request('/api/alerts/unread-count', { signal: options.signal, timeout: 10000 })
}

/** 告警列表（流量监控页等可用） */
export function fetchAlerts(params = {}, options = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const qs = query.toString()
  return request(`/api/alerts${qs ? `?${qs}` : ''}`, { signal: options.signal })
}

/** 流量概览（可选复用） */
export function fetchTrafficSummary(range = 'today', options = {}) {
  return request(`/api/traffic/summary?range=${encodeURIComponent(range)}`, { signal: options.signal })
}

export default { fetchDashboard, fetchUnreadAlertCount, fetchAlerts, fetchTrafficSummary }
