/**
 * PDF 문서 정리(병합/분할/회전/페이지 삭제/순서 변경) 실행기.
 * 저수준 구현은 convert/pdf.ts — 여기는 페이지 지정 문자열 파싱 + 파일 단위 오케스트레이션.
 */
import { PDFDocument } from 'pdf-lib'
import { AppFile } from '../types'
import { NamedBytes, mergePdfs, splitPdf, rotatePdf, deletePages, reorderPdf } from './pdf'

export type PdfToolRequest =
  | { op: 'merge' }
  | { op: 'split'; pages: string }
  | { op: 'rotate'; pages: string; angle: 90 | 180 | 270 }
  | { op: 'delete'; pages: string }
  | { op: 'reorder'; pages: string }

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

/** "1,3-5" → 0-based 인덱스 배열 (검증 포함) */
export function parsePages(spec: string, pageCount: number): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) throw new Error(`페이지 지정이 잘못됐습니다: "${part}" (예: 1,3-5)`)
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b > pageCount || a > b) throw new Error(`페이지 범위를 벗어났습니다: "${part}" (1~${pageCount})`)
    for (let p = a; p <= b; p++) out.add(p - 1)
  }
  if (out.size === 0) throw new Error('페이지를 지정해 주세요. (예: 1,3-5)')
  return [...out].sort((x, y) => x - y)
}

/** "1,3-5 / 6-10" 같은 분할 스펙 → 범위 목록 (구분자 , 또는 /) */
export function parseRanges(spec: string, pageCount: number): [number, number][] {
  const parts = spec.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) throw new Error('분할 범위를 지정해 주세요. (예: 1-3,4-10)')
  return parts.map((part) => {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) throw new Error(`분할 범위가 잘못됐습니다: "${part}"`)
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b > pageCount || a > b) throw new Error(`분할 범위를 벗어났습니다: "${part}" (1~${pageCount})`)
    return [a - 1, b - 1]
  })
}

/** "3,1,2" → 전체 페이지의 새 순서 (완전한 순열이어야 함) */
export function parseOrder(spec: string, pageCount: number): number[] {
  const nums = spec.split(',').map((s) => Number(s.trim()))
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > pageCount)) throw new Error(`순서는 1~${pageCount} 숫자를 쉼표로 나열하세요. (예: 3,1,2)`)
  if (nums.length !== pageCount || new Set(nums).size !== pageCount)
    throw new Error(`전체 ${pageCount}페이지의 순서를 빠짐없이 한 번씩 적어야 합니다. (예: ${Array.from({ length: pageCount }, (_, i) => pageCount - i).join(',')})`)
  return nums.map((n) => n - 1)
}

export async function runPdfTool(files: AppFile[], activeId: string | null, req: PdfToolRequest): Promise<NamedBytes[]> {
  if (req.op === 'merge') {
    const pdfs = files.filter((f) => f.kind === 'pdf')
    if (pdfs.length < 2) throw new Error('병합하려면 PDF가 2개 이상 필요합니다.')
    const merged = await mergePdfs(pdfs.map((f) => f.bytes))
    return [{ name: `병합_${pdfs.length}개.pdf`, bytes: merged }]
  }

  const target = files.find((f) => f.id === activeId) ?? files[0]
  if (!target || target.kind !== 'pdf') throw new Error('대상 PDF를 선택해 주세요.')
  const pageCount = (await PDFDocument.load(target.bytes)).getPageCount()
  const base = stripExt(target.name)

  switch (req.op) {
    case 'split':
      return splitPdf(target.bytes, parseRanges(req.pages, pageCount), base)
    case 'rotate': {
      const pages = req.pages.trim() ? parsePages(req.pages, pageCount) : undefined // 비우면 전체
      return [{ name: `${base}_회전.pdf`, bytes: await rotatePdf(target.bytes, req.angle, pages) }]
    }
    case 'delete': {
      const pages = parsePages(req.pages, pageCount)
      if (pages.length >= pageCount) throw new Error('모든 페이지를 삭제할 수는 없습니다.')
      return [{ name: `${base}_삭제.pdf`, bytes: await deletePages(target.bytes, pages) }]
    }
    case 'reorder':
      return [{ name: `${base}_순서변경.pdf`, bytes: await reorderPdf(target.bytes, parseOrder(req.pages, pageCount)) }]
  }
}
