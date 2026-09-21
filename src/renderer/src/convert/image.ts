/**
 * 이미지 관련 저수준 헬퍼 + 이미지 포맷 상호 변환 (브라우저 canvas 기반).
 */
import {
  FileKind,
  FORMATS,
  encodeBmp,
  Adjustments,
  hasAdjust,
  applyAdjustments,
  CanvasSizeOptions,
  changesCanvas,
  canvasTarget,
  anchorOffset,
  checkLimits,
  embedDpi,
  Filters,
  hasFilters,
  applyFilters,
  filterMargin,
  LayerEffects,
  hasEffects,
  renderEffects,
  contentFill,
  CONTENT_FILL
} from '@core/index'
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

/** 바이트 → object URL (해제는 호출측 책임) */
export function bytesToUrl(bytes: Uint8Array, mime: string): string {
  return URL.createObjectURL(new Blob([blobPart(bytes)], { type: mime }))
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
        if (!blob) return reject(new Error('이미지 인코딩에 실패했습니다. 크기가 너무 크면 줄여 보세요.'))
        resolve(new Uint8Array(await blob.arrayBuffer()))
      },
      mime,
      quality
    )
  })
}

/**
 * 캔버스 → 목표 포맷 바이트. BMP만 자체 인코더(core/bmp.ts), 나머지는 canvas 네이티브.
 * dpi 를 주면 PNG/JPEG 에 인쇄 해상도를 새긴다(core/dpi.ts — canvas 는 DPI 를 안 넣어 준다).
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, toKind: FileKind, quality = 0.92, dpi?: number | null): Promise<Uint8Array> {
  if (toKind === 'bmp') {
    const ctx = canvas.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return encodeBmp(canvas.width, canvas.height, new Uint8Array(data.buffer))
  }
  const bytes = await canvasToBytes(canvas, mimeFor(toKind), quality)
  return dpi ? embedDpi(bytes, toKind, dpi) : bytes
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

/** 한도(30,000px/변·100MP)를 넘는 캔버스는 만들기 전에 막는다 — 조용히 빈 이미지가 되는 대신 이유를 말한다 */
export function assertCanvasSize(width: number, height: number): void {
  const msg = checkLimits(width, height)
  if (msg) throw new Error(msg)
}

/**
 * 고품질 축소 — Compositor `DownsampleCache` 의 방식.
 * canvas 의 한 번 축소는 주변 몇 픽셀만 보고 섞어서 4배·8배로 줄이면 흐릿하거나 자글자글해진다.
 * 그래서 **정확히 2배씩 여러 번** 줄여 두고, 마지막 한 번(2배 이하)만 목표 크기로 그린다.
 * 반환값은 목표 크기 이상·2배 미만인 중간 소스 (확대거나 2배 미만 축소면 원본 그대로).
 */
export function stepDown(src: CanvasImageSource, w: number, h: number, targetW: number, targetH: number): { img: CanvasImageSource; w: number; h: number } {
  let cur = src
  let cw = w
  let ch = h
  while (cw / 2 >= targetW && ch / 2 >= targetH && cw > 1 && ch > 1) {
    const nw = Math.max(1, Math.ceil(cw / 2))
    const nh = Math.max(1, Math.ceil(ch / 2))
    const c = document.createElement('canvas')
    c.width = nw
    c.height = nh
    const x = c.getContext('2d')!
    x.imageSmoothingEnabled = true
    x.imageSmoothingQuality = 'high'
    x.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh)
    cur = c
    cw = nw
    ch = nh
  }
  return { img: cur, w: cw, h: ch }
}

