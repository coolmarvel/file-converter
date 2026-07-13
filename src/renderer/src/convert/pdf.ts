/**
 * PDF 관련 변환/정리 (pdf.js = 렌더링, pdf-lib = 편집/생성).
 */
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, degrees } from 'pdf-lib'
import { FileKind, extFor } from '@core/index'
import { canvasToBytes, mimeFor, convertImageFormat, encodeCanvas, loadImage, targetSize, ResizeOpts, CropRect, applyCrop } from './image'
import { WatermarkOpts, drawWatermark } from '../watermark/model'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface NamedBytes {
  name: string
  bytes: Uint8Array
}

// ── 미리보기용: 문서를 한 번 열어두고 페이지만 렌더 ─────────────────────
// (이전에는 페이지를 넘길 때마다 전체 바이트 복사 + 재파싱을 해서, 대용량 PDF에서
//  넘김 1회 ~1초 + 연타 시 작업이 겹쳐 메모리 폭증 → 렌더러 크래시가 났다)

export interface PdfHandle {
  numPages: number
  renderPagePng(pageIndex: number, scale: number): Promise<Uint8Array>
  destroy(): Promise<void>
}

/** 미리보기 렌더 캔버스 긴 변 상한(px). 스캔 PDF처럼 페이지가 거대해도 캔버스가 폭주하지 않게. */
const PREVIEW_MAX_SIDE = 2600

/** PDF를 열어 핸들을 돌려준다. 미리보기가 사라질 때 반드시 destroy() 할 것. */
export async function openPdf(bytes: Uint8Array): Promise<PdfHandle> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  return {
    numPages: doc.numPages,
    async renderPagePng(pageIndex: number, scale: number): Promise<Uint8Array> {
      const page = await doc.getPage(pageIndex + 1)
      let viewport = page.getViewport({ scale })
      const long = Math.max(viewport.width, viewport.height)
      if (long > PREVIEW_MAX_SIDE) viewport = page.getViewport({ scale: scale * (PREVIEW_MAX_SIDE / long) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()
      return canvasToBytes(canvas, 'image/png')
    },
    destroy: () => doc.destroy()
  }
}

export interface PdfToImagesOpts {
  scale?: number
  /** 해당 페이지만(0-based). 없으면 전체 */
  pageIndices?: number[]
  /** 출력 픽셀 크기 강제 (없으면 scale 렌더 크기 그대로) */
  resize?: ResizeOpts
  /** 0~1. jpeg/webp 인코딩 품질 */
  quality?: number
  /** 페이지에서 잘라낼 영역 (미리보기 화면 기준 정규화) */
  crop?: CropRect | null
  watermark?: WatermarkOpts
  sig?: HTMLImageElement
}

/** PDF → 페이지별 이미지. scale 이 클수록 고해상도. */
export async function pdfToImages(bytes: Uint8Array, toKind: FileKind, baseName: string, opts: PdfToImagesOpts = {}): Promise<NamedBytes[]> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  const pages = opts.pageIndices ?? Array.from({ length: doc.numPages }, (_, i) => i)
  const ext = extFor(toKind)
  const fillsBg = toKind === 'jpeg' || toKind === 'bmp'
  const out: NamedBytes[] = []
  for (const idx of pages) {
    const page = await doc.getPage(idx + 1)
    const viewport = page.getViewport({ scale: opts.scale ?? 2 })
    let canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    let ctx = canvas.getContext('2d')!
    if (fillsBg) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    await page.render({ canvasContext: ctx, viewport }).promise
    page.cleanup()
    // 출력 크기 지정 시 렌더 결과를 다시 그린다 (렌더 자체는 scale 해상도 유지 → 축소 품질 확보)
    if (opts.resize && (opts.resize.width || opts.resize.height)) {
      const { width, height } = targetSize(canvas.width, canvas.height, opts.resize)
      const resized = document.createElement('canvas')
      resized.width = width
      resized.height = height
      const rctx = resized.getContext('2d')!
      if (fillsBg) {
        rctx.fillStyle = '#ffffff'
        rctx.fillRect(0, 0, width, height)
      }
      rctx.drawImage(canvas, 0, 0, width, height)
      canvas = resized
      ctx = rctx
    }
    canvas = applyCrop(canvas, opts.crop)
    ctx = canvas.getContext('2d')!
    if (opts.watermark) drawWatermark(ctx, canvas.width, canvas.height, opts.watermark, opts.sig)
    const pageNo = String(idx + 1).padStart(3, '0')
    out.push({ name: `${baseName}_p${pageNo}.${ext}`, bytes: await encodeCanvas(canvas, toKind, opts.quality) })
  }
  await doc.destroy()
  return out
}

