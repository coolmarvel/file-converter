/**
 * ICO 인코더 (순수 TS — 테스트 가능).
 *
 * Vista+ 방식: 각 항목에 PNG 바이트를 그대로 임베드한다 (BMP 변환 불필요, 알파 보존).
 * 렌더러가 크기별(16~256px)로 PNG를 만들어 넘기면 여기서 컨테이너만 조립한다.
 */

export interface IcoEntry {
  /** 한 변 픽셀 (정사각형, 최대 256) */
  size: number
  /** 해당 크기의 PNG 인코딩 바이트 */
  png: Uint8Array
}

/** 파비콘/앱 아이콘에 쓰는 표준 크기 세트 */
export const ICO_SIZES = [256, 128, 64, 48, 32, 16] as const

export function encodeIco(entries: IcoEntry[]): Uint8Array {
  if (entries.length === 0) throw new Error('ICO에 넣을 이미지가 없습니다.')
  if (entries.length > 255) throw new Error('ICO 항목은 최대 255개입니다.')
  const headerSize = 6 + entries.length * 16
  const total = headerSize + entries.reduce((s, e) => s + e.png.length, 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)

  // ICONDIR
  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type 1 = icon
  view.setUint16(4, entries.length, true)

  let offset = headerSize
  entries.forEach((e, i) => {
    const base = 6 + i * 16
    const side = e.size >= 256 ? 0 : e.size // 256은 0으로 표기하는 규약
    out[base] = side // width
    out[base + 1] = side // height
    out[base + 2] = 0 // palette 없음
    out[base + 3] = 0 // reserved
    view.setUint16(base + 4, 1, true) // planes
    view.setUint16(base + 6, 32, true) // bpp
    view.setUint32(base + 8, e.png.length, true)
    view.setUint32(base + 12, offset, true)
    out.set(e.png, offset)
    offset += e.png.length
  })
  return out
}
