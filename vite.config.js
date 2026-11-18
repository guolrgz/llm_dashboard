import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

const BACKEND = process.env.LLM_API_TARGET || 'http://127.0.0.1:8000'

const proxy = {
  // REST API（登录、RBAC、用户、模型、Key、配额、设置、流量、分析、告警）
  '/api': {
    target: BACKEND,
    changeOrigin: true,
  },
  // OpenAI 兼容推理网关
  '/v1': {
    target: BACKEND,
    changeOrigin: true,
  },
  // 后端健康检查（便于开发时经 5173 验证代理是否生效）
  '/health': {
    target: BACKEND,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    proxy,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        users: resolve(__dirname, 'users.html'),
      },
    },
  },
})
