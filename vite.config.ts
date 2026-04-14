import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,          // 与 dev-start.ps1 保持一致，直接 npm run dev 也用同一端口
    strictPort: true,    // 端口被占用时立即报错，而不是自动换端口（防止 5173/5175 漂移）
    proxy: {
      // 代理到 MCP 服务器的 HTTP API（需先启动 mcp-server）
      '/api': {
        target:    'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
