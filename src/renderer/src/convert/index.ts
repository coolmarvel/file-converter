/**
 * 변환 디스패처 — (원본 종류, 목표 종류)를 실제 구현 함수로 연결한다.
 * 새 변환을 붙일 땐 core/conversions.ts 에 경로를 추가하고 여기 분기 하나를 더한다.
 */
import { FileKind, FORMATS, IMAGE_OUTPUTS, extFor } from '@core/index'
import { AppFile } from '../types'
import { NamedBytes, pdfToImages, imagesToPdf } from './pdf'
import { convertImageFormat, mimeFor, ResizeOpts, Transform, hasTransform, CropRect, hasCrop, loadImageFromUrl } from './image'
import { WatermarkOpts } from '../watermark/model'
import signUrl from '../assets/sign.png'

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
  /** 출력에 워터마크 합성 */
  watermark?: WatermarkOpts
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
  const { to } = opts

  // 워터마크: 서명 타입이면 서명 이미지 1회 로드
  const wm = opts.watermark?.enabled ? opts.watermark : undefined
  const sig = wm && wm.type === 'signature' ? await loadImageFromUrl(signUrl) : undefined

  // PDF → 이미지(페이지별)
  if (from === 'pdf' && isImageOutput(to)) {
    const results: NamedBytes[] = []
    for (const f of files) {
      const imgs = await pdfToImages(f.bytes, to, stripExt(f.name), {
        scale: opts.scale ?? 2,
        resize: opts.resize,
        quality: opts.quality,
        crop: opts.crop,
        watermark: wm,
        sig
      })
      results.push(...imgs)
    }
    return results
  }

  // 이미지 → PDF (여러 장을 한 파일로)
  if (isImageKind(from) && to === 'pdf') {
    // 크기·회전·자르기 등 원본 가공이 있으면 PNG로 선처리 후 임베드 (워터마크는 imagesToPdf가 페이지별 합성)
    const needPre = hasTransform(opts.transform) || hasCrop(opts.crop) || !!(opts.resize && (opts.resize.width || opts.resize.height))
    const sources: { bytes: Uint8Array; kind: FileKind }[] = []
    for (const f of files) {
      sources.push(
        needPre
          ? { bytes: await convertImageFormat(f.bytes, mimeFor(f.kind), 'png', { resize: opts.resize, transform: opts.transform, crop: opts.crop }), kind: 'png' }
          : { bytes: f.bytes, kind: f.kind }
      )
    }
    const pdf = await imagesToPdf(sources, wm, sig)
    const name = files.length === 1 ? `${stripExt(files[0].name)}.pdf` : `묶음_${files.length}장.pdf`
    return [{ name, bytes: pdf }]
  }

  // 이미지 → 이미지 포맷 (같은 포맷 재저장 = 크기·품질·회전만 조절도 허용)
  if (isImageKind(from) && isImageOutput(to)) {
    const ext = extFor(to)
    const results: NamedBytes[] = []
    for (const f of files) {
      const bytes = await convertImageFormat(f.bytes, mimeFor(f.kind), to, {
        resize: opts.resize,
        quality: opts.quality,
        transform: opts.transform,
        crop: opts.crop,
        watermark: wm,
        sig
      })
      results.push({ name: `${stripExt(f.name)}.${ext}`, bytes })
    }
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
