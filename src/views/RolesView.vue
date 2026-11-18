<template>
  <main class="content console-page roles-page">
    <div class="page-head">
      <div class="page-heading">
        <h1>角色管理</h1>
        <p>查看系统角色、成员数量与权限授权范围{{ canManage ? '，点击角色可调整权限' : '（当前账号为只读模式）' }}</p>
      </div>
      <div v-if="!canManage && !loading && !error" class="mode-tip">
        <svg class="mode-tip-ico" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.7" />
        </svg>
        只读模式
      </div>
    </div>

    <section v-if="!error || roles.length" class="stat-row">
      <article class="stat-card">
        <span class="stat-label">角色总数</span>
        <strong class="stat-value">{{ roles.length }}</strong>
        <span class="stat-sub">系统内置角色</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">关联用户</span>
        <strong class="stat-value">{{ totalMembers }}</strong>
        <span class="stat-sub">已分配角色的账号</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">权限项</span>
        <strong class="stat-value">{{ permissionCount }}</strong>
        <span class="stat-sub">按 {{ groups.length }} 个分组授权</span>
      </article>
    </section>

    <section class="card roles-card">
      <div class="card-head roles-card-head">
        <h2 class="card-title">角色列表</h2>
        <button class="ghost-btn" type="button" :disabled="loading" @click="load">
          <svg class="ghost-btn-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          刷新
        </button>
      </div>

      <ConsoleState v-if="loading && !roles.length" type="loading" title="正在加载角色…" />
      <ConsoleState
        v-else-if="error"
        type="error"
        title="角色加载失败"
        :message="error"
        @retry="load"
      />
      <ConsoleState v-else-if="!roles.length" type="empty" title="暂无角色" message="当前系统中还没有可用角色" />
      <div v-else class="roles-grid">
        <article
          v-for="role in roles"
          :key="role.id"
          class="role-card"
          :class="{ 'role-card--active': editor.open && editor.role && editor.role.id === role.id }"
          tabindex="0"
          role="button"
          @click="openEditor(role)"
          @keyup.enter="openEditor(role)"
        >
          <header class="role-head">
            <h3 class="role-name">{{ role.name }}</h3>
            <span v-if="role.isSuper" class="role-flag role-flag--super">超级管理员</span>
            <span v-else-if="isOwnRole(role)" class="role-flag role-flag--mine">当前角色</span>
          </header>
          <p class="role-desc">{{ role.description || '暂无描述' }}</p>
          <div class="role-metrics">
            <span class="role-metric">
              <span class="role-metric-label">成员</span>
              <strong>{{ role.userCount ?? 0 }}</strong>
            </span>
            <span class="role-metric">
              <span class="role-metric-label">权限</span>
              <strong>{{ role.isSuper ? `${permissionCount}（全部）` : (role.permissions || []).length }}</strong>
            </span>
            <span class="role-key">{{ role.key }}</span>
          </div>
          <footer class="role-foot">
            <span class="role-code">{{ role.isSuper ? '*' : (role.permissions || []).join(' · ') || '未授权' }}</span>
            <span class="role-action">{{ canManage && !role.isSuper ? '配置权限' : '查看权限' }}</span>
          </footer>
        </article>
      </div>
    </section>

    <ConsoleModal
      :open="editor.open"
      :title="editor.role ? `${canManage && !editor.role.isSuper ? '配置权限' : '查看权限'} · ${editor.role.name}` : '角色权限'"
      :width="'720px'"
      :confirm-text="canManage && editor.role && !editor.role.isSuper ? '保存权限' : '关闭'"
      :cancel-text="canManage && editor.role && !editor.role.isSuper ? '取消' : ''"
      :confirm-disabled="permLoading || Boolean(permError) || (canManage && !editor.role?.isSuper && editor.checked.length === 0)"
      :confirm-loading="editor.saving"
      @close="closeEditor"
      @confirm="onPrimary"
    >
      <ConsoleState v-if="permLoading" type="loading" title="正在加载权限目录…" />
      <ConsoleState
        v-else-if="permError"
        type="error"
        title="权限目录加载失败"
        :message="permError"
        @retry="loadPermissions"
      />
      <div v-else class="perm-editor" :class="{ 'perm-editor--readonly': !canToggle }">
        <p v-if="editor.role?.isSuper" class="perm-note perm-note--super">
          超级管理员默认拥有全部权限，不可单独裁剪。
        </p>
        <p v-else-if="!canManage" class="perm-note">当前账号没有 rbac.manage 权限，仅可查看角色授权情况。</p>
        <p v-else class="perm-note">勾选后保存，立即对该角色下的用户生效。</p>

        <div v-if="canToggle" class="perm-tools">
          <button class="link-btn" type="button" @click="checkAll">全选</button>
          <button class="link-btn" type="button" @click="editor.checked = []">清空</button>
          <span class="perm-count">已选 {{ editor.checked.length }} / {{ permissionCount }}</span>
        </div>

        <div v-for="group in groups" :key="group.key" class="perm-group">
          <header class="perm-group-head">
            <label class="perm-group-title">
              <input
                v-if="canToggle"
                type="checkbox"
                class="perm-check"
                :checked="groupCheckedAll(group)"
                :indeterminate="groupCheckedSome(group)"
                @change="toggleGroup(group, $event.target.checked)"
              />
              {{ group.label }}
            </label>
            <span class="perm-group-count">{{ group.items.length }} 项</span>
          </header>
          <div class="perm-list">
            <label v-for="item in group.items" :key="item.key" class="perm-item">
              <input
                v-if="canToggle"
                v-model="editor.checked"
                type="checkbox"
                class="perm-check"
                :value="item.key"
              />
              <span class="perm-item-text">
                <span class="perm-item-name">{{ item.name }}</span>
                <span class="perm-item-desc">{{ item.description || item.key }}</span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </ConsoleModal>

    <ToastHost :toasts="toasts" />
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { request } from '../api/client.js'
import { auth } from '../stores/auth.js'
import ConsoleState from '../components/console/ConsoleState.vue'
import ConsoleModal from '../components/console/ConsoleModal.vue'
import ToastHost from '../components/console/ToastHost.vue'
import { useToast, errorText } from '../components/console/useToast.js'

