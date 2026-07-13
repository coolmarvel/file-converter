/**
 * 변환 디스패처 — (원본 종류, 목표 종류)를 실제 구현 함수로 연결한다.
 * 새 변환을 붙일 땐 core/conversions.ts 에 경로를 추가하고 여기 분기 하나를 더한다.
 */
import { FileKind, FORMATS, IMAGE_OUTPUTS, extFor } from '@core/index'
import { AppFile } from '../types'
// pdf.js·pdf-lib는 무거워서 타입만 정적 참조 — 런타임은 해당 분기에서 지연 로딩
import type { NamedBytes } from './pdf'
import {
  convertImageFormat,
  convertImageToSvg,
  convertImageToIco,
  mimeFor,
  ResizeOpts,
  Transform,
  hasTransform,
  CropRect,
  hasCrop,
  supportsAlpha,
  loadImageFromUrl,
  ImageConvertOpts
} from './image'
import { WatermarkOpts } from '../watermark/model'
import signUrl from '../assets/sign.png'

/** 배경 처리: 원본 유지 / 흰색→투명(허용 오차 %) / AI 배경 제거 */
export interface BgOptions {
  mode: 'none' | 'white' | 'ai'
  tolerance: number // white 모드의 허용 오차 (0~100)
}

export interface ConvertOptions {
  /** 목표 종류 */
  to: FileKind
  /** PDF→이미지 렌더링 배율 */
  scale?: number
  /** 이미지 출력 시 크기(px). 한쪽만 주면 비율 유지 */
  resize?: ResizeOpts
  /** 0~1. jpeg/webp 인코딩 품질 */
  quality?: number
  /** 이미지 원본에 적용할 회전·반전·흑백 */
  transform?: Transform
  /** 자르기 영역 (미리보기 화면 기준 정규화 0~1) */
  crop?: CropRect | null
  /** 배경 처리 (투명은 png/webp/ico/svg 대상만) */
  bg?: BgOptions
  /** AI 배경 제거 선계산 결과 (fileId → PNG 바이트). 없으면 여기서 직접 돌린다 */
  aiCache?: Map<string, Uint8Array>
  /** 출력에 워터마크 합성 */
  watermark?: WatermarkOpts
  /** 진행 표시 (done/total은 파일 단위, label은 현재 단계 설명) */
  onProgress?: (done: number, total: number, label?: string) => void
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

/**
 * 선택된 파일들(같은 종류라고 가정)을 목표 종류로 변환.
 * 결과가 여러 파일일 수도(PDF→이미지), 하나로 합쳐질 수도(이미지→PDF) 있다.
 */
export async function runConversion(files: AppFile[], opts: ConvertOptions): Promise<NamedBytes[]> {
  if (files.length === 0) return []
  const from = files[0].kind
  const { to, onProgress } = opts

  // 워터마크: 서명 타입이면 서명 이미지 1회 로드
  const wm = opts.watermark?.enabled ? opts.watermark : undefined
  const sig = wm && wm.type === 'signature' ? await loadImageFromUrl(signUrl) : undefined

  const whiteTolerance = opts.bg?.mode === 'white' ? opts.bg.tolerance : null

  /** 이미지 소스 바이트 (AI 배경 제거 모드면 제거된 PNG로 대체) */
  async function sourceOf(f: AppFile, idx: number): Promise<{ bytes: Uint8Array; mime: string }> {
    if (opts.bg?.mode !== 'ai') return { bytes: f.bytes, mime: mimeFor(f.kind) }
    const cached = opts.aiCache?.get(f.id)
    if (cached) return { bytes: cached, mime: 'image/png' }
    onProgress?.(idx, files.length, `AI 배경 제거 중… (${idx + 1}/${files.length})`)
    const { removeBackgroundBytes } = await import('./bgremove')
    const out = await removeBackgroundBytes(f.bytes, mimeFor(f.kind), (label) => onProgress?.(idx, files.length, label))
    opts.aiCache?.set(f.id, out)
    return { bytes: out, mime: 'image/png' }
  }

  const imageOpts: ImageConvertOpts = {
    resize: opts.resize,
    quality: opts.quality,
    transform: opts.transform,
    crop: opts.crop,
    whiteTolerance,
    watermark: wm,
    sig
  }

  // PDF → 이미지(페이지별)
  if (from === 'pdf' && isImageOutput(to)) {
    const { pdfToImages } = await import('./pdf')
    const results: NamedBytes[] = []
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i, files.length, `변환 중… (${i + 1}/${files.length})`)
      const imgs = await pdfToImages(files[i].bytes, to, stripExt(files[i].name), {
        scale: opts.scale ?? 2,
        resize: opts.resize,
        quality: opts.quality,
        crop: opts.crop,
        whiteTolerance,
        watermark: wm,
        sig
      })
      results.push(...imgs)
    }
    onProgress?.(files.length, files.length)
    return results
  }

  // 이미지 → PDF (여러 장을 한 파일로)
  if (isImageKind(from) && to === 'pdf') {
    const { imagesToPdf } = await import('./pdf')
    // 크기·회전·자르기·배경 등 원본 가공이 있으면 PNG로 선처리 후 임베드 (워터마크는 imagesToPdf가 페이지별 합성)
    const needPre =
      hasTransform(opts.transform) ||
      hasCrop(opts.crop) ||
      opts.bg?.mode === 'ai' ||
      whiteTolerance != null ||
      !!(opts.resize && (opts.resize.width || opts.resize.height))
    const sources: { bytes: Uint8Array; kind: FileKind }[] = []
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i, files.length, `처리 중… (${i + 1}/${files.length})`)
      if (needPre) {
        const src = await sourceOf(files[i], i)
        sources.push({
          bytes: await convertImageFormat(src.bytes, src.mime, 'png', { ...imageOpts, watermark: undefined, sig: undefined }),
          kind: 'png'
        })
      } else {
        sources.push({ bytes: files[i].bytes, kind: files[i].kind })
      }
    }
    onProgress?.(files.length, files.length, 'PDF 생성 중…')
    const pdf = await imagesToPdf(sources, wm, sig)
    const name = files.length === 1 ? `${stripExt(files[0].name)}.pdf` : `묶음_${files.length}장.pdf`
    return [{ name, bytes: pdf }]
  }

  // 이미지 → 래스터/특수 포맷
  if (isImageKind(from) && (isImageOutput(to) || to === 'svg' || to === 'ico')) {
    const results: NamedBytes[] = []
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i, files.length, `변환 중… (${i + 1}/${files.length})`)
      const src = await sourceOf(files[i], i)
      let bytes: Uint8Array
      if (to === 'svg') {
        onProgress?.(i, files.length, `벡터 트레이싱 중… (${i + 1}/${files.length})`)
        // SVG는 워터마크 미지원 (벡터 트레이싱 결과라 합성 의미가 없음)
        bytes = await convertImageToSvg(src.bytes, src.mime, { ...imageOpts, watermark: undefined, sig: undefined })
      } else if (to === 'ico') {
        bytes = await convertImageToIco(src.bytes, src.mime, imageOpts)
      } else {
        bytes = await convertImageFormat(src.bytes, src.mime, to, imageOpts)
      }
      results.push({ name: `${stripExt(files[i].name)}.${extFor(to)}`, bytes })
    }
    onProgress?.(files.length, files.length)
    return results
  }

  throw new Error(`지원하지 않는 변환입니다: ${from} → ${to}`)
}

function isImageKind(k: FileKind): boolean {
  return FORMATS[k].isImage
}

function isImageOutput(k: FileKind): boolean {
  return IMAGE_OUTPUTS.includes(k)
}

export type { NamedBytes }
