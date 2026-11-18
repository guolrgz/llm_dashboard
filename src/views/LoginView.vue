<template>
  <div class="login-page">
    <!-- 左侧品牌区（沿用深色侧栏 #19223a 视觉） -->
    <aside class="login-brand" aria-hidden="true">
      <div class="login-brand-glow login-brand-glow--a"></div>
      <div class="login-brand-glow login-brand-glow--b"></div>

      <div class="login-brand-inner">
        <div class="login-brand-head">
          <span class="login-logo">
            <svg viewBox="0 0 55 59" aria-hidden="true"><use href="#i-logo" /></svg>
          </span>
          <span class="login-brand-text">
            <strong>LLM推理</strong>
            <span>Token 流量管理系统</span>
          </span>
        </div>

        <div class="login-brand-copy">
          <h2>统一治理<br />LLM Token 流量</h2>
          <p>登录后即可查看实时请求量、Token 使用量与成功率，管理用户、角色权限、模型渠道与配额限流策略。</p>
        </div>

        <ul class="login-brand-points">
          <li>
            <span class="login-point-ico">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V9m5 9V5m5 13v-7m5 7V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            </span>
            <span><b>实时计量</b>请求 / Token / 成功率多维度聚合</span>
          </li>
          <li>
            <span class="login-point-ico">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 19 6v5.4c0 4.2-2.8 7.6-7 9.4-4.2-1.8-7-5.2-7-9.4V6l7-2.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="m8.8 12 2.2 2.2 4.2-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
            <span><b>权限可控</b>RBAC 角色权限与 API Key 管理</span>
          </li>
          <li>
            <span class="login-point-ico">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
            <span><b>配额限流</b>RPM / TPM 与日 / 月额度防护</span>
          </li>
        </ul>

        <p class="login-brand-foot">LLM Inference · Token Traffic Management</p>
      </div>
    </aside>

    <!-- 右侧登录表单 -->
    <section class="login-main">
      <div class="login-card">
        <div class="login-card-head">
          <span class="login-mobile-logo">
            <svg viewBox="0 0 55 59" aria-hidden="true"><use href="#i-logo" /></svg>
          </span>
          <h1>欢迎登录</h1>
          <p>请输入账号密码以进入管理控制台</p>
        </div>

        <form class="login-form" novalidate @submit.prevent="onSubmit">
          <label class="login-field" :class="{ 'has-error': fieldError === 'username' }">
            <span class="login-field-label">用户名</span>
            <span class="login-input-wrap">
              <svg class="login-input-ico" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8.2" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" />
                <path d="M4.8 20c.6-3.6 3.4-5.7 7.2-5.7s6.6 2.1 7.2 5.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              <input
                ref="usernameEl"
                v-model.trim="username"
                type="text"
                name="username"
                autocomplete="username"
                placeholder="请输入用户名"
                :disabled="submitting"
                @input="fieldError = ''"
              />
            </span>
          </label>

          <label class="login-field" :class="{ 'has-error': fieldError === 'password' }">
            <span class="login-field-label">密码</span>
            <span class="login-input-wrap">
              <svg class="login-input-ico" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4.8" y="10.2" width="14.4" height="9.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8" />
                <path d="M8.4 10V7.8a3.6 3.6 0 0 1 7.2 0V10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              <input
                ref="passwordEl"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                placeholder="请输入密码"
                :disabled="submitting"
                @input="fieldError = ''"
              />
              <button
                class="login-eye"
                type="button"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                tabindex="-1"
                @click="showPassword = !showPassword"
              >
                <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.8 12S6 6.4 12 6.4 21.2 12 21.2 12 18 17.6 12 17.6 2.8 12 2.8 12Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                  <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.7" />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.8 12S6 6.4 12 6.4 21.2 12 21.2 12 18 17.6 12 17.6 2.8 12 2.8 12Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                  <path d="m4.5 4.5 15 15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                </svg>
              </button>
            </span>
          </label>

          <p v-if="errorMessage" class="login-alert" role="alert">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.7" />
              <path d="M10 5.8v4.9M10 13.7v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <span>{{ errorMessage }}</span>
          </p>

          <button class="login-submit" type="submit" :disabled="submitting">
            <span v-if="submitting" class="login-spinner" aria-hidden="true"></span>
            <span>{{ submitting ? '登录中…' : '登 录' }}</span>
          </button>
        </form>

        <div class="login-demo">
          <span class="login-demo-label">演示账号</span>
          <code>admin</code>
          <span class="login-demo-sep">/</span>
          <code>admin123</code>
          <button type="button" class="login-demo-fill" :disabled="submitting" @click="fillDemo">一键填入</button>
        </div>

        <p class="login-foot">© 2026 LLM推理 · Token 流量管理系统</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '../stores/auth.js'

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const fieldError = ref('')
const errorMessage = ref('')
const usernameEl = ref(null)
const passwordEl = ref(null)

const submitting = computed(() => auth.loading)

/** 只允许站内相对路径，避免开放重定向 */
function safeRedirect(value) {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return '/'
  return value
}

function fillDemo() {
  username.value = 'admin'
  password.value = 'admin123'
  errorMessage.value = ''
  fieldError.value = ''
}

async function onSubmit() {
  if (submitting.value) return
  errorMessage.value = ''
  fieldError.value = ''

  if (!username.value) {
    fieldError.value = 'username'
    errorMessage.value = '请输入用户名'
    usernameEl.value?.focus()
    return
  }
  if (!password.value) {
    fieldError.value = 'password'
    errorMessage.value = '请输入密码'
    passwordEl.value?.focus()
    return
  }

  try {
    await auth.login(username.value, password.value)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (err) {
    if (err?.status === 401) errorMessage.value = '用户名或密码错误，请重新输入'
    else if (err?.status === 403) errorMessage.value = '账号已被停用，请联系管理员'
    else if (err?.status === 429) errorMessage.value = '尝试次数过多，请稍后再试'
    else errorMessage.value = err?.message || '登录失败，请稍后重试'
    password.value = ''
    passwordEl.value?.focus()
  }
}

onMounted(() => {
  usernameEl.value?.focus()
})
</script>
