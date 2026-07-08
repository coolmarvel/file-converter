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
}
