<template>
  <main class="content console-page models-page">
    <div class="page-head">
      <div class="page-heading">
        <h1>模型管理</h1>
        <p>管理接入的上游模型渠道、流量权重与计费单价</p>
      </div>
      <div class="head-actions">
        <RouterLink class="ghost-link" to="/settings">
          <svg class="ghost-link-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5.5 8.5 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          返回系统设置
        </RouterLink>
        <button v-if="canManage" class="u-btn u-btn--primary u-btn--icon" type="button" @click="openCreate">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-plus" /></svg>新增模型
        </button>
      </div>
    </div>

    <ConsoleState
      v-if="!canView"
      type="error"
      title="无权查看模型渠道"
      message="当前账号缺少 models.view 权限，请联系管理员分配。"
    />

    <section v-else class="card models-card">
      <div class="card-head models-head">
        <h2 class="card-title">模型渠道</h2>
        <div class="head-meta">
          <span class="meta-text">已启用 <strong>{{ enabledCount }}</strong> / 共 <strong>{{ models.length }}</strong> 个</span>
          <button class="ghost-btn" type="button" :disabled="loading" @click="load">
            <svg class="ghost-btn-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            刷新
          </button>
        </div>
      </div>

      <ConsoleState v-if="loading && !models.length" type="loading" title="正在加载模型渠道…" />
      <ConsoleState v-else-if="error" type="error" title="模型渠道加载失败" :message="error" @retry="load" />
      <ConsoleState
        v-else-if="!models.length"
        type="empty"
        title="暂无模型渠道"
        message="还没有接入任何模型，点击「新增模型」开始配置"
      />
      <div v-else class="models-table-wrap">
        <table class="models-table">
          <colgroup>
            <col style="width: 220px" />
            <col style="width: 130px" />
            <col style="width: 170px" />
            <col style="width: 92px" />
            <col style="width: 100px" />
            <col style="width: 190px" />
            <col style="width: 190px" />
          </colgroup>
          <thead>
            <tr>
              <th>模型名称</th>
              <th>供应商</th>
              <th>单价（输入 / 输出）</th>
              <th>权重</th>
              <th>状态</th>
              <th>上游配置</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="model in models" :key="model.id">
              <td>
                <span class="cell-main">{{ model.displayName || model.name }}</span>
                <span class="cell-sub">{{ model.name }}</span>
              </td>
              <td>{{ model.provider || '—' }}</td>
              <td>
                <span class="cell-main">${{ formatPrice(model.inputPrice) }} / ${{ formatPrice(model.outputPrice) }}</span>
                <span class="cell-sub">每 1K Token</span>
              </td>
              <td>{{ model.weight ?? '—' }}</td>
              <td>
                <StatusPill
                  :label="model.status === 'enabled' ? '已启用' : '已停用'"
                  :tone="model.status === 'enabled' ? 'green' : 'gray'"
                />
              </td>
              <td>
                <template v-if="model.hasUpstreamKey">
                  <span class="cell-main cell-main--ok">已配置</span>
                  <span class="cell-sub">{{ model.upstreamKeyMasked || '••••••' }}</span>
                </template>
                <template v-else>
                  <span class="cell-main cell-main--muted">未配置</span>
                  <span class="cell-sub">{{ model.upstreamBaseUrl || '默认模拟上游' }}</span>
                </template>
              </td>
              <td>
                <div v-if="canManage" class="row-actions">
                  <button class="link-btn" type="button" @click="openEdit(model)">编辑</button>
                  <button class="link-btn" type="button" @click="toggleStatus(model)">
                    {{ model.status === 'enabled' ? '停用' : '启用' }}
                  </button>
                  <button class="link-btn link-btn--danger" type="button" @click="askDelete(model)">删除</button>
                </div>
                <span v-else class="cell-main cell-main--muted">只读</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 新增 / 编辑模型 -->
    <ConsoleModal
      :open="dialog.open"
      :title="dialog.mode === 'create' ? '新增模型' : '编辑模型'"
      :width="'640px'"
      :confirm-text="dialog.mode === 'create' ? '创建' : '保存'"
      :confirm-disabled="saving"
      :confirm-loading="saving"
      @close="closeDialog"
      @confirm="saveModel"
    >
      <div class="form-grid">
        <label class="field">
          <span class="field-label">模型名称 <em>*</em></span>
          <input v-model.trim="form.name" type="text" placeholder="如 GPT-4o" />
        </label>
        <label class="field">
          <span class="field-label">显示名称</span>
          <input v-model.trim="form.displayName" type="text" placeholder="留空则与模型名称一致" />
        </label>
        <label class="field">
          <span class="field-label">供应商 <em>*</em></span>
          <input v-model.trim="form.provider" type="text" placeholder="如 OpenAI / Anthropic" />
        </label>
        <label class="field">
          <span class="field-label">状态</span>
          <select v-model="form.status">
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">输入单价（$/1K）</span>
          <input v-model="form.inputPrice" type="number" min="0" step="0.0001" />
        </label>
        <label class="field">
          <span class="field-label">输出单价（$/1K）</span>
          <input v-model="form.outputPrice" type="number" min="0" step="0.0001" />
        </label>
        <label class="field">
          <span class="field-label">流量权重</span>
          <input v-model="form.weight" type="number" min="0" step="1" />
        </label>
        <label class="field">
          <span class="field-label">上游地址</span>
          <input v-model.trim="form.upstreamBaseUrl" type="text" placeholder="留空使用模拟上游" />
        </label>
        <label class="field field--full">
          <span class="field-label">上游密钥</span>
          <input
            v-model="form.upstreamApiKey"
            type="password"
            autocomplete="new-password"
            :placeholder="dialog.mode === 'edit' ? '留空表示不修改已配置的密钥' : '可留空，后续再配置'"
          />
        </label>
        <label class="field field--full">
          <span class="field-label">描述</span>
          <textarea v-model.trim="form.description" rows="2" placeholder="模型用途或备注"></textarea>
        </label>
      </div>
      <p v-if="formError" class="form-error">{{ formError }}</p>
    </ConsoleModal>

    <!-- 删除确认 -->
    <ConsoleModal
      :open="confirm.open"
      title="删除模型渠道"
      :width="'440px'"
      confirm-text="确认删除"
      :confirm-disabled="confirm.running"
      :confirm-loading="confirm.running"
      @close="closeConfirm"
      @confirm="doDelete"
    >
      <p class="confirm-text">
        确定删除模型「{{ confirm.model && (confirm.model.displayName || confirm.model.name) }}」吗？
        历史流量统计会保留，但该模型将不再参与推理路由。
      </p>
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
import StatusPill from '../components/console/StatusPill.vue'
import ToastHost from '../components/console/ToastHost.vue'
import { useToast, errorText } from '../components/console/useToast.js'