const toast = useToast()
const { toasts } = toast

function safeHasPerm(key) {
  if (auth && typeof auth.hasPerm === 'function') return auth.hasPerm(key)
  const perms = auth?.permissions || []
  return perms.includes('*') || perms.includes(key)
}
const canManage = computed(() => safeHasPerm('rbac.manage'))

const roles = ref([])
const groups = ref([])
const loading = ref(false)
const error = ref('')

const permissionCount = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))
const totalMembers = computed(() => roles.value.reduce((sum, role) => sum + Number(role.userCount || 0), 0))

function isOwnRole(role) {
  return Boolean(auth?.user && auth.user.roleId === role.id)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [roleData, permData] = await Promise.all([request('/api/roles'), request('/api/permissions')])
    roles.value = Array.isArray(roleData?.items) ? roleData.items : []
    groups.value = Array.isArray(permData?.groups) ? permData.groups : []
  } catch (err) {
    error.value = errorText(err, '角色数据加载失败')
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

/* ---------- 权限编辑 ---------- */
const editor = reactive({ open: false, role: null, checked: [], saving: false })
const permLoading = ref(false)
const permError = ref('')

const canToggle = computed(() => canManage.value && editor.open && editor.role && !editor.role.isSuper)

function allKeys() {
  return groups.value.flatMap((group) => group.items.map((item) => item.key))
}

function openEditor(role) {
  editor.role = role
  editor.checked = role.isSuper ? allKeys() : (role.permissions || []).filter((key) => key !== '*')
  editor.open = true
  if (!groups.value.length) loadPermissions()
}

function closeEditor() {
  if (editor.saving) return
  editor.open = false
  editor.role = null
}

async function loadPermissions() {
  permLoading.value = true
  permError.value = ''
  try {
    const data = await request('/api/permissions')
    groups.value = Array.isArray(data?.groups) ? data.groups : []
  } catch (err) {
    permError.value = errorText(err, '权限目录加载失败')
  } finally {
    permLoading.value = false
  }
}

function groupCheckedAll(group) {
  return group.items.length > 0 && group.items.every((item) => editor.checked.includes(item.key))
}

function groupCheckedSome(group) {
  if (canToggle.value && editor.open) {
    const some = group.items.some((item) => editor.checked.includes(item.key))
    return some && !groupCheckedAll(group)
  }
  return true
}

function toggleGroup(group, checked) {
  const keys = group.items.map((item) => item.key)
  if (checked) editor.checked = [...new Set([...editor.checked, ...keys])]
  else editor.checked = editor.checked.filter((key) => !keys.includes(key))
}

function checkAll() {
  editor.checked = allKeys()
}

function onPrimary() {
  if (canManage.value && editor.role && !editor.role.isSuper) savePermissions()
  else closeEditor()
}

async function savePermissions() {
  if (!editor.role || editor.saving) return
  if (!editor.checked.length) {
    toast.error('请至少保留一项权限')
    return
  }
  editor.saving = true
  try {
    const data = await request(`/api/roles/${editor.role.id}/permissions`, {
      method: 'PUT',
      body: { permissions: [...editor.checked] },
    })
    const updated = data?.role
    const index = roles.value.findIndex((role) => role.id === editor.role.id)
    if (index >= 0) {
      roles.value[index] = updated
        ? { ...roles.value[index], ...updated }
        : { ...roles.value[index], permissions: [...editor.checked] }
    }
    toast.success(`已保存「${editor.role.name}」的权限`)
    editor.open = false
    editor.role = null
  } catch (err) {
    toast.error(errorText(err, '权限保存失败'))
  } finally {
    editor.saving = false
  }
}

onMounted(load)
</script>

<style scoped>
.mode-tip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: center;
  height: 32px;
  padding: 0 13px;
  border: 1px solid #e2e8f2;
  border-radius: 16px;
  background: #fff;
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}
.mode-tip-ico { width: 15px; height: 15px; }

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 17px 20px;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.035), 0 6px 18px rgba(16, 24, 40, 0.03);
}
.stat-label { font-size: 13.5px; color: #6b7280; }
.stat-value { font-size: 27px; line-height: 33px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; }
.stat-sub { font-size: 12.5px; color: #94a3b8; }

.roles-card { padding: 18px 20px 20px; }
.roles-card-head { margin-bottom: 16px; }
.roles-card-head .card-title { font-size: 18px; }
.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 13px;
  border: 1px solid #d5dae4;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-family: inherit;
  font-size: 13.5px;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}
.ghost-btn:hover:not(:disabled) { border-color: #b9c8dd; background: #f8fafd; }
.ghost-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ghost-btn-ico { width: 15px; height: 15px; }

.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}
.role-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px 18px 14px;
  border: 1px solid #e8edf4;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
.role-card:hover,
.role-card:focus-visible {
  border-color: #b9d2f8;
  box-shadow: 0 6px 20px rgba(63, 124, 245, 0.12);
}
.role-card--active { border-color: #7fa8f5; }
.role-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.role-name { margin: 0; font-size: 17px; line-height: 24px; font-weight: 700; color: #0f172a; }
.role-flag {
  height: 22px;
  padding: 0 8px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 22px;
}
.role-flag--super { background: #efeafd; color: #7357cf; }
.role-flag--mine { background: #e3efff; color: #2f6fb5; }
.role-desc {
  margin: 0;
  min-height: 42px;
  font-size: 13.5px;
  line-height: 21px;
  color: #6b7280;
}
.role-metrics { display: flex; align-items: center; gap: 18px; }
.role-metric { display: inline-flex; align-items: baseline; gap: 5px; font-size: 13px; color: #64748b; }
.role-metric strong { font-size: 16px; color: #1f2937; }
.role-metric-label { color: #94a3b8; }
.role-key { margin-left: auto; font-size: 12px; color: #9aa6ba; }
.role-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
  padding-top: 11px;
  border-top: 1px dashed #e9eef6;
}
.role-code {
  overflow: hidden;
  font-size: 12px;
  color: #9aa6ba;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.role-action { flex: none; font-size: 13px; font-weight: 500; color: #2f6fd6; }

/* 权限编辑弹层 */
.perm-editor { padding: 2px 0 4px; }
.perm-note {
  margin: 0 0 12px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #f5f8fd;
  color: #52627a;
  font-size: 13px;
  line-height: 20px;
}
.perm-note--super { background: #f5f2fd; color: #6a55b8; }
.perm-tools {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 6px;
  padding-bottom: 6px;
}
.link-btn {
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  color: #2f6fd6;
  cursor: pointer;
}
.link-btn:hover { text-decoration: underline; }
.perm-count { margin-left: auto; font-size: 12.5px; color: #94a3b8; }
.perm-group { padding: 12px 0 4px; border-top: 1px solid #edf1f7; }
.perm-group:first-of-type { border-top: 0; }
.perm-group-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.perm-group-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  cursor: pointer;
}
.perm-group-count { font-size: 12px; color: #9aa6ba; }
.perm-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 16px; }
.perm-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.14s ease;
}
.perm-item:hover { background: #f7faff; }
.perm-check { width: 16px; height: 16px; margin: 2px 0 0; accent-color: #2077ed; flex: none; cursor: pointer; }
.perm-item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.perm-item-name { font-size: 13.5px; color: #1f2937; }
.perm-item-desc { font-size: 12px; line-height: 18px; color: #94a3b8; }
.perm-editor--readonly .perm-item { cursor: default; }
.perm-editor--readonly .perm-item:hover { background: transparent; }

@media (max-width: 1100px) {
  .roles-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
}
@media (max-width: 860px) {
  .stat-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .stat-card { padding: 13px 14px; }
  .stat-value { font-size: 22px; line-height: 27px; }
  .perm-list { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .stat-row { grid-template-columns: minmax(0, 1fr); }
  .role-desc { min-height: 0; }
}
</style>
