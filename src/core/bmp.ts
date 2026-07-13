/**
 * 24비트 BMP 인코더 (순수 TS — 테스트 가능).
 *
 * canvas.toBlob 은 BMP 인코딩을 지원하지 않아 직접 만든다.
 * BITMAPINFOHEADER + BI_RGB(무압축) + 하단부터 위로(bottom-up) + 행 4바이트 패딩.
 * 입력은 canvas getImageData 의 RGBA. BMP 는 알파가 없으므로 호출측이 흰 배경에
 * 미리 합성해 두는 것을 전제로 알파 채널은 버린다.
 */

export function encodeBmp(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (width <= 0 || height <= 0) throw new Error('BMP 크기가 잘못되었습니다.')
  if (rgba.length < width * height * 4) throw new Error('BMP 픽셀 데이터가 부족합니다.')

  const rowSize = Math.ceil((width * 3) / 4) * 4 // 행마다 4바이트 배수로 패딩
  const pixelBytes = rowSize * height
  const headerSize = 14 + 40 // 파일 헤더 + BITMAPINFOHEADER
  const fileSize = headerSize + pixelBytes

  const out = new Uint8Array(fileSize)
  const view = new DataView(out.buffer)

  // ── 파일 헤더 (14바이트) ──
  out[0] = 0x42 // 'B'
  out[1] = 0x4d // 'M'
  view.setUint32(2, fileSize, true)
  view.setUint32(10, headerSize, true) // 픽셀 데이터 시작 오프셋

  // ── BITMAPINFOHEADER (40바이트) ──
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true) // 양수 = bottom-up
  view.setUint16(26, 1, true) // planes
  view.setUint16(28, 24, true) // bpp
  view.setUint32(30, 0, true) // BI_RGB (무압축)
  view.setUint32(34, pixelBytes, true)
  view.setInt32(38, 2835, true) // 72 DPI (px/m)
  view.setInt32(42, 2835, true)

  // ── 픽셀: 아랫줄부터, RGBA → BGR ──
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4
    let dst = headerSize + y * rowSize
    for (let x = 0; x < width; x++) {
      const src = srcRow + x * 4
      out[dst++] = rgba[src + 2] // B
      out[dst++] = rgba[src + 1] // G
      out[dst++] = rgba[src] // R
    }
  }
  return out
}
