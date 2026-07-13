/**
 * 파일 형식 정의와 감지 로직 (순수 TS — Electron/DOM 무관, CLI·테스트로 검증 가능).
 *
 * "이 파일이 무엇인가"는 확장자만 믿지 않고 매직 바이트(파일 앞부분)로 확인한다.
 * SVG만 예외적으로 텍스트라서 앞부분에 "<svg" 문자열이 있는지로 판별한다.
 */

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'bmp' | 'gif' | 'svg' | 'avif' | 'heic' | 'tiff' | 'ico' | 'unknown'

export interface FormatInfo {
  kind: FileKind
  label: string
  /** 이미지 계열인지 (여러 곳에서 "이미지끼리/이미지→X" 판단에 사용) */
  isImage: boolean
  extensions: string[]
  mime?: string
}

export const FORMATS: Record<FileKind, FormatInfo> = {
  pdf: { kind: 'pdf', label: 'PDF', isImage: false, extensions: ['pdf'], mime: 'application/pdf' },
  png: { kind: 'png', label: 'PNG', isImage: true, extensions: ['png'], mime: 'image/png' },
  jpeg: { kind: 'jpeg', label: 'JPEG', isImage: true, extensions: ['jpg', 'jpeg'], mime: 'image/jpeg' },
  webp: { kind: 'webp', label: 'WebP', isImage: true, extensions: ['webp'], mime: 'image/webp' },
  bmp: { kind: 'bmp', label: 'BMP', isImage: true, extensions: ['bmp'], mime: 'image/bmp' },
  gif: { kind: 'gif', label: 'GIF', isImage: true, extensions: ['gif'], mime: 'image/gif' },
  svg: { kind: 'svg', label: 'SVG', isImage: true, extensions: ['svg'], mime: 'image/svg+xml' },
  avif: { kind: 'avif', label: 'AVIF', isImage: true, extensions: ['avif'], mime: 'image/avif' },
  heic: { kind: 'heic', label: 'HEIC', isImage: true, extensions: ['heic', 'heif'], mime: 'image/heic' },
  tiff: { kind: 'tiff', label: 'TIFF', isImage: true, extensions: ['tif', 'tiff'], mime: 'image/tiff' },
  ico: { kind: 'ico', label: 'ICO', isImage: true, extensions: ['ico'], mime: 'image/x-icon' },
  unknown: { kind: 'unknown', label: '알 수 없음', isImage: false, extensions: [] }
}

/** 저장 파일명에 붙일 대표 확장자 (jpeg → "jpg") */
export function extFor(kind: FileKind): string {
  return FORMATS[kind].extensions[0] ?? 'bin'
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false
  }
  return true
}

/** 앞부분 바이트를 ASCII로 풀어 SVG 마커("<svg")를 찾는다 (BOM/xml 선언/주석 허용) */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = Array.from(bytes.subarray(0, Math.min(bytes.length, 512)))
    .map((b) => String.fromCharCode(b))
    .join('')
    .toLowerCase()
  return head.includes('<svg')
}

/**
 * 파일 내용(앞부분 바이트)과 이름으로 형식을 감지한다.
 * header 는 512바이트 정도면 SVG까지 판별 가능. 없으면 확장자로 폴백.
 */
export function detectFileKind(fileName: string, header?: Uint8Array): FileKind {
  if (header && header.length > 0) {
    // %PDF
    if (startsWith(header, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
    // PNG \x89PNG\r\n\x1a\n
    if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
    // JPEG FF D8 FF
    if (startsWith(header, [0xff, 0xd8, 0xff])) return 'jpeg'
    // WebP: "RIFF"...."WEBP"
    if (startsWith(header, [0x52, 0x49, 0x46, 0x46]) && startsWith(header, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
    // GIF: "GIF87a"/"GIF89a"
    if (startsWith(header, [0x47, 0x49, 0x46, 0x38])) return 'gif'
    // BMP: "BM"
    if (startsWith(header, [0x42, 0x4d])) return 'bmp'
    // ISO-BMFF "ftyp" 박스 브랜드로 AVIF/HEIC 구분
    if (startsWith(header, [0x66, 0x74, 0x79, 0x70], 4)) {
      const brand = String.fromCharCode(header[8] ?? 0, header[9] ?? 0, header[10] ?? 0, header[11] ?? 0)
      if (brand === 'avif' || brand === 'avis') return 'avif'
      if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic'
    }
    // TIFF: "II*\0"(리틀엔디언) 또는 "MM\0*"(빅엔디언)
    if (startsWith(header, [0x49, 0x49, 0x2a, 0x00]) || startsWith(header, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff'
    // ICO: 예약 0, 타입 1
    if (startsWith(header, [0x00, 0x00, 0x01, 0x00])) return 'ico'
    if (looksLikeSvg(header)) return 'svg'
  }
  return kindFromExtension(fileName)
}

export function kindFromExtension(fileName: string): FileKind {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  for (const info of Object.values(FORMATS)) {
    if (info.extensions.includes(ext)) return info.kind
  }
  return 'unknown'
}
