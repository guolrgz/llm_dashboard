<template>
  <main class="content users-page">
    <div class="page-head users-head">
      <div class="page-heading">
        <h1>用户管理</h1>
        <p>对系统用户进行新增、删除、修改、停用和查询等管理操作</p>
      </div>
    </div>

    <!-- 筛选栏 -->
    <section class="card users-filter">
      <label class="users-search">
        <input
          v-model="keyword"
          type="search"
          placeholder="用户名/用户 ID"
          aria-label="用户名/用户 ID"
          data-testid="search-input"
          @keyup.enter="applyFilters"
        />
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-search" /></svg>
      </label>

      <div class="users-field">
        <span class="users-field-label">状态:</span>
        <div class="users-seg" role="group" aria-label="状态筛选">
          <button
            v-for="opt in statusOptions"
            :key="opt.id"
            class="users-seg-btn"
            :class="{ 'is-active': statusFilter === opt.id }"
            type="button"
            @click="statusFilter = opt.id"
          >{{ opt.label }}</button>
          <span class="users-seg-caret" aria-hidden="true">
            <svg class="ico" viewBox="0 0 24 24"><use href="#i-chevron-down" /></svg>
          </span>
        </div>
      </div>

      <div class="users-field">
        <span class="users-field-label">角色:</span>
        <div class="users-seg" role="group" aria-label="角色筛选">
          <button
            v-for="opt in roleOptions"
            :key="opt.id"
            class="users-seg-btn"
            :class="{ 'is-active': roleFilter === opt.id }"
            type="button"
            @click="roleFilter = opt.id"
          >{{ opt.label }}</button>
          <span class="users-seg-caret" aria-hidden="true">
            <svg class="ico" viewBox="0 0 24 24"><use href="#i-chevron-down" /></svg>
          </span>
        </div>
      </div>

      <div class="users-filter-actions">
        <button class="u-btn u-btn--primary" type="button" data-testid="query-btn" :disabled="loading" @click="applyFilters">
          {{ loading ? '查询中…' : '查询' }}
        </button>
        <button class="u-btn u-btn--ghost" type="button" data-testid="reset-btn" @click="resetFilters">重置</button>
      </div>
    </section>

    <!-- 用户表格 -->
    <section class="card users-table-card">
      <div class="users-toolbar">
        <button v-if="canManage" class="u-btn u-btn--primary u-btn--icon" type="button" data-testid="add-user" @click="openCreate">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-plus" /></svg>新增用户
        </button>
        <button
          v-if="canManage"
          class="u-btn u-btn--danger u-btn--icon"
          type="button"
          data-testid="batch-delete"
          :aria-disabled="!selected.length"
          @click="askBatchDelete"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-trash" /></svg>批量删除
        </button>
        <button
          v-if="canManage"
          class="u-btn u-btn--muted u-btn--icon"
          type="button"
          data-testid="batch-toggle"
          :disabled="!selected.length"
          @click="askBatchToggle"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-ban" /></svg>批量启用/停用
        </button>
      </div>

      <div class="users-table-wrap">
        <table class="users-table">
          <colgroup>
            <col class="u-col-check" />
            <col class="u-col-id" />
            <col class="u-col-name" />
            <col class="u-col-role" />
            <col class="u-col-mail" />
            <col class="u-col-time" />
            <col class="u-col-status" />
            <col class="u-col-ops" />
          </colgroup>
          <thead>
            <tr>
              <th class="u-cell-check">
                <input
                  v-if="canManage"
                  ref="selectAllEl"
                  class="u-checkbox"
                  type="checkbox"
                  :checked="allSelected"
                  aria-label="全选"
                  data-testid="select-all"
                  @change="toggleAll"
                />
              </th>
              <th>用户ID</th>
              <th>用户名</th>
              <th>角色</th>
              <th>邮箱/联系方式</th>
              <th>创建时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && !userList.length">
              <td colspan="8" class="u-empty">加载中…</td>
            </tr>
            <tr v-else-if="listError">
              <td colspan="8" class="u-empty">
                <span class="u-error-inner">
                  <span>{{ listError }}</span>
                  <button class="u-link" type="button" @click="fetchUsers">重试</button>
                </span>
              </td>
            </tr>
            <tr v-else-if="!userList.length">
              <td colspan="8" class="u-empty">该页暂无符合条件的用户</td>
            </tr>
            <template v-else>
              <tr v-for="user in userList" :key="user.id" data-testid="user-row">
                <td class="u-cell-check">
                  <input
                    v-if="canManage"
                    class="u-checkbox"
                    type="checkbox"
                    :checked="selected.includes(user.id)"
                    :aria-label="`选择 ${user.username}`"
                    @change="toggleOne(user)"
                  />
                </td>
                <!-- 设计稿列映射：用户ID 列显示 username，用户名 列显示 userNo（users-design-spec §10 照抄） -->
                <td>{{ user.username }}</td>
                <td>{{ user.userNo || '—' }}</td>
                <td>{{ user.roleName || user.role || '—' }}</td>
                <td>{{ user.email || '—' }}</td>
                <td>{{ user.createdAt || '—' }}</td>
                <td>
                  <span class="u-badge" :class="user.status === 'enabled' ? 'u-badge--on' : 'u-badge--off'">
                    {{ user.status === 'enabled' ? '已启用' : '已停用' }}
                  </span>
                </td>
                <td class="u-ops">
                  <template v-if="canManage">
                    <button class="u-link" type="button" data-testid="edit-user" @click="openEdit(user)">编辑</button>
                    <button class="u-pill" type="button" data-testid="toggle-status" @click="toggleStatus(user)">
                      {{ user.status === 'enabled' ? '停用' : '启用' }}
                    </button>
                    <button class="u-link u-link--danger" type="button" data-testid="delete-user" @click="askDelete(user)">删除</button>
                  </template>
                  <span v-else class="u-readonly">只读</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="users-pagination" data-testid="pagination">
        <span class="u-total">{{ pagination.label }}</span>
        <div class="u-pager">
          <button class="u-page-btn" type="button" data-testid="prev-page" :disabled="page <= 1 || loading" @click="gotoPage(page - 1)">上一页</button>
          <template v-for="item in pagination.pages" :key="String(item)">
            <span v-if="item === '…'" class="u-ellipsis">…</span>
            <button
              v-else
              class="u-page-btn"
              :class="{ 'is-active': page === item }"
              type="button"
              :data-testid="'page-btn-' + item"
              @click="gotoPage(item)"
            >{{ item }}</button>
          </template>
          <button class="u-page-btn" type="button" data-testid="next-page" :disabled="page >= pageCount || loading" @click="gotoPage(page + 1)">下一页</button>
        </div>
      </div>
    </section>

    <!-- 新增 / 编辑用户 -->
    <div v-if="dialog.open" class="u-modal-mask" @click.self="closeDialog">
      <div class="u-modal" role="dialog" aria-modal="true" :aria-label="dialog.mode === 'create' ? '新增用户' : '编辑用户'">
        <div class="u-modal-head">
          <h3>{{ dialog.mode === 'create' ? '新增用户' : '编辑用户' }}</h3>
          <button class="u-modal-close" type="button" aria-label="关闭" @click="closeDialog">
            <svg class="ico" viewBox="0 0 24 24"><use href="#i-close" /></svg>
          </button>
        </div>
        <div class="u-modal-body">
          <label class="u-form-row">
            <span>用户名</span>
            <input v-model.trim="form.username" type="text" placeholder="请输入用户名" data-testid="form-username" />
          </label>
          <label class="u-form-row">
            <span>用户ID</span>
            <input v-model.trim="form.userNo" type="text" placeholder="留空自动生成" data-testid="form-userno" />
          </label>
          <label class="u-form-row">
            <span>角色</span>
            <select v-model="form.roleId" data-testid="form-role">
              <option v-if="!roleChoices.length" :value="''">暂无可用角色</option>
              <option v-for="role in roleChoices" :key="role.id" :value="role.id">{{ role.name }}</option>
            </select>
          </label>
          <label class="u-form-row">
            <span>邮箱/联系方式</span>
            <input v-model.trim="form.email" type="text" placeholder="请输入邮箱或联系方式" data-testid="form-email" />
          </label>
          <label class="u-form-row">
            <span>{{ dialog.mode === 'create' ? '密码' : '重置密码' }}</span>
            <input
              v-model="form.password"
              type="password"
              :placeholder="dialog.mode === 'create' ? '请输入登录密码' : '留空表示不修改密码'"
              autocomplete="new-password"
              data-testid="form-password"
            />
          </label>
          <label class="u-form-row">
            <span>状态</span>
            <select v-model="form.status" data-testid="form-status">
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
          <p v-if="formError" class="u-form-error" data-testid="form-error">{{ formError }}</p>
        </div>
        <div class="u-modal-foot">
          <button class="u-btn u-btn--ghost" type="button" data-testid="dialog-cancel" @click="closeDialog">取消</button>
          <button class="u-btn u-btn--primary" type="button" data-testid="dialog-confirm" :disabled="saving" @click="saveUser">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 通用确认弹窗 -->
    <div v-if="confirm.open" class="u-modal-mask" @click.self="closeConfirm">
      <div class="u-modal u-modal--confirm" role="dialog" aria-modal="true" aria-label="确认操作">
        <div class="u-modal-head">
          <h3>确认操作</h3>
          <button class="u-modal-close" type="button" aria-label="关闭" @click="closeConfirm">
            <svg class="ico" viewBox="0 0 24 24"><use href="#i-close" /></svg>
          </button>
        </div>
        <div class="u-modal-body">
          <p class="u-confirm-text">{{ confirm.message }}</p>
        </div>
        <div class="u-modal-foot">
          <button class="u-btn u-btn--ghost" type="button" data-testid="dialog-cancel" @click="closeConfirm">取消</button>
          <button class="u-btn u-btn--danger" type="button" data-testid="dialog-confirm" :disabled="confirm.running" @click="runConfirm">
            {{ confirm.running ? '处理中…' : confirm.label }}
          </button>
        </div>
      </div>
    </div>

    <ToastHost :toasts="toasts" />
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watchEffect } from 'vue'
import { request } from '../api/client.js'
import { auth } from '../stores/auth.js'
import ToastHost from '../components/console/ToastHost.vue'
import { useToast, errorText } from '../components/console/useToast.js'

