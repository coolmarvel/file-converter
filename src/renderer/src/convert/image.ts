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

/**
 * 흰색(밝은) 배경 픽셀을 투명하게 — 그림판식 "배경 투명" (in-place).
 * tolerance: 0~100(%). 흰색에서 얼마나 먼 색까지 배경으로 볼지. 경계는 부드럽게(feather).
 */
export function removeWhiteBg(canvas: HTMLCanvasElement, tolerance: number): void {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  const thr = Math.max(0, Math.min(100, tolerance)) * 2.55 // 흰색과의 거리 임계값
  const feather = 25 // 임계값 근처를 부드럽게 반투명 처리
  for (let i = 0; i < d.length; i += 4) {
    const dist = 255 - Math.min(d[i], d[i + 1], d[i + 2]) // 흰색에서 가장 먼 채널 기준
    if (dist <= thr) d[i + 3] = 0
    else if (dist <= thr + feather) d[i + 3] = Math.round((d[i + 3] * (dist - thr)) / feather)
  }
  ctx.putImageData(imageData, 0, 0)
}

/** 투명도를 담을 수 있는 출력인지 (jpeg/bmp는 흰 배경으로 합쳐진다) */
export function supportsAlpha(kind: FileKind): boolean {
  return kind === 'png' || kind === 'webp' || kind === 'ico' || kind === 'svg'
}

export interface ImageConvertOpts {
  resize?: ResizeOpts
  /** 0~1. jpeg/webp 인코딩 품질 (기본 0.92) */
  quality?: number
  transform?: Transform
  crop?: CropRect | null
  /** 흰색 배경 → 투명 (0~100 허용 오차). null/undefined = 끔 */
  whiteTolerance?: number | null
  watermark?: WatermarkOpts
  sig?: HTMLImageElement
}

/**
 * 공용 렌더 파이프라인: 리사이즈 → 회전/반전/흑백 → 자르기 → 흰색제거 → 워터마크.
 * 미리보기(Preview)와 순서·좌표계가 같아야 한다 — 보이는 그대로가 결과물.
 * opaque=true(jpeg/bmp)면 흰 배경을 먼저 칠하고 흰색제거는 건너뛴다.
 */
export async function renderToCanvas(bytes: Uint8Array, fromMime: string, opts: ImageConvertOpts, opaque: boolean): Promise<HTMLCanvasElement> {
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
  if (opaque) {
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
  if (!opaque && opts.whiteTolerance != null) removeWhiteBg(canvas, opts.whiteTolerance)
  if (opts.watermark) drawWatermark(canvas.getContext('2d')!, canvas.width, canvas.height, opts.watermark, opts.sig)
  return canvas
}

/** 이미지 → 지정 래스터 포맷 이미지 */
export async function convertImageFormat(
  bytes: Uint8Array,
  fromMime: string,
  toKind: FileKind,
  opts: ImageConvertOpts = {}
): Promise<Uint8Array> {
  const canvas = await renderToCanvas(bytes, fromMime, opts, !supportsAlpha(toKind))
  return encodeCanvas(canvas, toKind, opts.quality)
}

/** 이미지 → SVG (imagetracer 벡터 트레이싱 — 로고·단순 이미지용) */
export async function convertImageToSvg(bytes: Uint8Array, fromMime: string, opts: ImageConvertOpts = {}): Promise<Uint8Array> {
  const { default: ImageTracer } = await import('imagetracerjs')
  const canvas = await renderToCanvas(bytes, fromMime, opts, false)
  // 트레이싱 비용 상한: 긴 변 1200px로 축소 (벡터화 품질엔 충분)
  let src = canvas
  const long = Math.max(canvas.width, canvas.height)
  if (long > 1200) {
    const k = 1200 / long
    const small = document.createElement('canvas')
    small.width = Math.max(1, Math.round(canvas.width * k))
    small.height = Math.max(1, Math.round(canvas.height * k))
    small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height)
    src = small
  }
  const ctx = src.getContext('2d')!
  const svg = ImageTracer.imagedataToSVG(ctx.getImageData(0, 0, src.width, src.height), {
    numberofcolors: 16,
    pathomit: 8,
    scale: 1
  })
  return new TextEncoder().encode(svg)
}

/** 이미지 → ICO (16~256 멀티사이즈 PNG 임베드, 정사각 fit-contain) */
export async function convertImageToIco(bytes: Uint8Array, fromMime: string, opts: ImageConvertOpts = {}): Promise<Uint8Array> {
  const { encodeIco, ICO_SIZES } = await import('@core/index')
  const canvas = await renderToCanvas(bytes, fromMime, opts, false)
  const long = Math.max(canvas.width, canvas.height)
  // 원본보다 큰 크기로 업스케일하지 않는다 (단, 최소 1개는 보장)
  const sizes = ICO_SIZES.filter((s) => s <= Math.max(long, 16))
  const entries: { size: number; png: Uint8Array }[] = []
  for (const size of sizes.length ? sizes : [16]) {
    const square = document.createElement('canvas')
    square.width = size
    square.height = size
    const sctx = square.getContext('2d')!
    const k = Math.min(size / canvas.width, size / canvas.height)
    const w = Math.max(1, Math.round(canvas.width * k))
    const h = Math.max(1, Math.round(canvas.height * k))
    sctx.drawImage(canvas, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
    entries.push({ size, png: await canvasToBytes(square, 'image/png') })
  }
  return encodeIco(entries)
}