/** 소스를 (dw×dh) 로 고품질로 그린다 — 크게 줄일 때는 stepDown 체인을 거친다 */
export function drawScaled(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void {
  const s = stepDown(src, sw, sh, Math.abs(dw), Math.abs(dh))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(s.img, 0, 0, s.w, s.h, dx, dy, dw, dh)
}

/** 새 캔버스를 (w×h) 로 만들고 소스를 고품질로 채워 그린다 */
export function scaledCanvas(src: CanvasImageSource, sw: number, sh: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  drawScaled(c.getContext('2d')!, src, sw, sh, 0, 0, w, h)
  return c
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
 * 자르기 영역 — **리사이즈·회전·캔버스 크기가 반영된 화면 기준** 0~1 정규화 좌표.
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
  removeWhitePixels(imageData.data, tolerance)
  ctx.putImageData(imageData, 0, 0)
}

/** removeWhiteBg 의 픽셀 커널 (미리보기 픽셀 패스와 공유) */
export function removeWhitePixels(d: Uint8ClampedArray, tolerance: number): void {
  const thr = Math.max(0, Math.min(100, tolerance)) * 2.55 // 흰색과의 거리 임계값
  const feather = 25 // 임계값 근처를 부드럽게 반투명 처리
  for (let i = 0; i < d.length; i += 4) {
    const dist = 255 - Math.min(d[i], d[i + 1], d[i + 2]) // 흰색에서 가장 먼 채널 기준
    if (dist <= thr) d[i + 3] = 0
    else if (dist <= thr + feather) d[i + 3] = Math.round((d[i + 3] * (dist - thr)) / feather)
  }
}

/** 보정(core/adjust)을 캔버스에 적용 (in-place) */
export function applyAdjustCanvas(canvas: HTMLCanvasElement, adjust: Adjustments | null | undefined, seed = 1): void {
  if (!hasAdjust(adjust)) return
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyAdjustments(imageData.data, adjust, seed)
  ctx.putImageData(imageData, 0, 0)
}

/** 캔버스 크기 — 앵커 위치에 원본을 앉히고 여백을 배경색(또는 내용 인식 채우기)으로 (Compositor Canvas Size) */
export function applyCanvasSize(canvas: HTMLCanvasElement, opts: CanvasSizeOptions | null | undefined): HTMLCanvasElement {
  if (!changesCanvas(canvas.width, canvas.height, opts)) return canvas
  const { width, height } = canvasTarget(canvas.width, canvas.height, opts)
  assertCanvasSize(width, height)
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')!
  const content = opts.background === CONTENT_FILL
  if (opts.background && !content) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, height)
  }
  const { dx, dy } = anchorOffset(canvas.width, canvas.height, width, height, opts.anchor)
  if (content) fillMarginsByContent(ctx, canvas, dx, dy, width, height)
  ctx.drawImage(canvas, dx, dy)
  return out
}

/** 내용 인식 채우기 계산 해상도 상한 (픽셀 수) — 넘으면 축소본에서 채우고 확대해 깐다 */
const CONTENT_FILL_MAX_PIXELS = 1_200_000

/**
 * 늘어난 여백을 원본 주변 그림의 패치로 채운다 (core/contentfill — Compositor ContentFill.c).
 * 큰 캔버스는 축소본에서 채운 뒤 확대해서 깔고, 원본은 그 위에 그대로 그린다(선명도 유지).
 */
function fillMarginsByContent(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, dx: number, dy: number, width: number, height: number): void {
  const k = Math.min(1, Math.sqrt(CONTENT_FILL_MAX_PIXELS / (width * height)))
  const w = Math.max(1, Math.round(width * k))
  const h = Math.max(1, Math.round(height * k))
  const work = document.createElement('canvas')
  work.width = w
  work.height = h
  const wctx = work.getContext('2d', { willReadFrequently: true })!
  wctx.imageSmoothingQuality = 'high'
  wctx.drawImage(src, dx * k, dy * k, src.width * k, src.height * k)
  const img = wctx.getImageData(0, 0, w, h)
  // 채울 곳 = 원본 사각형 밖 (축소 경계의 반투명 한 줄은 채울 곳으로)
  const x0 = Math.ceil(dx * k)
  const y0 = Math.ceil(dy * k)
  const x1 = Math.floor((dx + src.width) * k)
  const y1 = Math.floor((dy + src.height) * k)
  const target = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < x0 || x >= x1 || y < y0 || y >= y1) target[y * w + x] = 1
  contentFill(img.data, target, w, h)
  wctx.putImageData(img, 0, 0)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(work, 0, 0, width, height)
}