/* ---------------- 常量（筛选选项沿用 users.jpg 设计稿） ---------------- */
const statusOptions = [
  { id: 'all', label: '全部' },
  { id: 'enabled', label: '启用' },
  { id: 'disabled', label: '停用' },
]
const roleOptions = [
  { id: 'all', label: '全部' },
  { id: 'admin', label: '管理员' },
  { id: 'viewer', label: '普通用户' },
]

const toast = useToast()
const { toasts } = toast

/* ---------------- 权限 ---------------- */
function safeHasPerm(key) {
  if (auth && typeof auth.hasPerm === 'function') return auth.hasPerm(key)
  const perms = auth?.permissions || []
  return perms.includes('*') || perms.includes(key)
}
const canManage = computed(() => safeHasPerm('users.manage'))

/* ---------------- 列表状态 ---------------- */
const userList = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const listError = ref('')
const keyword = ref('')
const appliedKeyword = ref('')
const statusFilter = ref('all')
const roleFilter = ref('all')
const selected = ref([])
const selectAllEl = ref(null)

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const pagination = computed(() => {
  const count = pageCount.value
  const current = Math.min(Math.max(1, page.value), count)
  const pages = []
  if (count <= 5) {
    for (let i = 1; i <= count; i += 1) pages.push(i)
  } else if (current <= 3) {
    pages.push(1, 2, 3, '…', count)
  } else if (current >= count - 2) {
    pages.push(1, '…', count - 2, count - 1, count)
  } else {
    pages.push(1, '…', current, '…', count)
  }
  return { label: `共 ${total.value} 条记录，每页 ${pageSize.value} 条`, pages }
})

