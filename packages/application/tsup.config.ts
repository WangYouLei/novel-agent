import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Prisma client 由 @prisma/client 运行时提供，无需打包
  external: ['@prisma/client'],
})