/** 캔버스 ↔ RGBA 버퍼 */
function pixelsOf(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data
}
function canvasFrom(data: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const img = c.getContext('2d')!.createImageData(width, height)
  img.data.set(data)
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

/**
 * 필터 적용. 완전 불투명(사진)이면 가장자리를 늘려 흐리고(테두리가 투명해지지 않게),
 * 투명이 있으면(누끼) 흐림이 번질 여백만큼 캔버스를 넓힌다 — Compositor 가 레이어를 넓혀 흐리는 것과 같다.
 */
export function applyFiltersCanvas(canvas: HTMLCanvasElement, f: Filters | null | undefined): HTMLCanvasElement {
  if (!hasFilters(f)) return canvas
  const data = pixelsOf(canvas)
  let opaque = true
  for (let i = 3; i < data.length; i += 4)
    if (data[i] !== 255) {
      opaque = false
      break
    }
  const grows = !opaque && (f.blur > 0 || f.motionDistance > 0)
  if (!grows) return canvasFrom(applyFilters(data, canvas.width, canvas.height, f, undefined, opaque ? 'clamp' : 'transparent'), canvas.width, canvas.height)
  const m = filterMargin(f)
  const grown = document.createElement('canvas')
  grown.width = canvas.width + m * 2
  grown.height = canvas.height + m * 2
  assertCanvasSize(grown.width, grown.height)
  grown.getContext('2d')!.drawImage(canvas, m, m)
  return canvasFrom(applyFilters(pixelsOf(grown), grown.width, grown.height, f), grown.width, grown.height)
}

/** 레이어 효과(외곽선·그림자·색 덮기·안쪽 그림자) — 효과 여백만큼 넓어진다 (core/effects) */
export function applyEffectsCanvas(canvas: HTMLCanvasElement, e: LayerEffects | null | undefined): HTMLCanvasElement {
  if (!hasEffects(e)) return canvas
  const r = renderEffects(pixelsOf(canvas), canvas.width, canvas.height, e)
  assertCanvasSize(r.width, r.height)
  return canvasFrom(r.data, r.width, r.height)
}

/** 불투명 출력(JPEG·BMP)용 매트 합성 — 투명 부분을 매트 색으로 (Compositor JPEG 내보내기의 배경색) */
export function flattenOnMatte(canvas: HTMLCanvasElement, matte = '#ffffff'): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = matte
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)
  return out
}

/** 투명도를 담을 수 있는 출력인지 (jpeg/bmp는 매트 색으로 합쳐진다) */
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
  /** 보정 (레벨·커브·노출·색조/채도·그레인·반전·그라데이션 맵) */
  adjust?: Adjustments | null
  /** 필터 (가우시안·모션 블러·노이즈·렌즈 보정) */
  filters?: Filters | null
  /** 레이어 효과 (외곽선·그림자·색 덮기·안쪽 그림자) */
  effects?: LayerEffects | null
  /** 캔버스 크기 (여백·정사각) */
  canvasSize?: CanvasSizeOptions | null
  /** 불투명 출력의 투명 부분을 채울 색 (기본 흰색) */
  matte?: string
  /** 결과 파일에 새길 인쇄 해상도 (PNG/JPEG) */
  dpi?: number | null
  watermark?: WatermarkOpts
  sig?: HTMLImageElement
}

