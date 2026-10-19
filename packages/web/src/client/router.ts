import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** 路由：hash 模式（单机版静态托管无需服务端路由配合） */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('./pages/Login.vue'), meta: { public: true } },
    { path: '/', redirect: '/novels' },
    // AI 对话已并入小说编辑页，旧链接跳转到小说管理
    { path: '/chat', redirect: '/novels' },
    // 大纲生成已并入小说管理页，旧链接跳转到小说管理
    { path: '/outline', redirect: '/novels' },
    { path: '/novels', component: () => import('./pages/Novels.vue') },
    { path: '/novels/:id', component: () => import('./pages/NovelEditor.vue') },
    { path: '/styles', component: () => import('./pages/StylePacks.vue') },
    { path: '/plugins', component: () => import('./pages/Plugins.vue') },
    { path: '/market', component: () => import('./pages/Market.vue') },
    { path: '/models', component: () => import('./pages/ModelSettings.vue') },
  ],
})

// 登录守卫：未登录一律回登录页（MVP 单机版仅一个本地账号体系）
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) return { path: '/login' }
  if (to.path === '/login' && auth.isLoggedIn) return { path: '/novels' }
})
