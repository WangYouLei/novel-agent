import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './styles/theme.css'
import App from './App.vue'
import { router } from './router'
import { initBridge } from './bridge'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 前端 Cordis Context + Bridge（ADR-005：前后端各跑一个 Context，经 WebSocket 桥接）
// MVP 用于：生成进度事件、插件状态事件、远程服务调用演示
const bridge = initBridge()
app.provide('bridge', bridge)

app.mount('#app')

// 登录态变化时同步 Bridge 连接 token
const auth = useAuthStore()
auth.$subscribe(() => bridge.setToken(auth.token))
