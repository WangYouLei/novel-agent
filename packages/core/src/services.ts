/**
 * 内核服务声明（文档 3.2 services.ts）
 * 服务名即插件依赖声明的 key（如 outline-generator 依赖 "model-service"）
 */
export const SERVICE_IDS = {
  /** 模型服务：统一调用入口（内置 provider + 插件 provider 路由） */
  MODEL: 'model-service',
  /** 风格包服务：查询小说生效风格包 */
  STYLE_PACK: 'style-pack-service',
  /** 插件注册表服务：查询插件运行状态 */
  PLUGIN_REGISTRY: 'plugin-registry',
} as const

export type ServiceId = (typeof SERVICE_IDS)[keyof typeof SERVICE_IDS]
