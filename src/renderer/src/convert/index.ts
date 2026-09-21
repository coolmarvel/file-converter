/**
 * 변환 디스패처 — (원본 종류, 목표 종류)를 실제 구현 함수로 연결한다.
 * 새 변환을 붙일 땐 core/conversions.ts 에 경로를 추가하고 여기 분기 하나를 더한다.
 */
import { FileKind, FORMATS, IMAGE_OUTPUTS, extFor, Adjustments, hasAdjust, CanvasSizeOptions, MatteRefine, hasMatteRefine, Filters, hasFilters, LayerEffects, hasEffects } from '@core/index'
import { AppFile } from '../types'
// pdf.js·pdf-lib는 무거워서 타입만 정적 참조 — 런타임은 해당 분기에서 지연 로딩
import type { NamedBytes } from './pdf'
import { convertImageFormat, convertImageToSvg, convertImageToIco, mimeFor, ResizeOpts, Transform, hasTransform, CropRect, hasCrop, loadImageFromUrl, ImageConvertOpts } from './image'
import { WatermarkOpts } from '../watermark/model'
import signUrl from '../assets/sign.png'

/** 배경 처리: 원본 유지 / 흰색→투명(허용 오차 %) / AI 배경 제거 */
export interface BgOptions {
  mode: 'none' | 'white' | 'ai'
  tolerance: number // white 모드의 허용 오차 (0~100)
  /** AI 모드의 가장자리 다듬기 (Compositor GuidedMatte 이식) */
  matte: MatteRefine
}

export interface ConvertOptions {
  /** 목표 종류 */
  to: FileKind
  /** PDF→이미지 렌더링 배율 */
  scale?: number
  /** PDF→이미지에서 이 페이지들만 (0-based, 내보내기 미리보기용). 없으면 전체 */
  pageIndices?: number[]
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
  /** 보정 (Compositor 이식 — 레벨·커브·노출·색조/채도·그레인·반전·그라데이션 맵) */
  adjust?: Adjustments | null
  /** 필터 (가우시안·모션 블러·노이즈·렌즈 보정) */
  filters?: Filters | null
  /** 레이어 효과 (외곽선·그림자·색 덮기·안쪽 그림자 — 스티커·로고 윤곽선) */
  effects?: LayerEffects | null
  /** 캔버스 크기 (여백·정사각, 9방향 앵커) */
  canvasSize?: CanvasSizeOptions | null
  /** JPEG·BMP 처럼 투명을 못 담는 출력에서 투명 부분을 채울 색 */
  matte?: string
  /** 인쇄 해상도 — PNG/JPEG 에 새기고, 이미지→PDF 에서는 페이지 크기를 정한다 */
  dpi?: number | null
  /** 출력에 워터마크 합성 */
  watermark?: WatermarkOpts
  /** AI 가장자리 다듬기 계산 해상도 상한 (미리보기는 작게) — 기본 4096 */
  matteLimit?: number
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
    const bg = opts.bg
    if (bg?.mode !== 'ai') return { bytes: f.bytes, mime: mimeFor(f.kind) }
    const key = f.cacheKey ?? f.id
    let cut = opts.aiCache?.get(key)
    if (!cut) {
      onProgress?.(idx, files.length, `AI 배경 제거 중… (${idx + 1}/${files.length})`)
      const { removeBackgroundBytes } = await import('./bgremove')
      cut = await removeBackgroundBytes(f.bytes, mimeFor(f.kind), (label) => onProgress?.(idx, files.length, label))
      opts.aiCache?.set(key, cut)
    }
    if (hasMatteRefine(bg.matte)) {
      onProgress?.(idx, files.length, `가장자리 다듬는 중… (${idx + 1}/${files.length})`)
      const { refineCutout } = await import('./matte')
      cut = await refineCutout(cut, f.bytes, f.kind, bg.matte, opts.matteLimit ?? 4096)
    }
    return { bytes: cut, mime: 'image/png' }
  }

  const imageOpts: ImageConvertOpts = {
    resize: opts.resize,
    quality: opts.quality,
    transform: opts.transform,
    crop: opts.crop,
    whiteTolerance,
    adjust: opts.adjust,
    filters: opts.filters,
    effects: opts.effects,
    canvasSize: opts.canvasSize,
    matte: opts.matte,
    dpi: opts.dpi,
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
        ...imageOpts,
        scale: opts.scale ?? 2,
        pageIndices: opts.pageIndices
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
      hasAdjust(opts.adjust) ||
      hasFilters(opts.filters) ||
      hasEffects(opts.effects) ||
      !!opts.canvasSize ||
      opts.bg?.mode === 'ai' ||
      whiteTolerance != null ||
      !!(opts.resize && (opts.resize.width || opts.resize.height))
    const sources: { bytes: Uint8Array; kind: FileKind }[] = []
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i, files.length, `처리 중… (${i + 1}/${files.length})`)
      if (needPre) {
        const src = await sourceOf(files[i], i)
        sources.push({
          bytes: await convertImageFormat(src.bytes, src.mime, 'png', { ...imageOpts, watermark: undefined, sig: undefined, dpi: undefined }),
          kind: 'png'
        })
      } else {
        sources.push({ bytes: files[i].bytes, kind: files[i].kind })
      }
    }
    onProgress?.(files.length, files.length, 'PDF 생성 중…')
    const pdf = await imagesToPdf(sources, wm, sig, opts.dpi)
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
