/**
 * AI 배경 제거 — @imgly/background-removal (ONNX 모델, 완전 오프라인).
 *
 * 모델·wasm 에셋(@imgly/background-removal-data, ~350MB)은 인스톨러에 통째로 번들되고
 * (extraResources → resources/bgrm-data), main 프로세스의 bgrm:// 커스텀 프로토콜로 서빙된다.
 * - Electron(개발/패키징): preload가 노출한 window.api.bgAssetsUrl = 'bgrm://assets/'
 * - 순수 브라우저(vite dev + Playwright 검증): __BG_ASSETS_DEV__ (electron.vite.config define)
 *
 * CPU 추론이라 장당 수 초 걸린다 — 반드시 진행 표시와 함께 쓸 것.
 */
import { removeBackground } from '@imgly/background-removal'
import { blobPart, loadImage, canvasToBytes } from './image'

/** imgly가 받는 입력 mime (그 외 BMP/GIF 등은 PNG로 정규화해서 넘긴다) */
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

declare const __BG_ASSETS_DEV__: string

export type BgProgress = (label: string) => void

function assetsBase(): string {
  const fromApi = (window as { api?: { bgAssetsUrl?: string } }).api?.bgAssetsUrl
  if (fromApi) return fromApi
  if (typeof __BG_ASSETS_DEV__ === 'string' && __BG_ASSETS_DEV__) return new URL(__BG_ASSETS_DEV__, location.origin).toString()
  throw new Error('배경 제거 모델 경로를 찾지 못했습니다.')
}

/** 이미지 바이트 → 배경 제거된 PNG 바이트 */
export async function removeBackgroundBytes(bytes: Uint8Array, mime: string, onProgress?: BgProgress): Promise<Uint8Array> {
  if (!ACCEPTED.has(mime)) {
    const img = await loadImage(bytes, mime)
    const c = document.createElement('canvas')
    c.width = img.naturalWidth || img.width
    c.height = img.naturalHeight || img.height
    c.getContext('2d')!.drawImage(img, 0, 0)
    bytes = await canvasToBytes(c, 'image/png')
    mime = 'image/png'
  }
  const blob = new Blob([blobPart(bytes)], { type: mime })
  const result = await removeBackground(blob, {
    publicPath: assetsBase(),
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      // key 예: "fetch:/models/isnet", "compute:inference"
      if (key.startsWith('fetch')) onProgress?.(`모델 불러오는 중… ${Math.round((current / Math.max(1, total)) * 100)}%`)
      else onProgress?.('배경 분석 중…')
    }
  })
  return new Uint8Array(await result.arrayBuffer())
}
