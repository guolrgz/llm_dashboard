<template>
  <main class="content console-page settings-page">
    <div class="page-head">
      <div class="page-heading">
        <h1>系统设置</h1>
        <p>配置默认 Token 配额、限流阈值与告警策略，保存后立即生效</p>
      </div>
      <div class="head-actions">
        <span v-if="!canManage && !loading && !error" class="mode-tip">只读模式</span>
        <button
          class="u-btn u-btn--primary"
          type="button"
          :disabled="!canManage || saving || loading || Boolean(error)"
          @click="saveSettings"
        >
          {{ saving ? '保存中…' : '保存设置' }}
        </button>
      </div>
    </div>

    <ConsoleState
      v-if="!canView"
      type="error"
      title="无权查看系统设置"
      message="当前账号缺少 settings.view 权限，请联系管理员分配。"
    />

    <template v-else>
      <ConsoleState v-if="loading && !loaded" type="loading" title="正在加载系统设置…" />
      <ConsoleState v-else-if="error" type="error" title="系统设置加载失败" :message="error" @retry="load" />

      <div v-else class="settings-grid">
        <section class="card settings-card">
          <div class="card-head settings-head">
            <h2 class="card-title">配额与限流</h2>
            <span class="settings-meta">默认策略 · 对未单独配置的用户生效</span>
          </div>

          <div class="form-grid">
            <label class="field field--full">
              <span class="field-label">站点名称</span>
              <input v-model.trim="form.siteName" type="text" :disabled="!canManage" placeholder="LLM 推理 Token 流量管理系统" />
            </label>
            <label class="field">
              <span class="field-label">默认日配额</span>
              <div class="input-wrap">
                <input v-model="form.defaultDailyQuota" type="number" min="0" step="1000" :disabled="!canManage" />
                <span class="input-suffix">Token</span>
              </div>
            </label>
            <label class="field">
              <span class="field-label">默认月配额</span>
              <div class="input-wrap">
                <input v-model="form.defaultMonthlyQuota" type="number" min="0" step="1000" :disabled="!canManage" />
                <span class="input-suffix">Token</span>
              </div>
            </label>
            <label class="field">
              <span class="field-label">默认 RPM</span>
              <div class="input-wrap">
                <input v-model="form.defaultRpm" type="number" min="0" step="1" :disabled="!canManage" />
                <span class="input-suffix">次/分钟</span>
              </div>
            </label>
            <label class="field">
              <span class="field-label">默认 TPM</span>
              <div class="input-wrap">
                <input v-model="form.defaultTpm" type="number" min="0" step="1" :disabled="!canManage" />
                <span class="input-suffix">Token/分钟</span>
              </div>
            </label>
            <label class="field field--full">
              <span class="field-label">告警阈值</span>
              <div class="input-wrap">
                <input v-model="form.alertThreshold" type="number" min="0" max="100" step="1" :disabled="!canManage" />
                <span class="input-suffix">%（配额使用率达到该比例时触发告警）</span>
              </div>
            </label>
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>
          <p v-if="!canManage" class="form-hint">
            当前账号没有 settings.manage 权限，仅可查看配置，无法保存修改。
          </p>
          <p v-else class="form-hint">
            修改默认配额与限流阈值后，新的配额策略会立即应用到后续请求。
          </p>

          <div class="settings-foot">
            <button class="u-btn u-btn--ghost" type="button" :disabled="loading || saving" @click="load">还原</button>
            <button class="u-btn u-btn--primary" type="button" :disabled="!canManage || saving" @click="saveSettings">
              {{ saving ? '保存中…' : '保存设置' }}
            </button>
          </div>
        </section>

        <aside class="settings-side">
          <section class="card runtime-card">
            <div class="card-head runtime-head">
              <h2 class="card-title">系统运行</h2>
            </div>
            <dl class="runtime-list">
              <div class="runtime-item">
                <dt>运行时长</dt>
                <dd><strong>{{ formatDays(data.uptimeDays) }}</strong></dd>
              </div>
              <div class="runtime-item">
                <dt>启动时间</dt>
                <dd>{{ data.systemStartedAt || '—' }}</dd>
              </div>
              <div class="runtime-item">
                <dt>当前站点</dt>
                <dd>{{ data.siteName || '—' }}</dd>
              </div>
            </dl>
          </section>

          <button class="card entry-card" type="button" @click="goModels">
            <span class="entry-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4.5 7.5 12 4l7.5 3.5v9L12 20l-7.5-3.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
                <path d="M4.7 7.6 12 11l7.3-3.4M12 11v8.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="entry-text">
              <strong>模型管理</strong>
              <span>管理上游模型渠道、权重与单价</span>
            </span>
            <svg class="entry-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9.5 5.5 6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </aside>
      </div>
    </template>

    <ToastHost :toasts="toasts" />
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '../api/client.js'
import { auth } from '../stores/auth.js'
import ConsoleState from '../components/console/ConsoleState.vue'
import ToastHost from '../components/console/ToastHost.vue'
import { useToast, errorText } from '../components/console/useToast.js'

