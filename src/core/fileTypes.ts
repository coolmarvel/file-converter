/**
 * 파일 형식 정의와 감지 로직 (순수 TS — Electron/DOM 무관, CLI·테스트로 검증 가능).
 *
 * "이 파일이 무엇인가"는 확장자만 믿지 않고 매직 바이트(파일 앞부분)로 확인한다.
 * DICOM은 특히 확장자가 없거나 제각각이라 128바이트 뒤의 "DICM" 마커로 판별한다.
 */

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'dicom' | 'unknown'

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
  dicom: { kind: 'dicom', label: 'DICOM', isImage: false, extensions: ['dcm', 'dicom'], mime: 'application/dicom' },
  unknown: { kind: 'unknown', label: '알 수 없음', isImage: false, extensions: [] }
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false
  }
  return true
}

/**
 * 파일 내용(앞부분 바이트)과 이름으로 형식을 감지한다.
 * header 는 최소 132바이트 정도면 DICOM까지 판별 가능. 없으면 확장자로 폴백.
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
    // DICOM: 128바이트 프리앰블 뒤 "DICM"
    if (startsWith(header, [0x44, 0x49, 0x43, 0x4d], 128)) return 'dicom'
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
