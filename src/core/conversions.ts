/**
 * "무엇을 무엇으로 바꿀 수 있는가" 레지스트리 (순수 TS).
 *
 * 실제 변환 구현은 렌더러(브라우저 컨텍스트: canvas/pdf.js)에 있고, 여기서는
 * 가능한 변환 경로와 UI 메타데이터만 선언한다. 새 변환을 추가할 때는
 *   1) 여기 targetsFor 에 항목 추가
 *   2) 렌더러 convert/index.ts 의 디스패처에 구현 연결
 * 두 곳만 손대면 된다. (확장 지점)
 */

import { FileKind, FORMATS } from './fileTypes'

export interface ConversionTarget {
  to: FileKind
  label: string
  /** 여러 입력 파일을 결과 1개로 합치는 변환인지 (예: 이미지 여러 장 → PDF 1개) */
  merges: boolean
}

/**
 * 브라우저 canvas 로 "인코딩(출력)"이 가능한 이미지 포맷.
 * GIF/SVG/AVIF 는 읽기(디코딩)만 지원 — 입력으로 받아 아래 포맷/PDF 로 변환한다.
 * (BMP 는 canvas 네이티브 인코딩이 없어 core/bmp.ts 자체 인코더 사용)
 */
export const IMAGE_OUTPUTS: FileKind[] = ['png', 'jpeg', 'webp', 'bmp']

export function targetsFor(kind: FileKind): ConversionTarget[] {
  if (kind === 'pdf') {
    return [
      { to: 'png', label: 'PNG 이미지 (페이지별)', merges: false },
      { to: 'jpeg', label: 'JPEG 이미지 (페이지별)', merges: false },
      { to: 'webp', label: 'WebP 이미지 (페이지별)', merges: false }
    ]
  }
  if (FORMATS[kind].isImage) {
    const targets: ConversionTarget[] = [{ to: 'pdf', label: 'PDF (여러 장 합치기)', merges: true }]
    for (const out of IMAGE_OUTPUTS) {
      targets.push({
        to: out,
        // 같은 포맷 → 같은 포맷도 허용: 크기·품질·회전 등 옵션만 바꿔 다시 저장하는 용도
        label: out === kind ? `${FORMATS[out].label} (크기·품질만 조절)` : `${FORMATS[out].label} 이미지`,
        merges: false
      })
    }
    return targets
  }
  return []
}

export function canConvert(kind: FileKind): boolean {
  return targetsFor(kind).length > 0
}

/** PDF "문서 정리" 작업 (from→to 변환과 별개 트랙) */
export type PdfOp = 'merge' | 'split' | 'rotate' | 'deletePages' | 'reorder'

export interface PdfOpInfo {
  op: PdfOp
  label: string
  description: string
}

export const PDF_OPS: PdfOpInfo[] = [
  { op: 'merge', label: '병합', description: '여러 PDF를 순서대로 하나로' },
  { op: 'split', label: '분할', description: '페이지 범위별로 나눠 저장' },
  { op: 'rotate', label: '회전', description: '선택 페이지를 90°씩 회전' },
  { op: 'deletePages', label: '페이지 삭제', description: '선택한 페이지 제거' },
  { op: 'reorder', label: '순서 변경', description: '페이지 순서 재배치' }
]