/** 이미지 여러 장 → PDF 1개 (한 장당 한 페이지, 이미지 크기에 맞춤). watermark 주면 각 페이지에 합성. */
export async function imagesToPdf(
  images: { bytes: Uint8Array; kind: FileKind }[],
  watermark?: WatermarkOpts,
  sig?: HTMLImageElement
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const wm = watermark?.enabled ? watermark : undefined
  for (const img of images) {
    if (wm) {
      // 워터마크가 있으면 캔버스에 원본+워터마크를 그려 PNG로 임베드
      const src = await loadImage(img.bytes, mimeFor(img.kind))
      const canvas = document.createElement('canvas')
      canvas.width = src.naturalWidth
      canvas.height = src.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(src, 0, 0)
      drawWatermark(ctx, canvas.width, canvas.height, wm, sig)
      const png = await canvasToBytes(canvas, 'image/png')
      const embedded = await pdf.embedPng(png)
      const page = pdf.addPage([embedded.width, embedded.height])
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
      continue
    }
    // pdf-lib는 png/jpg만 임베드 가능 → webp 등은 png로 먼저 변환
    let embedBytes = img.bytes
    let isPng = img.kind === 'png'
    if (img.kind !== 'png' && img.kind !== 'jpeg') {
      embedBytes = await convertImageFormat(img.bytes, mimeFor(img.kind), 'png')
      isPng = true
    }
    const embedded = isPng ? await pdf.embedPng(embedBytes) : await pdf.embedJpg(embedBytes)
    const page = pdf.addPage([embedded.width, embedded.height])
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
  }
  return pdf.save()
}

// ── 문서 정리 (같은 PDF → PDF) ────────────────────────────────────────

/** 여러 PDF를 순서대로 병합 */
export async function mergePdfs(list: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const bytes of list) {
    const src = await PDFDocument.load(bytes)
    const copied = await merged.copyPages(src, src.getPageIndices())
    copied.forEach((p) => merged.addPage(p))
  }
  return merged.save()
}

/** 선택 페이지(0-based)를 시계방향 degrees 만큼 회전. pageIndices 없으면 전체 */
export async function rotatePdf(bytes: Uint8Array, deg: number, pageIndices?: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const targets = pageIndices ?? doc.getPageIndices()
  for (const i of targets) {
    const page = doc.getPage(i)
    const current = page.getRotation().angle
    page.setRotation(degrees((current + deg) % 360))
  }
  return doc.save()
}

/** 선택 페이지(0-based) 삭제 */
export async function deletePages(bytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  // 뒤에서부터 지워야 인덱스가 밀리지 않는다
  ;[...pageIndices].sort((a, b) => b - a).forEach((i) => doc.removePage(i))
  return doc.save()
}

/** 새 순서(0-based 인덱스 배열)로 페이지 재배치 */
export async function reorderPdf(bytes: Uint8Array, newOrder: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, newOrder)
  copied.forEach((p) => out.addPage(p))
  return out.save()
}

/** 페이지 범위별로 분할. ranges 예: [[0,2],[3,5]] (0-based, inclusive) */
export async function splitPdf(bytes: Uint8Array, ranges: [number, number][], baseName: string): Promise<NamedBytes[]> {
  const src = await PDFDocument.load(bytes)
  const out: NamedBytes[] = []
  let part = 1
  for (const [start, end] of ranges) {
    const doc = await PDFDocument.create()
    const idx = []
    for (let i = start; i <= end; i++) idx.push(i)
    const copied = await doc.copyPages(src, idx)
    copied.forEach((p) => doc.addPage(p))
    out.push({ name: `${baseName}_part${part}.pdf`, bytes: await doc.save() })
    part++
  }
  return out
}
