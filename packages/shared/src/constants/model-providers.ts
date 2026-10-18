import type { SystemModelProviderDto } from '../types/model'

/**
 * 系统内置模型厂商预设（固定功能，非插件）
 * - 全部采用 OpenAI 兼容接口（/chat/completions），由 model-service 统一调用
 * - providerId 同时是 ModelConfig.providerId 的合法取值与 ModelService 的路由标识
 * - 'builtin'（内置免费 mock 模型）为保留字，厂商预设不得使用
 */
export const SYSTEM_MODEL_PROVIDERS: SystemModelProviderDto[] = [
  {
    providerId: 'openai',
    providerName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    defaultModel: 'gpt-4o-mini',
    keyHint: '在 platform.openai.com 创建 API Key',
  },
  {
    providerId: 'deepseek',
    providerName: 'DeepSeek（深度求索）',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    keyHint: '在 platform.deepseek.com 创建 API Key',
  },
  {
    providerId: 'qwen',
    providerName: 'Qwen 通义千问（阿里云百炼）',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
    defaultModel: 'qwen-plus',
    keyHint: '在阿里云百炼控制台创建 API Key',
  },
  {
    providerId: 'glm',
    providerName: 'GLM 智谱（智谱 AI）',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
    defaultModel: 'glm-4-plus',
    keyHint: '在 open.bigmodel.cn 创建 API Key',
  },
]

/** 按 providerId 查找系统厂商预设 */
export function getSystemProvider(providerId: string): SystemModelProviderDto | undefined {
  return SYSTEM_MODEL_PROVIDERS.find((p) => p.providerId === providerId)
}