/**
 * 공통 후처리 — 이미지·PDF 두 경로가 같은 순서를 쓴다(미리보기와도 같은 순서):
 *   보정 → 필터 → 흰색제거 → 효과 → 캔버스 크기 → 자르기 → 워터마크 → (불투명이면) 매트
 * 필터·효과는 이웃 픽셀을 보거나 크기를 바꾸므로, 미리보기는 이것들이 켜지면 실제 파이프라인 결과(축소본)를 보여 준다.
 * 보정·흰색제거는 픽셀별 연산이라 기하 변형과 순서를 바꿔도 결과가 같다 — 그래서 미리보기는
 * 원본 단계에서 픽셀 패스를 돌리고 기하는 CSS 로 보여 준다(Preview.tsx).
 * 캔버스 크기 다음에 자르기가 오므로 crop 좌표는 여백까지 포함한 프레임 기준이다.
 */
export function finishCanvas(canvas: HTMLCanvasElement, opts: ImageConvertOpts, opaque: boolean): HTMLCanvasElement {
  let c = canvas
  applyAdjustCanvas(c, opts.adjust)
  c = applyFiltersCanvas(c, opts.filters)
  if (!opaque && opts.whiteTolerance != null) removeWhiteBg(c, opts.whiteTolerance)
  c = applyEffectsCanvas(c, opts.effects)
  c = applyCanvasSize(c, opts.canvasSize)
  c = applyCrop(c, opts.crop)
  if (opts.watermark) drawWatermark(c.getContext('2d')!, c.width, c.height, opts.watermark, opts.sig)
  if (opaque) c = flattenOnMatte(c, opts.matte)
  return c
}

/**
 * 공용 렌더 파이프라인: 리사이즈(고품질 축소) → 회전/반전/흑백 → finishCanvas.
 * 미리보기(Preview)와 순서·좌표계가 같아야 한다 — 보이는 그대로가 결과물.
 */
export async function renderToCanvas(bytes: Uint8Array, fromMime: string, opts: ImageConvertOpts, opaque: boolean): Promise<HTMLCanvasElement> {
  const img = await loadImage(bytes, fromMime)
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height
  if (!natW || !natH) throw new Error('이미지 크기를 읽지 못했습니다.')
  const { width, height } = targetSize(natW, natH, opts.resize)
  assertCanvasSize(width, height)
  const rotate = opts.transform?.rotate ?? 0
  const swap = rotate === 90 || rotate === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? height : width
  canvas.height = swap ? width : height
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  if (rotate) ctx.rotate((rotate * Math.PI) / 180)
  ctx.scale(opts.transform?.flipH ? -1 : 1, opts.transform?.flipV ? -1 : 1)
  if (opts.transform?.grayscale) ctx.filter = 'grayscale(1)'
  // 크게 줄일 때는 2배씩 단계 축소(Compositor DownsampleCache) — 필터·회전은 마지막 한 번에만 걸린다
  const s = stepDown(img, natW, natH, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(s.img, 0, 0, s.w, s.h, -width / 2, -height / 2, width, height)
  ctx.restore()
  return finishCanvas(canvas, opts, opaque)
}

/** 이미지 → 지정 래스터 포맷 이미지 */
export async function convertImageFormat(bytes: Uint8Array, fromMime: string, toKind: FileKind, opts: ImageConvertOpts = {}): Promise<Uint8Array> {
  const canvas = await renderToCanvas(bytes, fromMime, opts, !supportsAlpha(toKind))
  return encodeCanvas(canvas, toKind, opts.quality, opts.dpi)
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
    src = scaledCanvas(canvas, canvas.width, canvas.height, Math.max(1, Math.round(canvas.width * k)), Math.max(1, Math.round(canvas.height * k)))
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
    // 256 → 16 처럼 크게 줄일 때 단계 축소가 특히 효과가 크다 (작은 아이콘이 뭉개지지 않게)
    drawScaled(sctx, canvas, canvas.width, canvas.height, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
    entries.push({ size, png: await canvasToBytes(square, 'image/png') })
  }
  return encodeIco(entries)
}
