/**
 * 변환 디스패처 — (원본 종류, 목표 종류)를 실제 구현 함수로 연결한다.
 * 새 변환을 붙일 땐 core/conversions.ts 에 경로를 추가하고 여기 분기 하나를 더한다.
 */
import { FileKind } from '@core/index'
import { AppFile } from '../types'
import { NamedBytes, pdfToImages, imagesToPdf } from './pdf'
import { convertImageFormat, mimeFor, ResizeOpts, loadImageFromUrl } from './image'
import { imageToDicom, DicomMeta } from './dicom'
import { WatermarkOpts } from '../watermark/model'
import signUrl from '../assets/sign.png'

export interface ConvertOptions {
  /** 목표 종류 */
  to: FileKind
  /** PDF→이미지 렌더링 배율 */
  scale?: number
  /** 이미지→이미지 시 출력 크기(px). 한쪽만 주면 비율 유지 */
  resize?: ResizeOpts
  /** 이미지→DICOM 시 필요한 환자 정보 */
  dicomMeta?: DicomMeta
  /** 출력에 워터마크 합성 (DICOM 제외) */
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
  if (from === 'pdf' && (to === 'png' || to === 'jpeg')) {
    const results: NamedBytes[] = []
    for (const f of files) {
      const imgs = await pdfToImages(f.bytes, to, stripExt(f.name), opts.scale ?? 2, undefined, wm, sig)
      results.push(...imgs)
    }
    return results
  }

  // 이미지 → PDF (여러 장을 한 파일로)
  if (isImageKind(from) && to === 'pdf') {
    const pdf = await imagesToPdf(files.map((f) => ({ bytes: f.bytes, kind: f.kind })), wm, sig)
    const name = files.length === 1 ? `${stripExt(files[0].name)}.pdf` : `묶음_${files.length}장.pdf`
    return [{ name, bytes: pdf }]
  }

  // 이미지 → 다른 이미지 포맷
  if (isImageKind(from) && isImageKind(to)) {
    const ext = to === 'jpeg' ? 'jpg' : to
    const results: NamedBytes[] = []
    for (const f of files) {
      const bytes = await convertImageFormat(f.bytes, mimeFor(f.kind), to, opts.resize, wm, sig)
      results.push({ name: `${stripExt(f.name)}.${ext}`, bytes })
    }
    return results
  }

  // 이미지 → DICOM (파일별로 SC 1개)
  if (isImageKind(from) && to === 'dicom') {
    if (!opts.dicomMeta) throw new Error('DICOM 생성에는 환자 정보가 필요합니다.')
    const results: NamedBytes[] = []
    let n = 1
    for (const f of files) {
      const bytes = await imageToDicom(f.bytes, f.kind, opts.dicomMeta)
      const suffix = files.length > 1 ? `_${String(n++).padStart(2, '0')}` : ''
      results.push({ name: `${stripExt(f.name)}${suffix}.dcm`, bytes })
    }
    return results
  }

  throw new Error(`지원하지 않는 변환입니다: ${from} → ${to}`)
}

function isImageKind(k: FileKind): boolean {
  return k === 'png' || k === 'jpeg' || k === 'webp'
}

export type { NamedBytes }
