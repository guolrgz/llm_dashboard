/* =========================================================
   认证状态（reactive）
   - token 持久化：localStorage['llm_token']
   - 用户快照：localStorage['llm_user']（减少刷新闪烁）
   - login / fetchMe / logout / hasPerm
   ========================================================= */
import { reactive } from 'vue'
import {
  request,
  getToken,
  setToken,
  getStoredUser,
  setStoredUser,
  clearToken,
} from '../api/client.js'

function normalizePermissions(user) {
  if (!user) return []
  const list = Array.isArray(user.permissions) ? user.permissions.filter((p) => typeof p === 'string') : []
  if (user.isSuper && !list.includes('*')) return ['*', ...list]
  return list.slice()
}

export const auth = reactive({
  token: getToken(),
  user: getStoredUser(),
  permissions: [],
  loading: false,
  ready: false,
  error: null,

  /** 最近错误（ApiError），供页面展示 */
  lastError: null,

  async login(username, password) {
    auth.loading = true
    auth.error = null
    auth.lastError = null
    try {
      const data = await request('/api/auth/login', {
        method: 'POST',
        body: { username, password },
        auth: false,
        timeout: 20000,
      })
      applySession(data)
      return auth.user
    } catch (err) {
      auth.error = err?.message || '登录失败'
      auth.lastError = err
      throw err
    } finally {
      auth.loading = false
    }
  },

  async fetchMe() {
    auth.loading = true
    auth.error = null
    try {
      const data = await request('/api/auth/me', { timeout: 20000 })
      const user = data && data.user ? data.user : data
      applyUser(user)
      auth.ready = true
      return auth.user
    } catch (err) {
      auth.lastError = err
      if (err?.status === 401 || err?.status === 403) resetSession()
      throw err
    } finally {
      auth.loading = false
    }
  },

  async logout() {
    const token = auth.token || getToken()
    try {
      if (token) await request('/api/auth/logout', { method: 'POST', timeout: 8000 })
    } catch {
      /* 网络失败也允许本地登出 */
    } finally {
      resetSession()
    }
  },

  /** 是否拥有某个权限（支持 '*'、'group.*'、精确 key） */
  hasPerm(key) {
    if (!key) return true
    const perms = auth.permissions || []
    if (perms.includes('*')) return true
    if (perms.includes(key)) return true
    const group = String(key).split('.')[0]
    if (group && perms.includes(`${group}.*`)) return true
    const user = auth.user
    if (user && (user.isSuper === true || user.isSuperAdmin === true)) return true
    return false
  },

  hasAnyPerm(keys = []) {
    if (!Array.isArray(keys) || !keys.length) return true
    return keys.some((key) => auth.hasPerm(key))
  },

  hasRole(role) {
    if (!role) return false
    const user = auth.user
    if (!user) return false
    if (user.role === role || user.roleName === role) return true
    return Boolean(user.isSuper) === true && (role === 'super_admin' || role === '超级管理员')
  },

  /** 清空本地会话（不请求后端） */
  clear() {
    resetSession()
  },
})

/* auth.state === auth，方便统一写法（非枚举，避免序列化自引用） */
Object.defineProperty(auth, 'state', {
  get: () => auth,
  enumerable: false,
  configurable: true,
})

function applyUser(user) {
  auth.user = user || null
  auth.permissions = normalizePermissions(auth.user)
  setStoredUser(auth.user)
}

function applySession(data) {
  const token = data?.token || data?.accessToken || data?.access_token || ''
  if (token) {
    auth.token = token
    setToken(token)
  }
  applyUser(data?.user || null)
  auth.ready = true
  auth.error = null
}

export function resetSession() {
  clearToken()
  auth.token = ''
  auth.user = null
  auth.permissions = []
  auth.ready = false
  auth.error = null
  auth.lastError = null
}

/* 统一初始化权限（来自本地快照） */
auth.permissions = normalizePermissions(auth.user)
auth.token = auth.token || ''

/* 其他模块/客户端触发 401 时同步清空内存态 */
if (typeof window !== 'undefined') {
  window.addEventListener('llm:unauthorized', () => {
    auth.token = ''
    auth.user = null
    auth.permissions = []
    auth.ready = false
  })
}

/* 兼容 ref 风格调用（返回同一个 reactive 对象，不是 ref） */
export function useAuth() {
  return auth
}

export const authState = auth
export default auth
