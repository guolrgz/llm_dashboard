<template>
  <header class="topbar">
    <button
      class="icon-btn hamburger"
      type="button"
      :aria-label="expanded ? '关闭菜单' : '打开菜单'"
      aria-controls="sidebar"
      :aria-expanded="expanded"
      @click="$emit('toggle-sidebar')"
    >
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-menu" /></svg>
    </button>
    <div class="topbar-right">
      <button class="icon-btn bell" type="button" aria-label="通知">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-bell" /></svg>
        <span v-if="unread > 0" class="bell-badge">{{ unread }}</span>
      </button>

      <div ref="userWrap" class="topbar-user">
        <button
          class="user"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="toggleMenu"
        >
          <svg class="avatar" viewBox="0 0 40 40" aria-hidden="true"><use href="#i-avatar" /></svg>
          <span class="user-name">{{ displayName }}</span>
          <svg class="ico user-chevron" :class="{ 'is-open': menuOpen }" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron-down" /></svg>
        </button>

        <div v-if="menuOpen" class="user-menu" role="menu" aria-label="用户菜单">
          <div class="user-menu-head">
            <span class="user-menu-avatar">
              <svg viewBox="0 0 40 40" aria-hidden="true"><use href="#i-avatar" /></svg>
            </span>
            <div class="user-menu-meta">
              <strong>{{ displayName }}</strong>
              <span>{{ roleLabel }}</span>
            </div>
          </div>
          <button class="user-menu-item" type="button" role="menuitem" @click="onLogout">
            <svg class="ico" viewBox="0 0 28 28" aria-hidden="true"><use href="#i-logout" /></svg>
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { auth } from '../stores/auth.js'
import { fetchUnreadAlertCount } from '../api/analytics.js'

defineProps({
  expanded: { type: Boolean, default: true },
})
const emit = defineEmits(['toggle-sidebar', 'logout'])

const FALLBACK_UNREAD = 3
const unread = ref(FALLBACK_UNREAD)
const menuOpen = ref(false)
const userWrap = ref(null)

const displayName = computed(() => {
  const user = auth.user
  if (!user) return 'admin'
  return user.nickname || user.username || 'admin'
})

const roleLabel = computed(() => {
  const user = auth.user
  if (!user) return '管理员'
  return user.roleName || user.role || '成员'
})

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

async function loadUnread() {
  try {
    const data = await fetchUnreadAlertCount()
    const count = typeof data === 'number' ? data : data?.unread
    const num = Number(count)
    unread.value = Number.isFinite(num) && num >= 0 ? num : FALLBACK_UNREAD
  } catch {
    unread.value = FALLBACK_UNREAD
  }
}

function onAlertsEvent(event) {
  const num = Number(event?.detail)
  if (Number.isFinite(num) && num >= 0) unread.value = num
}

function onDocumentClick(event) {
  if (!menuOpen.value) return
  if (userWrap.value && !userWrap.value.contains(event.target)) menuOpen.value = false
}

function onKeydown(event) {
  if (event.key === 'Escape') menuOpen.value = false
}

async function onLogout() {
  menuOpen.value = false
  emit('logout')
}

onMounted(() => {
  loadUnread()
  window.addEventListener('llm:alerts-unread', onAlertsEvent)
  document.addEventListener('mousedown', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('llm:alerts-unread', onAlertsEvent)
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>
