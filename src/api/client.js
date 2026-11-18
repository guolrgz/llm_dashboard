/* =========================================================
   统一 API 客户端
   - 默认 baseURL '/api'（可用 VITE_API_BASE 覆盖）
   - /api/**、/v1/**、http(s):// 原样请求
   - localStorage['llm_token'] 持久化 Bearer Token
   - 统一解析错误 {error:{code,message,details}}
   - 401（认证请求）清 token 并跳转 /login，保留 redirect 参数
   ========================================================= */

const TOKEN_KEY = 'llm_token'
const USER_KEY = 'llm_user'
const DEFAULT_BASE = '/api'

function resolveBase() {
  const raw = import.meta.env && import.meta.env.VITE_API_BASE
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/+$/, '')
  return DEFAULT_BASE
}

export const API_BASE = resolveBase()

/* ---------- token / 用户快照 ---------- */
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

/* ---------- 错误类型 ---------- */
const STATUS_MESSAGES = {
  400: '请求参数有误',
  401: '登录状态已失效，请重新登录',
  403: '没有权限执行该操作',
  404: '请求的资源不存在',
  409: '数据冲突，请检查后重试',
  422: '参数校验失败',
  429: '请求过于频繁或超出配额，请稍后再试',
  500: '服务器内部错误',
  502: '服务暂时不可用',
  503: '服务暂时不可用',
  504: '服务响应超时',
}

export class ApiError extends Error {
  constructor({ status = 0, code = 'unknown', message = '请求失败', details = {}, payload = null, url = '', method = 'GET', cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details && typeof details === 'object' ? details : {}
    this.payload = payload
    this.url = url
    this.method = method
    this.cause = cause
  }
}

/* ---------- URL 解析 ---------- */
function isAbsolutePath(path) {
  return /^https?:\/\//i.test(path) || path.startsWith('/api') || path.startsWith('/v1')
}

export function resolveUrl(path = '') {
  if (!path) return API_BASE
  if (isAbsolutePath(path)) return path
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}

/* ---------- 401 处理 ---------- */
let redirecting = false

function handleUnauthorized() {
  clearToken()
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('llm:unauthorized'))
  } catch {
    /* ignore */
  }
  if (redirecting) return
  redirecting = true
  const current = (window.location.hash || '').replace(/^#/, '') || '/'
  if (current.startsWith('/login')) {
    redirecting = false
    return
  }
  const redirect = current.startsWith('/') ? current : `/${current}`
  window.location.hash = `#/login?redirect=${encodeURIComponent(redirect)}`
  setTimeout(() => {
    redirecting = false
  }, 0)
}

/* ---------- 核心请求 ---------- */
/**
 * @param {string} path 接口路径（'/api/users' 或 '/users'，'/v1/chat/completions'）
 * @param {{method?:string, body?:any, auth?:boolean, headers?:object, signal?:AbortSignal, timeout?:number}} [options]
 * @returns {Promise<any>} 解析后的 JSON（204 返回 null）
 */
export async function request(path, options = {}) {
  const { method = 'GET', body, auth = true, headers = {}, signal, timeout = 20000 } = options
  const upper = String(method).toUpperCase()
  const url = resolveUrl(path)

  const finalHeaders = { Accept: 'application/json', ...headers }
  if (auth) {
    const token = getToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  const init = { method: upper, headers: finalHeaders }
  if (body !== undefined && body !== null) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      init.body = body
    } else {
      finalHeaders['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
  }

  /* 超时 + 调用方取消合并 */
  const signals = []
  if (signal) signals.push(signal)
  if (timeout > 0 && typeof AbortSignal !== 'undefined') {
    if (typeof AbortSignal.timeout === 'function') signals.push(AbortSignal.timeout(timeout))
  }
  if (signals.length === 1) init.signal = signals[0]
  else if (signals.length > 1) {
    init.signal = typeof AbortSignal.any === 'function' ? AbortSignal.any(signals) : signals[0]
  }

  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) throw err
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: '网络异常，无法连接后端服务',
      url,
      method: upper,
      cause: err,
    })
  }

  /* 解析响应体 */
  let payload = null
  if (res.status !== 204 && res.status !== 205) {
    const contentType = res.headers.get('content-type') || ''
    try {
      if (contentType.includes('application/json')) payload = await res.json()
      else {
        const text = await res.text()
        payload = text || null
        if (payload) {
          try {
            payload = JSON.parse(payload)
          } catch {
            /* 保留文本 */
          }
        }
      }
    } catch {
      payload = null
    }
  }

  if (!res.ok) {
    const errBody = payload && typeof payload === 'object' && payload.error ? payload.error : {}
    if (res.status === 401 && auth) handleUnauthorized()
    throw new ApiError({
      status: res.status,
      code: errBody.code || `http_${res.status}`,
      message: errBody.message || STATUS_MESSAGES[res.status] || `请求失败（HTTP ${res.status}）`,
      details: errBody.details || {},
      payload,
      url,
      method: upper,
    })
  }

  return payload
}

/* ---------- 便捷方法 ---------- */
export const api = {
  request,
  get(path, options = {}) {
    return request(path, { ...options, method: 'GET' })
  },
  post(path, body, options = {}) {
    return request(path, { ...options, method: 'POST', body })
  },
  put(path, body, options = {}) {
    return request(path, { ...options, method: 'PUT', body })
  },
  patch(path, body, options = {}) {
    return request(path, { ...options, method: 'PATCH', body })
  },
  del(path, options = {}) {
    return request(path, { ...options, method: 'DELETE' })
  },
  delete(path, options = {}) {
    return request(path, { ...options, method: 'DELETE' })
  },
}

export default api
