<template>
  <IconsSprite />
  <RouterView v-if="isLogin" />
  <div
    v-else
    class="app"
    :class="{
      'app--users': isUsers,
      'sidebar-collapsed': sidebarCollapsed,
      'sidebar-open': sidebarOpen,
    }"
  >
    <AppSidebar :items="navItems" :active="activeNav" @navigate="onNavigate" @logout="onLogout" />
    <div class="sidebar-backdrop" aria-hidden="true" @click="closeMobile"></div>

    <div class="main">
      <AppTopbar
        :expanded="sidebarExpanded"
        @toggle-sidebar="toggleSidebar"
        @logout="onLogout"
      />
      <RouterView />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconsSprite from './components/IconsSprite.vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import { navItems as dashboardNav } from './data/dashboard.js'
import { auth } from './stores/auth.js'

const route = useRoute()
const router = useRouter()

const sidebarOpen = ref(false)
const sidebarCollapsed = ref(false)
const isMobile = ref(false)

const isLogin = computed(() => route.name === 'login')
const isUsers = computed(() => route.name === 'users')

/* 设计稿导航 id → 路由 */
const routeMap = {
  dashboard: '/',
  users: '/users',
  roles: '/roles',
  permissions: '/permissions',
  traffic: '/traffic',
  models: '/models',
  settings: '/settings',
}

/* 侧栏始终使用原型 index.png 的 6 项（Dashboard/用户/角色/权限/流量/设置）；
   模型管理通过系统设置页入口 + /models 路由访问 */
const navItems = dashboardNav

/* 侧栏高亮：由当前路由推导，支持 roles/permissions/traffic/models/settings */
const activeNav = computed(() => {
  const name = String(route.name || '')
  if (name === 'dashboard') return 'dashboard'
  if (name === 'users') return 'users'
  if (name === 'roles') return 'roles'
  if (name === 'permissions') return 'permissions'
  if (name === 'traffic') return 'traffic'
  if (name === 'models') return 'models'
  if (name === 'settings') return 'settings'
  return 'dashboard'
})

const sidebarExpanded = computed(() => (isMobile.value ? sidebarOpen.value : !sidebarCollapsed.value))

let mediaQuery = null

function toggleSidebar() {
  if (isMobile.value) sidebarOpen.value = !sidebarOpen.value
  else sidebarCollapsed.value = !sidebarCollapsed.value
}

function closeMobile() {
  sidebarOpen.value = false
}

function onNavigate(id) {
  closeMobile()
  const path = routeMap[id]
  if (!path) return
  if (route.path === path) return
  router.push(path)
}

async function onLogout() {
  closeMobile()
  await auth.logout()
  if (route.path !== '/login') router.replace('/login')
}

function onKeydown(event) {
  if (event.key === 'Escape' && sidebarOpen.value) closeMobile()
}

function syncViewport(event) {
  isMobile.value = event.matches
  sidebarOpen.value = false
  sidebarCollapsed.value = false
}

watch(sidebarOpen, (open) => {
  document.body.classList.toggle('sidebar-locked', open)
})

watch(
  () => route.fullPath,
  () => {
    closeMobile()
  },
)

/* 页面切换时同步刷新文档标题（兜底：路由 meta 已处理） */
watch(
  () => route.meta?.title,
  (title) => {
    const base = 'LLM推理 · Token 流量管理系统'
    document.title = title ? `${title} · ${base}` : base
  },
)

onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 900px)')
  isMobile.value = mediaQuery.matches
  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', syncViewport)
  else if (mediaQuery.addListener) mediaQuery.addListener(syncViewport)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (mediaQuery) {
    if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', syncViewport)
    else if (mediaQuery.removeListener) mediaQuery.removeListener(syncViewport)
  }
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('sidebar-locked')
})
</script>
