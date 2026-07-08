/**
 * 이미지 관련 저수준 헬퍼 + 이미지 포맷 상호 변환 (브라우저 canvas 기반).
 */
import { FileKind, FORMATS } from '@core/index'
import { WatermarkOpts, drawWatermark } from '../watermark/model'

export function mimeFor(kind: FileKind): string {
  return FORMATS[kind].mime ?? 'application/octet-stream'
}

/**
 * Uint8Array를 Blob 파트로 넘길 때의 타입 어댑터.
 * (TS 5.7부터 Uint8Array가 ArrayBuffer 종류로 제네릭화되어 BlobPart와 직접 안 맞음 — 런타임은 안전)
 */
export function blobPart(bytes: Uint8Array): BlobPart {
  return bytes as unknown as BlobPart
}

/** URL(번들 에셋 등) → HTMLImageElement */
export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = url
  })
}

/** 바이트 → HTMLImageElement (blob URL 경유). 사용 후 revoke 처리. */
export function loadImage(bytes: Uint8Array, mime: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([blobPart(bytes)], { type: mime })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했습니다.'))
    }
    img.src = url
  })
}

export function canvasToBytes(canvas: HTMLCanvasElement, mime: string, quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('이미지 인코딩에 실패했습니다.'))
        resolve(new Uint8Array(await blob.arrayBuffer()))
      },
      mime,
      quality
    )
  })
}

/** 이미지 리사이즈 옵션: 한쪽만 주면 비율 유지, 둘 다 주면 강제, 둘 다 없으면 원본 */
export interface ResizeOpts {
  width?: number
  height?: number
}

/** 원본 크기 + 리사이즈 옵션 → 최종 출력 픽셀 크기 (양수 정수 보장) */
export function targetSize(natW: number, natH: number, resize?: ResizeOpts): { width: number; height: number } {
  const rw = resize?.width && resize.width > 0 ? Math.round(resize.width) : undefined
  const rh = resize?.height && resize.height > 0 ? Math.round(resize.height) : undefined
  if (rw && rh) return { width: rw, height: rh }
  if (rw) return { width: rw, height: Math.max(1, Math.round((natH * rw) / natW)) }
  if (rh) return { width: Math.max(1, Math.round((natW * rh) / natH)), height: rh }
  return { width: natW, height: natH }
}

/** 이미지 → 지정 포맷 이미지 (resize 주면 크기 변경, watermark 주면 워터마크 합성) */
export async function convertImageFormat(
  bytes: Uint8Array,
  fromMime: string,
  toKind: FileKind,
  resize?: ResizeOpts,
  watermark?: WatermarkOpts,
  sig?: HTMLImageElement
): Promise<Uint8Array> {
  const img = await loadImage(bytes, fromMime)
  const { width, height } = targetSize(img.naturalWidth, img.naturalHeight, resize)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // JPEG는 투명도가 없으므로 흰 배경을 먼저 칠한다
  if (toKind === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  if (watermark) drawWatermark(ctx, width, height, watermark, sig)
  return canvasToBytes(canvas, mimeFor(toKind))
}

/** DICOM 인코딩용: 이미지의 RGB 픽셀과 크기를 뽑아낸다 */
export async function imageToRgb(
  bytes: Uint8Array,
  fromMime: string
): Promise<{ width: number; height: number; rgb: Uint8Array }> {
  const img = await loadImage(bytes, fromMime)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height) // RGBA
  const rgb = new Uint8Array(canvas.width * canvas.height * 3)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i]
    rgb[j + 1] = data[i + 1]
    rgb[j + 2] = data[i + 2]
  }
  return { width: canvas.width, height: canvas.height, rgb }
}