const toast = useToast()
const { toasts } = toast

function safeHasPerm(key) {
  if (auth && typeof auth.hasPerm === 'function') return auth.hasPerm(key)
  const perms = auth?.permissions || []
  return perms.includes('*') || perms.includes(key)
}
const canView = computed(() => safeHasPerm('models.view'))
const canManage = computed(() => safeHasPerm('models.manage'))

const models = ref([])
const loading = ref(false)
const error = ref('')
const enabledCount = computed(() => models.value.filter((model) => model.status === 'enabled').length)

const priceFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

function formatPrice(value) {
  const num = Number(value)
  return Number.isFinite(num) ? priceFormatter.format(num) : '0.0000'
}

async function load() {
  if (!canView.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await request('/api/models')
    models.value = Array.isArray(data?.items) ? data.items : []
  } catch (err) {
    error.value = errorText(err, '模型渠道加载失败')
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

/* ---------------- 新增 / 编辑 ---------------- */
const dialog = reactive({ open: false, mode: 'create', target: null })
const form = reactive({
  name: '',
  displayName: '',
  provider: '',
  upstreamBaseUrl: '',
  upstreamApiKey: '',
  inputPrice: 0,
  outputPrice: 0,
  weight: 0,
  status: 'enabled',
  description: '',
})
const formError = ref('')
const saving = ref(false)

function resetForm() {
  Object.assign(form, {
    name: '',
    displayName: '',
    provider: '',
    upstreamBaseUrl: '',
    upstreamApiKey: '',
    inputPrice: 0,
    outputPrice: 0,
    weight: 0,
    status: 'enabled',
    description: '',
  })
  formError.value = ''
}

function openCreate() {
  if (!canManage.value) return
  resetForm()
  dialog.mode = 'create'
  dialog.target = null
  dialog.open = true
}

function openEdit(model) {
  if (!canManage.value) return
  formError.value = ''
  dialog.mode = 'edit'
  dialog.target = model.id
  dialog.open = true
  Object.assign(form, {
    name: model.name || '',
    displayName: model.displayName || '',
    provider: model.provider || '',
    upstreamBaseUrl: model.upstreamBaseUrl || '',
    upstreamApiKey: '',
    inputPrice: model.inputPrice ?? 0,
    outputPrice: model.outputPrice ?? 0,
    weight: model.weight ?? 0,
    status: model.status === 'disabled' ? 'disabled' : 'enabled',
    description: model.description || '',
  })
}

function closeDialog() {
  if (saving.value) return
  dialog.open = false
}

function validate() {
  if (!form.name) return '请输入模型名称'
  if (!form.provider) return '请输入供应商'
  const prices = [['输入单价', form.inputPrice], ['输出单价', form.outputPrice]]
  for (const [label, value] of prices) {
    if (value === '' || value === null) return `请填写${label}`
    if (Number(value) < 0 || !Number.isFinite(Number(value))) return `${label}必须为非负数字`
  }
  if (form.weight === '' || !Number.isInteger(Number(form.weight)) || Number(form.weight) < 0) {
    return '流量权重必须为非负整数'
  }
  return ''
}

function buildPayload() {
  const payload = {
    name: form.name,
    provider: form.provider,
    inputPrice: Number(form.inputPrice),
    outputPrice: Number(form.outputPrice),
    weight: Number(form.weight),
    status: form.status,
  }
  if (form.displayName) payload.displayName = form.displayName
  if (form.upstreamBaseUrl) payload.upstreamBaseUrl = form.upstreamBaseUrl
  if (form.upstreamApiKey) payload.upstreamApiKey = form.upstreamApiKey
  if (form.description) payload.description = form.description
  return payload
}

async function saveModel() {
  if (saving.value) return
  const message = validate()
  if (message) {
    formError.value = message
    return
  }
  saving.value = true
  formError.value = ''
  try {
    if (dialog.mode === 'create') {
      await request('/api/models', { method: 'POST', body: buildPayload() })
      toast.success('模型创建成功')
    } else {
      await request(`/api/models/${dialog.target}`, { method: 'PUT', body: buildPayload() })
      toast.success('模型保存成功')
    }
    dialog.open = false
    await load()
  } catch (err) {
    const text = err?.status === 409 ? '模型名称已存在，请更换后重试' : errorText(err, '模型保存失败')
    formError.value = text
    toast.error(text)
  } finally {
    saving.value = false
  }
}

/* ---------------- 启停 / 删除 ---------------- */
async function toggleStatus(model) {
  if (!canManage.value) return
  const nextStatus = model.status === 'enabled' ? 'disabled' : 'enabled'
  try {
    await request(`/api/models/${model.id}/status`, { method: 'POST', body: { status: nextStatus } })
    toast.success(`${nextStatus === 'enabled' ? '启用' : '停用'}成功`)
    await load()
  } catch (err) {
    toast.error(errorText(err, '状态更新失败'))
  }
}

const confirm = reactive({ open: false, model: null, running: false })

function askDelete(model) {
  if (!canManage.value) return
  confirm.model = model
  confirm.open = true
  confirm.running = false
}

function closeConfirm() {
  if (confirm.running) return
  confirm.open = false
  confirm.model = null
}

async function doDelete() {
  if (!confirm.model || confirm.running) return
  confirm.running = true
  try {
    await request(`/api/models/${confirm.model.id}`, { method: 'DELETE' })
    toast.success('模型已删除')
    confirm.open = false
    confirm.model = null
    await load()
  } catch (err) {
    toast.error(errorText(err, '删除失败'))
  } finally {
    confirm.running = false
  }
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; align-items: center; gap: 10px; align-self: center; flex-wrap: wrap; }
.ghost-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid #d5dae4;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  white-space: nowrap;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}
.ghost-link:hover { border-color: #b9c8dd; background: #f8fafd; }
.ghost-link-ico { width: 16px; height: 16px; }

.models-card { padding: 18px 20px 14px; }
.models-head { margin-bottom: 14px; }
.models-head .card-title { font-size: 18px; }
.head-meta { display: flex; align-items: center; gap: 14px; }
.meta-text { font-size: 13px; color: #64748b; }
.meta-text strong { color: #1f2937; font-weight: 600; }
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

.models-table-wrap { overflow-x: auto; }
.models-table {
  width: 100%;
  min-width: 1000px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.models-table thead th {
  height: 42px;
  padding: 0 12px;
  background: #f2f6fd;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}
.models-table thead th:first-child { border-radius: 8px 0 0 8px; }
.models-table thead th:last-child { border-radius: 0 8px 8px 0; }
.models-table tbody td {
  height: 60px;
  padding: 0 12px;
  border-bottom: 1px solid #f1f4f9;
  font-size: 13.5px;
  color: #1f2937;
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.models-table tbody tr:last-child td { border-bottom: 0; }
.models-table tbody tr:hover td { background: #fafcff; }
.cell-main { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cell-sub {
  display: block;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 17px;
  color: #9aa6ba;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cell-main--ok { color: #1f9d63; font-weight: 500; }
.cell-main--muted { color: #94a3b8; }
.row-actions { display: flex; align-items: center; gap: 12px; }
.link-btn {
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 13.5px;
  color: #2f6fd6;
  white-space: nowrap;
  cursor: pointer;
}
.link-btn:hover { text-decoration: underline; }
.link-btn--danger { color: #d4556b; }

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px 16px;
  padding: 4px 0 6px;
}
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field--full { grid-column: 1 / -1; }
.field-label { font-size: 13px; color: #52627a; }
.field-label em { color: #e05353; font-style: normal; }
.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 0 11px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 13.5px;
  color: #1f2937;
  outline: none;
}
.field input,
.field select { height: 37px; }
.field textarea { padding: 9px 11px; line-height: 20px; resize: vertical; min-height: 58px; }
.field input:focus,
.field select:focus,
.field textarea:focus { border-color: #9cc3f7; box-shadow: 0 0 0 3px rgba(31, 121, 238, 0.09); }
.form-error { margin: 6px 0 0; color: #e05353; font-size: 13px; }
.confirm-text { margin: 2px 0 8px; font-size: 14px; line-height: 23px; color: #334155; }

@media (max-width: 900px) {
  .models-card { padding: 16px 14px 10px; }
  .form-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
