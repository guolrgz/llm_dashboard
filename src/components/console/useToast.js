import { ref } from 'vue'

let seq = 0

/**
 * 轻量 Toast 队列。页面里：
 *   const { toasts, success, error, info } = useToast()
 * 模板里渲染 <ToastHost :toasts="toasts" />。
 */
export function useToast() {
  const toasts = ref([])

  function dismiss(id) {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  function push(message, type = 'success', duration = 2600) {
    const text = String(message || '').trim()
    if (!text) return
    const id = ++seq
    toasts.value = [...toasts.value.slice(-3), { id, message: text, type }]
    if (duration > 0) window.setTimeout(() => dismiss(id), duration)
  }

  return {
    toasts,
    push,
    dismiss,
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error', 3600),
    info: (message) => push(message, 'info'),
  }
}

/** 把后端/网络异常统一转成可直接展示的中文文案。 */
export function errorText(err, fallback = '请求失败，请稍后重试') {
  if (!err) return fallback
  if (typeof err === 'string') return err
  const code = err.code || ''
  if (code === 'network_error') return '网络异常，无法连接服务端'
  if (code === 'unauthorized' || err.status === 401) return '登录已失效，请重新登录'
  if (code === 'forbidden' || err.status === 403) return err.message || '当前账号无权执行该操作'
  if (code === 'token_expired') return '登录已过期，请重新登录'
  const message = err.message || err.data?.error?.message || err.response?.error?.message || ''
  return message || fallback
}