const allSelected = computed(
  () => userList.value.length > 0 && userList.value.every((u) => selected.value.includes(u.id)),
)
watchEffect(() => {
  const el = selectAllEl.value
  if (el) el.indeterminate = selected.value.length > 0 && !allSelected.value
})

/* ---------------- 角色下拉（GET /api/roles；失败时回退到列表内角色） ---------------- */
const roles = ref([])
const rolesError = ref('')
const roleChoices = computed(() => {
  if (roles.value.length) return roles.value
  const seen = new Map()
  userList.value.forEach((u) => {
    if (u.roleId && u.roleName && !seen.has(u.roleId)) seen.set(u.roleId, { id: u.roleId, name: u.roleName })
  })
  return [...seen.values()]
})

async function fetchRoles() {
  try {
    const data = await request('/api/roles')
    roles.value = (data?.items || []).map((role) => ({ id: role.id, name: role.name, key: role.key }))
    rolesError.value = ''
  } catch (err) {
    rolesError.value = errorText(err, '角色列表加载失败')
  }
}

/* ---------------- 数据请求 ---------------- */
function buildQuery() {
  const params = new URLSearchParams()
  params.set('page', String(page.value))
  params.set('pageSize', String(pageSize.value))
  const kw = appliedKeyword.value.trim()
  if (kw) params.set('keyword', kw)
  if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
  if (roleFilter.value !== 'all') params.set('role', roleFilter.value)
  return params.toString()
}

