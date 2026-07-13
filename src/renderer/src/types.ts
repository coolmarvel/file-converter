import { FileKind } from '@core/index'

/** 앱에 올라온 파일 하나 (바이트 원본을 그대로 보관, 원본 무수정) */
export interface AppFile {
  id: string
  name: string
  kind: FileKind
  size: number
  bytes: Uint8Array
  /** 이미지/PDF 미리보기용 object URL (없으면 미생성) */
  previewUrl?: string
  /** 원래 포맷 (HEIC/TIFF는 추가 시점에 PNG로 풀어서 kind='png'가 되므로 배지 표시용으로 보관) */
  srcKind?: FileKind
}
