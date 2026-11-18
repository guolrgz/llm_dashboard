import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import UsersView from '../views/UsersView.vue'
import LoginView from '../views/LoginView.vue'
import { auth } from '../stores/auth.js'
import { getToken } from '../api/client.js'

const APP_TITLE = 'LLM推理 · Token 流量管理系统'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: '登录', public: true },
  },
  { path: '/', name: 'dashboard', component: DashboardView, meta: { title: 'Dashboard' } },
  { path: '/users', name: 'users', component: UsersView, meta: { title: '用户管理' } },
  {
    path: '/roles',
    name: 'roles',
    component: () => import('../views/RolesView.vue'),
    meta: { title: '角色管理' },
  },
  {
    path: '/permissions',
    name: 'permissions',
    component: () => import('../views/PermissionsView.vue'),
    meta: { title: '权限管理' },
  },
  {
    path: '/traffic',
    name: 'traffic',
    component: () => import('../views/TrafficView.vue'),
    meta: { title: '流量监控' },
  },
  {
    path: '/models',
    name: 'models',
    component: () => import('../views/ModelsView.vue'),
    meta: { title: '模型管理' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: '系统设置' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

function loginLocation(to) {
  return { path: '/login', query: { redirect: to.fullPath }, replace: true }
}

function isAuthError(err) {
  return err?.status === 401 || err?.status === 403
}

router.beforeEach(async (to) => {
  const token = getToken()

  /* 登录页：已登录则直接进入控制台 */
  if (to.meta.public) {
    if (!token) return true
    if (auth.user && auth.ready) return { path: '/', replace: true }
    try {
      await auth.fetchMe()
      return { path: '/', replace: true }
    } catch (err) {
      if (isAuthError(err)) auth.clear()
      return true
    }
  }

  /* 业务路由：必须有 token */
  if (!token) return loginLocation(to)

  /* token 有效但内存中无用户（刷新/新标签页）：先拉取 current user */
  if (auth.user && auth.ready) return true

  try {
    await auth.fetchMe()
    return true
  } catch (err) {
    if (isAuthError(err)) {
      auth.clear()
      return loginLocation(to)
    }
    /* 后端暂不可用但本地有用户快照：允许进入，由页面展示 error 态 */
    if (auth.user) return true
    return loginLocation(to)
  }
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE
})

export default router