async function fetchUsers() {
  loading.value = true
  listError.value = ''
  try {
    const data = await request(`/api/users?${buildQuery()}`)
    userList.value = Array.isArray(data?.items) ? data.items : []
    total.value = Number(data?.total || 0)
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value))
    if (page.value > maxPage) {
      page.value = maxPage
      await fetchUsers()
      return
    }
    const ids = new Set(userList.value.map((u) => u.id))
    selected.value = selected.value.filter((id) => ids.has(id))
  } catch (err) {
    userList.value = []
    total.value = 0
    listError.value = errorText(err, '用户列表加载失败')
    toast.error(listError.value)
  } finally {
    loading.value = false
  }
}

/* ---------------- 筛选 / 分页 ---------------- */
function applyFilters() {
  appliedKeyword.value = keyword.value
  page.value = 1
  selected.value = []
  fetchUsers()
}

function resetFilters() {
  keyword.value = ''
  appliedKeyword.value = ''
  statusFilter.value = 'all'
  roleFilter.value = 'all'
  page.value = 1
  selected.value = []
  fetchUsers()
}

function gotoPage(target) {
  const next = Math.min(Math.max(1, target), pageCount.value)
  if (next === page.value) return
  page.value = next
  selected.value = []
  fetchUsers()
}

/* ---------------- 选择 ---------------- */
function toggleAll(event) {
  if (event.target.checked) selected.value = userList.value.map((u) => u.id)
  else selected.value = []
}

function toggleOne(user) {
  const index = selected.value.indexOf(user.id)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push(user.id)
}

/* ---------------- 单条操作 ---------------- */
async function toggleStatus(user) {
  if (!canManage.value) return
  const nextStatus = user.status === 'enabled' ? 'disabled' : 'enabled'
  try {
    await request(`/api/users/${user.id}/status`, { method: 'POST', body: { status: nextStatus } })
    toast.success(`${nextStatus === 'enabled' ? '启用' : '停用'}成功`)
    await fetchUsers()
  } catch (err) {
    toast.error(errorText(err, '状态更新失败'))
  }
}

function askDelete(user) {
  if (!canManage.value) return
  confirm.open = true
  confirm.running = false
  confirm.label = '确认删除'
  confirm.message = `确定删除用户 ${user.username}（${user.userNo || '—'}）吗？删除后该用户的 API Key 将一并失效。`
  confirm.action = async () => {
    await request(`/api/users/${user.id}`, { method: 'DELETE' })
    toast.success('删除成功')
    selected.value = selected.value.filter((id) => id !== user.id)
  }
}

/* ---------------- 批量操作 ---------------- */
function askBatchDelete() {
  if (!canManage.value || !selected.value.length) return
  const count = selected.value.length
  confirm.open = true
  confirm.running = false
  confirm.label = '确认删除'
  confirm.message = `确定删除选中的 ${count} 位用户吗？删除后不可恢复。`
  confirm.action = async () => {
    const data = await request('/api/users/batch', { method: 'POST', body: { ids: [...selected.value], action: 'delete' } })
    toast.success(`已删除 ${data?.affected ?? count} 位用户`)
    selected.value = []
  }
}

function askBatchToggle() {
  if (!canManage.value || !selected.value.length) return
  const targets = userList.value.filter((u) => selected.value.includes(u.id))
  const action = targets.some((u) => u.status !== 'enabled') ? 'enable' : 'disable'
  const count = selected.value.length
  confirm.open = true
  confirm.running = false
  confirm.label = '确认执行'
  confirm.message = action === 'enable'
    ? `确定批量启用选中的 ${count} 位用户吗？`
    : `确定批量停用选中的 ${count} 位用户吗？`
  confirm.action = async () => {
    const data = await request('/api/users/batch', { method: 'POST', body: { ids: [...selected.value], action } })
    toast.success(`已${action === 'enable' ? '启用' : '停用'} ${data?.affected ?? count} 位用户`)
    selected.value = []
  }
}

