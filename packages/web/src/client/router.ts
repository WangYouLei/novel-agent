import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** 路由：hash 模式（单机版静态托管无需服务端路由配合） */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('./pages/Login.vue'), meta: { public: true } },
    { path: '/', redirect: '/chat' },
    { path: '/chat', component: () => import('./pages/Chat.vue') },
    { path: '/novels', component: () => import('./pages/Novels.vue') },
    { path: '/styles', component: () => import('./pages/StylePacks.vue') },
    { path: '/outline', component: () => import('./pages/OutlineGenerator.vue') },
    { path: '/plugins', component: () => import('./pages/Plugins.vue') },
    { path: '/models', component: () => import('./pages/ModelSettings.vue') },
  ],
})

// 登录守卫：未登录一律回登录页（MVP 单机版仅一个本地账号体系）
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) return { path: '/login' }
  if (to.path === '/login' && auth.isLoggedIn) return { path: '/novels' }
})
