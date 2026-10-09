import { defineConfig } from 'tsup'

// 插件构建：@novelagent/core 保持 external
// 运行时由 DATA_ROOT/node_modules 下的链接解析（见 launcher 的插件同步逻辑），
// 保证插件与宿主共享同一个 Cordis 实例
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@novelagent/core'],
})
