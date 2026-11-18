<template>
  <main class="content console-page permissions-page">
    <div class="page-head">
      <div class="page-heading">
        <h1>权限管理</h1>
        <p>查看系统权限目录与角色授权矩阵，只读展示；权限绑定由角色管理页维护</p>
      </div>
      <RouterLink v-if="canManage" class="manage-link" to="/roles">
        <svg class="manage-link-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5 19.5 6v6c0 4.3-3.2 7.4-7.5 8.5C7.7 19.4 4.5 16.3 4.5 12V6L12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="m8.8 11.9 2.2 2.2 4.2-4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        前往角色管理配置权限
      </RouterLink>
    </div>

    <section v-if="!error || items.length" class="stat-row">
      <article class="stat-card">
        <span class="stat-label">权限项</span>
        <strong class="stat-value">{{ items.length }}</strong>
        <span class="stat-sub">系统内置权限点</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">权限分组</span>
        <strong class="stat-value">{{ groups.length }}</strong>
        <span class="stat-sub">按业务模块划分</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">角色</span>
        <strong class="stat-value">{{ roles.length }}</strong>
        <span class="stat-sub">已纳入授权矩阵</span>
      </article>
    </section>

    <ConsoleState v-if="loading && !items.length" type="loading" title="正在加载权限目录…" />
    <ConsoleState
      v-else-if="error"
      type="error"
      title="权限数据加载失败"
      :message="error"
      @retry="load"
    />

    <template v-else>
      <!-- 权限目录 -->
      <section class="card catalog-card">
        <div class="card-head catalog-head">
          <h2 class="card-title">权限目录</h2>
          <span class="catalog-meta">{{ groups.length }} 个分组 · {{ items.length }} 项权限</span>
        </div>
        <ConsoleState v-if="!groups.length" type="empty" title="暂无权限项" message="权限目录为空，请联系管理员初始化数据" />
        <div v-else class="groups-grid">
          <article v-for="group in groups" :key="group.key" class="group-block">
            <header class="group-head">
              <h3 class="group-title">{{ group.label }}</h3>
              <span class="group-count">{{ group.items.length }} 项</span>
            </header>
            <ul class="group-list">
              <li v-for="item in group.items" :key="item.key" class="group-item">
                <code class="perm-key">{{ item.key }}</code>
                <span class="perm-name">{{ item.name }}</span>
                <span class="perm-desc">{{ item.description || '—' }}</span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <!-- 角色 × 权限矩阵 -->
      <section class="card matrix-card">
        <div class="card-head matrix-head">
          <h2 class="card-title">角色 × 权限矩阵</h2>
          <span class="catalog-meta">
            <span class="legend"><span class="legend-mark legend-mark--on">✓</span>已授权</span>
            <span class="legend"><span class="legend-mark legend-mark--off">–</span>未授权</span>
          </span>
        </div>
        <ConsoleState v-if="!roles.length" type="empty" title="暂无角色" message="当前系统中还没有可用角色" />
        <div v-else class="matrix-scroll">
          <table class="matrix">
            <thead>
              <tr>
                <th class="matrix-perm matrix-corner">权限项</th>
                <th v-for="role in roles" :key="role.id" class="matrix-role">
                  <span class="matrix-role-name">{{ role.name }}</span>
                  <span class="matrix-role-count">{{ grantedCount(role) }} 项</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in groups" :key="group.key">
                <tr class="matrix-group-row">
                  <th class="matrix-perm" :colspan="roles.length + 1">{{ group.label }}</th>
                </tr>
                <tr v-for="item in group.items" :key="item.key" class="matrix-item-row">
                  <th class="matrix-perm">
                    <span class="matrix-perm-name">{{ item.name }}</span>
                    <code class="matrix-perm-key">{{ item.key }}</code>
                  </th>
                  <td v-for="role in roles" :key="role.id" class="matrix-cell">
                    <span v-if="roleHas(role, item.key)" class="cell-yes" title="已授权">✓</span>
                    <span v-else class="cell-no" title="未授权">–</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { request } from '../api/client.js'
import { auth } from '../stores/auth.js'
import ConsoleState from '../components/console/ConsoleState.vue'
import { errorText } from '../components/console/useToast.js'

function safeHasPerm(key) {
  if (auth && typeof auth.hasPerm === 'function') return auth.hasPerm(key)
  const perms = auth?.permissions || []
  return perms.includes('*') || perms.includes(key)
}
const canManage = computed(() => safeHasPerm('rbac.manage'))

const roles = ref([])
const groups = ref([])
const items = ref([])
const loading = ref(false)
const error = ref('')

