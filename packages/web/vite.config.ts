import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

// 前端构建：root 为 src/client，产物输出 dist/client（server 静态托管）
// 开发模式：vite 独立端口（5173），/api 与 /socket.io 代理到后端 3000
export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  plugins: [vue()],
  resolve: {
    // 前端源码内用 @ 指向 client 根
    alias: { '@': path.resolve(__dirname, 'src/client') },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
