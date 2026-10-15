<template>
  <div class="login-page">
    <div class="login-wrap">
      <div class="login-brand">
        <div class="brand-mark">✒</div>
        <h1 class="brand-name serif">NovelAgent</h1>
        <p class="brand-slogan">可插拔的 AI 小说创作平台</p>
        <div class="brand-divider"><span></span><em>❦</em><span></span></div>
        <p class="brand-quote">「故事，从一句话开始。」</p>
      </div>

      <el-card class="login-card">
        <div class="card-title serif">{{ mode === 'login' ? '欢迎回来' : '开启创作之旅' }}</div>
        <div class="card-sub">
          {{ mode === 'login' ? '登录以继续你的作品' : `注册即赠 ${bonus} 积分` }}
        </div>

        <el-form :model="form" label-position="top" @submit.prevent>
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="2-32 个字符" size="large" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="至少 6 位"
              show-password
              size="large"
              @keyup.enter="mode === 'login' ? login() : register()"
            />
          </el-form-item>
          <el-button
            v-if="mode === 'login'"
            type="primary"
            class="submit"
            size="large"
            :loading="loading"
            @click="login"
          >
            登 录
          </el-button>
          <el-button v-else type="primary" class="submit" size="large" :loading="loading" @click="register">
            注册并开始创作
          </el-button>
          <div class="switch-line">
            <el-button text @click="toggleMode">
              {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
            </el-button>
          </div>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { post } from '@/api/http'
import type { AuthResponse } from '@novelagent/shared'
import { CREDIT_POLICY } from '@novelagent/shared'
import { useAuthStore } from '@/stores/auth'
import type { Bridge } from '@/bridge'

const router = useRouter()
const auth = useAuthStore()
const bridge = inject<Bridge>('bridge')
const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const bonus = CREDIT_POLICY.REGISTER_BONUS
const form = reactive({ username: '', password: '' })

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
}

async function login() {
  loading.value = true
  try {
    const data = await post<AuthResponse>('/api/auth/login', form)
    auth.setAuth(data)
    bridge?.setToken(data.token)
    ElMessage.success(`欢迎回来，${data.user.username}`)
    router.push('/novels')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function register() {
  loading.value = true
  try {
    const data = await post<AuthResponse>('/api/auth/register', form)
    auth.setAuth(data)
    bridge?.setToken(data.token)
    ElMessage.success('注册成功')
    router.push('/novels')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}
.login-wrap {
  display: flex;
  align-items: stretch;
  gap: 0;
  max-width: 880px;
  width: 100%;
  border-radius: 20px;
  overflow: hidden;
  border: 3px solid #111111;
  box-shadow: var(--nb-shadow-lg);
}

/* 左侧品牌区：柠檬黄大色块 + 半调圆点纹理 */
.login-brand {
  flex: 1;
  background:
    radial-gradient(rgba(17, 17, 17, 0.12) 1.5px, transparent 1.5px);
  background-size: 16px 16px;
  background-color: var(--accent);
  color: #111111;
  padding: 56px 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  border-right: var(--nb-border);
}
.brand-mark {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #111111;
  background: #ffffff;
  border: var(--nb-border);
  border-radius: 14px;
  box-shadow: 4px 4px 0 #111111;
  transform: rotate(-6deg);
  margin-bottom: 20px;
}
.brand-name {
  margin: 0;
  font-size: 38px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #111111;
}
.brand-slogan {
  margin: 10px 0 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.28em;
  color: rgba(17, 17, 17, 0.72);
}
.brand-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 28px 0;
  width: 100%;
}
.brand-divider span {
  flex: 1;
  height: 4px;
  background: #111111;
  border-radius: 2px;
}
.brand-divider em {
  color: #111111;
  font-style: normal;
  font-size: 16px;
}
.brand-quote {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #111111;
  letter-spacing: 0.06em;
  background: #ffffff;
  border: var(--nb-border);
  border-radius: 10px;
  box-shadow: 3px 3px 0 #111111;
  padding: 10px 16px;
  transform: rotate(1.2deg);
}

/* 右侧表单卡片 */
.login-card {
  width: 380px;
  border: none;
  border-radius: 0;
  background: #ffffff;
  box-shadow: none;
}
.login-card :deep(.el-card__body) {
  padding: 44px 38px;
}
.card-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink-strong);
}
.card-sub {
  font-size: 13px;
  color: var(--ink-secondary);
  margin: 6px 0 26px;
}
.submit {
  width: 100%;
  letter-spacing: 0.3em;
  font-weight: 600;
}
.switch-line {
  text-align: center;
  margin-top: 4px;
}

@media (max-width: 720px) {
  .login-brand {
    display: none;
  }
  .login-card {
    width: 100%;
  }
}
</style>
