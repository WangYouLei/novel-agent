import { defineConfig } from 'vitest/config'

// web 包测试配置：
// - include 覆盖 src 下全部（client + server）；不复用 vite.config.ts（其 root=src/client
//   会导致 server 下的测试无法被发现）
// - 包内无根 tsconfig.json，esbuild 需显式开启 experimentalDecorators 才能编译
//   DTO class 上的 class-validator 装饰器
export default defineConfig({
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