function flattenGroups(permData) {
  if (Array.isArray(permData?.items) && permData.items.length) return permData.items
  if (!Array.isArray(permData?.groups)) return []
  return permData.groups.flatMap((group) => group.items || [])
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [permData, roleData] = await Promise.all([request('/api/permissions'), request('/api/roles')])
    groups.value = Array.isArray(permData?.groups) ? permData.groups : []
    items.value = flattenGroups(permData)
    roles.value = Array.isArray(roleData?.items) ? roleData.items : []
  } catch (err) {
    error.value = errorText(err, '权限数据加载失败')
  } finally {
    loading.value = false
  }
}

function roleHas(role, key) {
  const perms = role.permissions || []
  return perms.includes('*') || perms.includes(key)
}

function grantedCount(role) {
  if ((role.permissions || []).includes('*')) return items.value.length
  return (role.permissions || []).length
}

onMounted(load)
</script>

<style scoped>
.manage-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: center;
  height: 38px;
  padding: 0 15px;
  border: 1px solid #cdddf7;
  border-radius: 8px;
  background: #fff;
  color: #2f6fd6;
  font-size: 14px;
  white-space: nowrap;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}
.manage-link:hover { background: #f2f7ff; border-color: #a9c8f5; }
.manage-link-ico { width: 17px; height: 17px; }

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

.catalog-card { padding: 18px 20px 20px; margin-bottom: 18px; }
.catalog-head { margin-bottom: 16px; }
.catalog-head .card-title,
.matrix-head .card-title { font-size: 18px; }
.catalog-meta { font-size: 12.5px; color: #94a3b8; }

.groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 12px;
}
.group-block {
  padding: 14px 16px 12px;
  border: 1px solid #e8edf4;
  border-radius: 12px;
  background: #fcfdff;
}
.group-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
.group-title { margin: 0; font-size: 14.5px; font-weight: 700; color: #1f2937; }
.group-count { font-size: 12px; color: #94a3b8; }
.group-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.group-item { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 4px 9px; }
.perm-key {
  grid-row: span 2;
  align-self: start;
  padding: 2px 7px;
  border-radius: 5px;
  background: #eef3fc;
  color: #46618c;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 11.5px;
  line-height: 17px;
  white-space: nowrap;
}
.perm-name { font-size: 13.5px; color: #1f2937; }
.perm-desc { grid-column: 2; font-size: 12px; line-height: 18px; color: #94a3b8; }

.matrix-card { padding: 18px 20px 14px; }
.matrix-head { margin-bottom: 14px; }
.legend { display: inline-flex; align-items: center; gap: 5px; margin-left: 14px; }
.legend-mark {
  display: inline-grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 700;
}
.legend-mark--on { background: #e2f7ec; color: #1f9d63; }
.legend-mark--off { background: #eef1f6; color: #94a3b8; }

.matrix-scroll { overflow-x: auto; padding-bottom: 6px; }
.matrix {
  width: 100%;
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.matrix-perm {
  width: 260px;
  text-align: left;
  font-weight: 400;
}
.matrix thead th {
  height: 44px;
  padding: 0 12px;
  background: #f2f6fd;
  color: #334155;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
}
.matrix thead th:first-child { border-radius: 8px 0 0 8px; }
.matrix thead th:last-child { border-radius: 0 8px 8px 0; }
.matrix-role { text-align: center; }
.matrix-role-name { display: block; font-size: 13.5px; color: #1f2937; }
.matrix-role-count { display: block; margin-top: 1px; font-size: 11px; font-weight: 400; color: #94a3b8; }
.matrix-group-row th {
  padding: 14px 12px 6px;
  background: transparent;
  color: #64748b;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.matrix-item-row th,
.matrix-item-row td {
  height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid #f1f4f9;
  background: #fff;
  text-align: left;
}
.matrix-item-row:last-child th,
.matrix-item-row:last-child td { border-bottom: 0; }
.matrix-perm-name { display: block; font-size: 13px; font-weight: 500; color: #1f2937; white-space: nowrap; }
.matrix-perm-key {
  display: block;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  color: #9aa6ba;
  white-space: nowrap;
}
.matrix-cell { text-align: center !important; }
.cell-yes {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #e2f7ec;
  color: #1f9d63;
  font-size: 12px;
  font-weight: 700;
}
.cell-no { color: #c3ccda; font-size: 15px; }

@media (max-width: 860px) {
  .stat-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .stat-card { padding: 13px 14px; }
  .stat-value { font-size: 22px; line-height: 27px; }
  .groups-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .stat-row { grid-template-columns: minmax(0, 1fr); }
  .page-head { flex-wrap: wrap; }
}
</style>
