import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import router from './router/index.js'

const app = createApp(App)
app.use(router)

/* 等首次导航（登录守卫）完成后再挂载，避免登录页闪出侧栏/顶栏 */
router.isReady().then(() => {
  app.mount('#app')
})
