import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@core': resolve('src/core'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    // dcmjs 등 일부 라이브러리가 Node 전역(Buffer)을 참조해서 브라우저에서 정의해 줌
    define: {
      global: 'globalThis'
    },
    optimizeDeps: {
      // pdfjs 워커/dcmjs 사전 번들 이슈 회피
      exclude: ['pdfjs-dist']
    }
  }
})
