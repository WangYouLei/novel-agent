import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  // 双格式：CJS 给 Node 后端，ESM 给 Vite 前端（rollup 无法静态分析 CJS 命名导出）
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
})
