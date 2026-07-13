/**
 * 이미지 관련 저수준 헬퍼 + 이미지 포맷 상호 변환 (브라우저 canvas 기반).
 */
import { FileKind, FORMATS, encodeBmp } from '@core/index'
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

/** 캔버스 → 목표 포맷 바이트. BMP만 자체 인코더(core/bmp.ts), 나머지는 canvas 네이티브 */
export function encodeCanvas(canvas: HTMLCanvasElement, toKind: FileKind, quality = 0.92): Promise<Uint8Array> {
  if (toKind === 'bmp') {
    const ctx = canvas.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return Promise.resolve(encodeBmp(canvas.width, canvas.height, new Uint8Array(data.buffer)))
  }
  return canvasToBytes(canvas, mimeFor(toKind), quality)
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

/** 픽셀 변형 옵션 (리사이즈와 별개): 회전·반전·흑백 */
export interface Transform {
  /** 시계방향 회전 각도 */
  rotate?: 0 | 90 | 180 | 270
  flipH?: boolean
  flipV?: boolean
  grayscale?: boolean
}

export function hasTransform(t?: Transform): boolean {
  return !!t && ((t.rotate ?? 0) !== 0 || !!t.flipH || !!t.flipV || !!t.grayscale)
}

/**
 * 자르기 영역 — **리사이즈·회전이 반영된 화면 기준** 0~1 정규화 좌표.
 * 미리보기에 보이는 프레임과 좌표계가 같아서 "보이는 그대로" 잘린다.
 */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export function hasCrop(c?: CropRect | null): c is CropRect {
  return !!c && c.w > 0.001 && c.h > 0.001 && !(c.x <= 0 && c.y <= 0 && c.w >= 0.999 && c.h >= 0.999)
}

/** 정규화 crop → 캔버스를 실제로 도려낸 새 캔버스 (crop 없으면 원본 그대로) */
export function applyCrop(canvas: HTMLCanvasElement, crop?: CropRect | null): HTMLCanvasElement {
  if (!hasCrop(crop)) return canvas
  const sx = Math.max(0, Math.round(crop.x * canvas.width))
  const sy = Math.max(0, Math.round(crop.y * canvas.height))
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.round(crop.w * canvas.width)))
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.round(crop.h * canvas.height)))
  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
  return out
}

export interface ImageConvertOpts {
  resize?: ResizeOpts
  /** 0~1. jpeg/webp 인코딩 품질 (기본 0.92) */
  quality?: number
  transform?: Transform
  crop?: CropRect | null
  watermark?: WatermarkOpts
  sig?: HTMLImageElement
}

/**
 * 이미지 → 지정 포맷 이미지.
 * 처리 순서: 리사이즈 → 회전/반전/흑백 → 자르기 → 워터마크(잘린 결과 기준, 항상 정방향) → 인코딩.
 * 미리보기(Preview)와 순서·좌표계가 같아야 한다 — 보이는 그대로가 결과물.
 */
export async function convertImageFormat(
  bytes: Uint8Array,
  fromMime: string,
  toKind: FileKind,
  opts: ImageConvertOpts = {}
): Promise<Uint8Array> {
  const img = await loadImage(bytes, fromMime)
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height
  if (!natW || !natH) throw new Error('이미지 크기를 읽지 못했습니다.')
  const { width, height } = targetSize(natW, natH, opts.resize)
  const rotate = opts.transform?.rotate ?? 0
  const swap = rotate === 90 || rotate === 270
  let canvas = document.createElement('canvas')
  canvas.width = swap ? height : width
  canvas.height = swap ? width : height
  const ctx = canvas.getContext('2d')!
  // JPEG/BMP는 투명도가 없으므로 흰 배경을 먼저 칠한다
  if (toKind === 'jpeg' || toKind === 'bmp') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  if (rotate) ctx.rotate((rotate * Math.PI) / 180)
  ctx.scale(opts.transform?.flipH ? -1 : 1, opts.transform?.flipV ? -1 : 1)
  if (opts.transform?.grayscale) ctx.filter = 'grayscale(1)'
  ctx.drawImage(img, -width / 2, -height / 2, width, height)
  ctx.restore()
  canvas = applyCrop(canvas, opts.crop)
  if (opts.watermark) drawWatermark(canvas.getContext('2d')!, canvas.width, canvas.height, opts.watermark, opts.sig)
  return encodeCanvas(canvas, toKind, opts.quality)
}
