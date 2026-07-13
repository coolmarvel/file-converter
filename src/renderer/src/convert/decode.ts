/**
 * 브라우저가 직접 못 여는 포맷(HEIC/TIFF)의 디코드 어댑터.
 *
 * 파일을 **추가하는 시점**에 PNG로 풀어서(AppFile.bytes 교체) 이후 파이프라인
 * (미리보기·변환)은 전부 PNG로 취급한다. 원래 포맷은 srcKind로 배지에만 남긴다.
 * heic2any(libheif 내장)·utif2 모두 순수 JS/wasm 인라인이라 오프라인 동작.
 */
import heic2any from 'heic2any'
import * as UTIF from 'utif2'
import { blobPart, canvasToBytes } from './image'

/** HEIC/HEIF → PNG 바이트 */
export async function heicToPng(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const out = await heic2any({ blob: new Blob([blobPart(bytes)], { type: 'image/heic' }), toType: 'image/png' })
  const blob = Array.isArray(out) ? out[0] : out
  return new Uint8Array(await blob.arrayBuffer())
}

/** TIFF(첫 페이지) → PNG 바이트 */
export async function tiffToPng(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  // 항상 순수 ArrayBuffer 사본을 만든다 (TS 5.7 Uint8Array 제네릭 + utif 시그니처 호환)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const buf = copy.buffer
  const ifds = UTIF.decode(buf)
  if (!ifds.length) throw new Error('TIFF를 해석하지 못했습니다.')
  UTIF.decodeImage(buf, ifds[0])
  const rgba = UTIF.toRGBA8(ifds[0])
  const width = ifds[0].width as number
  const height = ifds[0].height as number
  if (!width || !height) throw new Error('TIFF 크기를 읽지 못했습니다.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  imageData.data.set(rgba)
  ctx.putImageData(imageData, 0, 0)
  return canvasToBytes(canvas, 'image/png') as Promise<Uint8Array<ArrayBuffer>> // canvasToBytes는 항상 ArrayBuffer 기반
}