/* ---------------- 确认弹窗 ---------------- */
const confirm = reactive({ open: false, running: false, label: '确认', message: '', action: null })

function closeConfirm() {
  if (confirm.running) return
  confirm.open = false
  confirm.action = null
}

async function runConfirm() {
  if (!confirm.action || confirm.running) return
  confirm.running = true
  try {
    await confirm.action()
    confirm.open = false
    confirm.action = null
    await fetchUsers()
  } catch (err) {
    toast.error(errorText(err, '操作失败'))
  } finally {
    confirm.running = false
  }
}

/* ---------------- 新增 / 编辑弹窗 ---------------- */
const dialog = reactive({ open: false, mode: 'create', target: null })
const form = reactive({ username: '', userNo: '', roleId: '', email: '', password: '', status: 'enabled' })
const formError = ref('')
const saving = ref(false)

function resetForm() {
  formError.value = ''
  const fallbackRole =
    roles.value.find((role) => role.key === 'viewer')?.id ??
    roles.value.find((role) => role.key !== 'super_admin')?.id ??
    roleChoices.value[0]?.id ??
    ''
  Object.assign(form, {
    username: '',
    userNo: '',
    roleId: fallbackRole,
    email: '',
    password: '',
    status: 'enabled',
  })
}

async function openCreate() {
  if (!canManage.value) return
  if (!roles.value.length) await fetchRoles()
  resetForm()
  dialog.mode = 'create'
  dialog.target = null
  dialog.open = true
}

async function openEdit(user) {
  if (!canManage.value) return
  if (!roles.value.length) await fetchRoles()
  formError.value = ''
  dialog.mode = 'edit'
  dialog.target = user.id
  dialog.open = true
  Object.assign(form, {
    username: user.username || '',
    userNo: user.userNo || '',
    roleId: user.roleId ?? roleChoices.value[0]?.id ?? '',
    email: user.email || '',
    password: '',
    status: user.status === 'enabled' ? 'enabled' : 'disabled',
  })
}

function closeDialog() {
  if (saving.value) return
  dialog.open = false
}

function validateForm() {
  if (!form.username) return '请输入用户名'
  if (form.username.length < 3) return '用户名至少 3 个字符'
  if (!form.email) return '请输入邮箱/联系方式'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return '请输入合法的邮箱地址'
  if (!form.roleId) return '请选择角色'
  if (dialog.mode === 'create' && !form.password) return '请设置登录密码'
  if (form.password && form.password.length < 6) return '密码至少 6 位'
  return ''
}

async function saveUser() {
  if (saving.value) return
  const message = validateForm()
  if (message) {
    formError.value = message
    return
  }
  saving.value = true
  formError.value = ''
  const payload = {
    username: form.username,
    email: form.email,
    roleId: form.roleId,
    status: form.status,
  }
  if (form.userNo) payload.userNo = form.userNo
  if (form.password) payload.password = form.password
  try {
    if (dialog.mode === 'create') {
      await request('/api/users', { method: 'POST', body: payload })
      toast.success('新增成功')
      page.value = 1
    } else {
      await request(`/api/users/${dialog.target}`, { method: 'PUT', body: payload })
      toast.success('保存成功')
    }
    dialog.open = false
    await fetchUsers()
  } catch (err) {
    const text = errorText(err, '保存失败')
    formError.value = err?.status === 409 ? '用户名或用户ID已存在，请更换后重试' : text
    toast.error(formError.value)
  } finally {
    saving.value = false
  }
}

/* ---------------- 初始化 ---------------- */
onMounted(async () => {
  await fetchUsers()
  if (canManage.value) fetchRoles()
})
</script>

<style scoped>
/* 设计稿：表格卡主体固定 4 行可视高度（表头 41 + 行区 258），10/页可内部滚动 */
.users-table-wrap {
  max-height: 299px;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.users-table-wrap::-webkit-scrollbar { display: none; }
.users-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
}
.u-error-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #d4556b;
}
.u-error-inner .u-link { font-size: 14px; }
.u-readonly { font-size: 14px; color: #94a3b8; }
.u-modal .u-form-row > span { width: 112px; }
.u-confirm-text {
  margin: 4px 0 8px;
  font-size: 14.5px;
  line-height: 23px;
  color: #334155;
}
.u-modal--confirm { width: 420px; }
@media (max-width: 700px) {
  .users-table-wrap { max-height: 299px; }
}
</style>
