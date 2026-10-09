import { defineConfig } from 'tsup'

// 插件构建：@novelagent/core 保持 external（与宿主共享 Cordis 实例）
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@novelagent/core'],
})
