/**
 * AI 배경 제거 결과(투명 PNG)를 Compositor 방식으로 다듬는다 — core/matte.ts 의 캔버스 어댑터.
 * onnx 가 든 bgremove 청크와 분리해 두어, 슬라이더만 움직일 때는 모델 코드를 다시 부르지 않는다.
 */
import { MatteRefine, hasMatteRefine, refineMatte } from '@core/index'
import { loadImage, canvasToBytes, mimeFor } from './image'
import type { FileKind } from '@core/index'

/**
 * cutout(AI 결과 PNG)의 알파를 원본 이미지를 가이드로 다듬어, **원본 RGB + 다듬은 알파** PNG 로.
 * (모델이 잘라 낸 머리카락 자리의 색은 원본에만 남아 있으므로 RGB 는 원본을 쓴다)
 * limit: 계산 해상도의 긴 변 상한 — 결과 마스크는 원래 크기로 되돌려 그린다(Compositor refine 의 limit).
 */
export async function refineCutout(cutPng: Uint8Array, original: Uint8Array, originalKind: FileKind, m: MatteRefine, limit = 2048): Promise<Uint8Array> {
  if (!hasMatteRefine(m)) return cutPng
  const [cut, src] = await Promise.all([loadImage(cutPng, 'image/png'), loadImage(original, mimeFor(originalKind))])
  const W = cut.naturalWidth
  const H = cut.naturalHeight
  const k = Math.min(1, limit / Math.max(W, H))
  const w = Math.max(1, Math.round(W * k))
  const h = Math.max(1, Math.round(H * k))

  // 계산용 축소본: 가이드(원본 휘도)와 마스크(알파)
  const small = (img: HTMLImageElement): Uint8ClampedArray => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.imageSmoothingQuality = 'high'
    x.drawImage(img, 0, 0, w, h)
    return x.getImageData(0, 0, w, h).data
  }
  const g = small(src)
  const a = small(cut)
  const guide = new Float32Array(w * h)
  const mask = new Float32Array(w * h)
  for (let i = 0, p = 0; i < guide.length; i++, p += 4) {
    guide[i] = (0.299 * g[p] + 0.587 * g[p + 1] + 0.114 * g[p + 2]) / 255
    mask[i] = a[p + 3] / 255
  }
  const refined = refineMatte(mask, guide, w, h, { ...m, refine: m.refine * k, shift: m.shift * k })

  // 다듬은 마스크 → 회색 캔버스 → 원래 크기로 확대
  const mc = document.createElement('canvas')
  mc.width = w
  mc.height = h
  const mctx = mc.getContext('2d')!
  const md = mctx.createImageData(w, h)
  for (let i = 0, p = 0; i < refined.length; i++, p += 4) {
    const v = Math.round(refined[i] * 255)
    md.data[p] = md.data[p + 1] = md.data[p + 2] = v
    md.data[p + 3] = 255
  }
  mctx.putImageData(md, 0, 0)

  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const octx = out.getContext('2d', { willReadFrequently: true })!
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(mc, 0, 0, W, H)
  const maskFull = octx.getImageData(0, 0, W, H).data
  octx.clearRect(0, 0, W, H)
  octx.drawImage(src, 0, 0, W, H)
  const px = octx.getImageData(0, 0, W, H)
  for (let p = 0; p < px.data.length; p += 4) px.data[p + 3] = Math.round((px.data[p + 3] * maskFull[p]) / 255)
  octx.putImageData(px, 0, 0)
  return canvasToBytes(out, 'image/png')
}
