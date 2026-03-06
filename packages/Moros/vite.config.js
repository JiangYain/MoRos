import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// 在 ESM 环境下获取 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  appType: 'spa',
  plugins: [react()],
  resolve: {
    alias: [
      // CSS 子路径需要显式映射，否则会被解析为 vendor/excalidraw/index.css（不存在）
      { find: '@excalidraw/excalidraw/index.css', replacement: path.resolve(__dirname, 'vendor/excalidraw/dist/prod/index.css') },
      // 其余从包根导入的解析交给 package.json exports 处理
      { find: '@excalidraw/excalidraw', replacement: path.resolve(__dirname, 'vendor/excalidraw') },
      // streamdown 依赖该样式，显式指向 monorepo 根 node_modules，避免 Windows 下解析到不存在的局部路径
      { find: 'katex/dist/katex.min.css', replacement: path.resolve(__dirname, '../../node_modules/katex/dist/katex.min.css') },
    ],
  },
  server: {
    port: 53210,
    strictPort: true
  },
  optimizeDeps: {
    exclude: [
      'vendor/excalidraw-upstream',
      '@excalidraw/excalidraw',
      'vendor/excalidraw'
    ]
  },
  build: {
    rollupOptions: {
      external: [
        'virtual:pwa-register',
        '@sentry/browser',
        'callsites',
        '@excalidraw/common',
        '@excalidraw/element',
        'firebase/storage',
        'firebase/app',
        'firebase/firestore',
        'i18next-browser-languagedetector',
        'idb-keyval',
        '@excalidraw/math',
        '@excalidraw/math/curve',
        'socket.io-client'
      ]
    }
  }
})