const router = useRouter()
const toast = useToast()
const { toasts } = toast

function safeHasPerm(key) {
  if (auth && typeof auth.hasPerm === 'function') return auth.hasPerm(key)
  const perms = auth?.permissions || []
  return perms.includes('*') || perms.includes(key)
}
const canView = computed(() => safeHasPerm('settings.view'))
const canManage = computed(() => safeHasPerm('settings.manage'))

const data = reactive({
  siteName: '',
  defaultDailyQuota: 0,
  defaultMonthlyQuota: 0,
  defaultRpm: 0,
  defaultTpm: 0,
  alertThreshold: 0,
  systemStartedAt: '',
  uptimeDays: 0,
})

const form = reactive({
  siteName: '',
  defaultDailyQuota: 0,
  defaultMonthlyQuota: 0,
  defaultRpm: 0,
  defaultTpm: 0,
  alertThreshold: 0,
})

const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const saving = ref(false)
const formError = ref('')

function formatDays(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `${num} 天`
}

/** 后端 alertThreshold 为 0–1 的比例（如 0.8），前端按百分比展示 */
function thresholdToPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  const percent = num <= 1 ? num * 100 : num
  return Math.round(percent * 100) / 100
}

function percentToThreshold(value) {
  return Number(value) / 100
}

function syncForm() {
  Object.assign(form, {
    siteName: data.siteName || '',
    defaultDailyQuota: data.defaultDailyQuota ?? 0,
    defaultMonthlyQuota: data.defaultMonthlyQuota ?? 0,
    defaultRpm: data.defaultRpm ?? 0,
    defaultTpm: data.defaultTpm ?? 0,
    alertThreshold: thresholdToPercent(data.alertThreshold),
  })
}

