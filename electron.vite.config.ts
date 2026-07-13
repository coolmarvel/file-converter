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
    // 일부 라이브러리가 Node 전역(Buffer 등)을 참조해서 브라우저에서 정의해 줌
    define: {
      global: 'globalThis',
      // AI 배경 제거 모델 에셋의 dev(순수 브라우저) 폴백 경로 — Electron에선 bgrm:// 프로토콜 사용
      __BG_ASSETS_DEV__: JSON.stringify('/@fs' + resolve('node_modules/@imgly/background-removal-data/dist') + '/')
    },
    optimizeDeps: {
      // pdfjs 워커 사전 번들 이슈 회피
      exclude: ['pdfjs-dist']
    }
  }
})
