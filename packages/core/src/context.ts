import { Context } from 'cordis'

export { Context, Service } from 'cordis'

/** 创建根上下文（后端 Cordis 宿主的入口对象） */
export function createRootContext(): Context {
  return new Context()
}

/** 便捷取服务：缺失时抛错（对应文档 3.3 规则 2 的强失败场景） */
export function requireService<T>(ctx: Context, name: string): T {
  const svc = ctx.get(name) as T | undefined
  if (!svc) {
    throw new Error(`服务 [${name}] 未注册（相关插件可能未启用）`)
  }
  return svc
}