async function load() {
  if (!canView.value) return
  loading.value = true
  error.value = ''
  formError.value = ''
  try {
    const payload = await request('/api/settings')
    Object.assign(data, {
      siteName: payload?.siteName || '',
      defaultDailyQuota: Number(payload?.defaultDailyQuota || 0),
      defaultMonthlyQuota: Number(payload?.defaultMonthlyQuota || 0),
      defaultRpm: Number(payload?.defaultRpm || 0),
      defaultTpm: Number(payload?.defaultTpm || 0),
      alertThreshold: Number(payload?.alertThreshold || 0),
      systemStartedAt: payload?.systemStartedAt || '',
      uptimeDays: Number(payload?.uptimeDays || 0),
    })
    syncForm()
    loaded.value = true
  } catch (err) {
    error.value = errorText(err, '系统设置加载失败')
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

function validate() {
  const numericFields = [
    ['默认日配额', form.defaultDailyQuota],
    ['默认月配额', form.defaultMonthlyQuota],
    ['默认 RPM', form.defaultRpm],
    ['默认 TPM', form.defaultTpm],
  ]
  for (const [label, value] of numericFields) {
    if (value === '' || value === null || !Number.isFinite(Number(value)) || Number(value) < 0) {
      return `${label}必须为非负数字`
    }
  }
  const threshold = Number(form.alertThreshold)
  if (form.alertThreshold === '' || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    return '告警阈值必须为 0–100 之间的数字'
  }
  if (Number(form.defaultMonthlyQuota) < Number(form.defaultDailyQuota)) {
    return '默认月配额不能小于默认日配额'
  }
  return ''
}

async function saveSettings() {
  if (!canManage.value || saving.value) return
  const message = validate()
  if (message) {
    formError.value = message
    toast.error(message)
    return
  }
  saving.value = true
  formError.value = ''
  try {
    const payload = await request('/api/settings', {
      method: 'PUT',
      body: {
        siteName: form.siteName,
        defaultDailyQuota: Number(form.defaultDailyQuota),
        defaultMonthlyQuota: Number(form.defaultMonthlyQuota),
        defaultRpm: Number(form.defaultRpm),
        defaultTpm: Number(form.defaultTpm),
        alertThreshold: percentToThreshold(form.alertThreshold),
      },
    })
    Object.assign(data, {
      siteName: payload?.siteName ?? form.siteName,
      defaultDailyQuota: payload?.defaultDailyQuota ?? Number(form.defaultDailyQuota),
      defaultMonthlyQuota: payload?.defaultMonthlyQuota ?? Number(form.defaultMonthlyQuota),
      defaultRpm: payload?.defaultRpm ?? Number(form.defaultRpm),
      defaultTpm: payload?.defaultTpm ?? Number(form.defaultTpm),
      alertThreshold: payload?.alertThreshold ?? percentToThreshold(form.alertThreshold),
      systemStartedAt: payload?.systemStartedAt ?? data.systemStartedAt,
      uptimeDays: payload?.uptimeDays ?? data.uptimeDays,
    })
    syncForm()
    toast.success('系统设置已保存')
  } catch (err) {
    const text = errorText(err, '系统设置保存失败')
    formError.value = text
    toast.error(text)
  } finally {
    saving.value = false
  }
}

function goModels() {
  router.push('/models')
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; align-items: center; gap: 10px; align-self: center; }
.mode-tip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border: 1px solid #e2e8f2;
  border-radius: 15px;
  background: #fff;
  color: #64748b;
  font-size: 12.5px;
  white-space: nowrap;
}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;
  align-items: start;
}
.settings-card { padding: 18px 22px 18px; }
.settings-head { margin-bottom: 16px; }
.settings-head .card-title { font-size: 18px; }
.settings-meta { font-size: 12.5px; color: #94a3b8; }

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px 18px;
}
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field--full { grid-column: 1 / -1; }
.field-label { font-size: 13px; color: #52627a; }
.field input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 13.5px;
  color: #1f2937;
  outline: none;
}
.field input:focus { border-color: #9cc3f7; box-shadow: 0 0 0 3px rgba(31, 121, 238, 0.09); }
.field input:disabled { background: #f7f9fc; color: #7c8698; cursor: not-allowed; }
.input-wrap { position: relative; display: flex; align-items: center; }
.input-wrap input { padding-right: 96px; }
.input-suffix {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: #9aa6ba;
  white-space: nowrap;
  pointer-events: none;
}
.form-error { margin: 12px 0 0; color: #e05353; font-size: 13px; }
.form-hint { margin: 12px 0 0; color: #94a3b8; font-size: 12.5px; line-height: 19px; }
.settings-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #f0f3f8;
}

.settings-side { display: flex; flex-direction: column; gap: 14px; }
.runtime-card { padding: 16px 18px 14px; }
.runtime-head { margin-bottom: 12px; }
.runtime-head .card-title { font-size: 16.5px; }
.runtime-list { display: flex; flex-direction: column; gap: 0; margin: 0; }
.runtime-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid #f2f5fa;
  font-size: 13.5px;
}
.runtime-item:first-child { border-top: 0; padding-top: 0; }
.runtime-item dt { color: #94a3b8; flex: none; }
.runtime-item dd { margin: 0; color: #1f2937; text-align: right; word-break: break-all; }
.runtime-item dd strong { font-size: 17px; color: #0f172a; }

.entry-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px 18px;
  border: 1px solid #eef1f6;
  border-radius: 12px;
  background: #fff;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
.entry-card:hover {
  border-color: #b9d2f8;
  box-shadow: 0 6px 20px rgba(63, 124, 245, 0.12);
  transform: translateY(-1px);
}
.entry-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #eaf2fe;
  color: #2f6bf1;
}
.entry-icon svg { width: 22px; height: 22px; }
.entry-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.entry-text strong { font-size: 14.5px; color: #0f172a; }
.entry-text span { font-size: 12.5px; line-height: 18px; color: #94a3b8; }
.entry-arrow { flex: none; width: 18px; height: 18px; color: #9aa6ba; }

@media (max-width: 1100px) {
  .settings-grid { grid-template-columns: minmax(0, 1fr); }
  .settings-side { flex-direction: row; flex-wrap: wrap; }
  .settings-side > * { flex: 1 1 280px; }
}
@media (max-width: 720px) {
  .settings-card { padding: 16px 14px; }
  .form-grid { grid-template-columns: minmax(0, 1fr); }
  .settings-side { flex-direction: column; }
  .head-actions { width: 100%; justify-content: flex-end; }
}
</style>
