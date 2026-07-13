/**
 * 워터마크 데이터 모델 + 캔버스 렌더. 변환 출력(이미지/PDF 페이지)에 공통 적용.
 */

export type WmLayout = 'diagonal' | 'tile' | 'corner'
export type WmType = 'text' | 'signature'

export interface WatermarkOpts {
  enabled: boolean
  type: WmType
  text: string
  color: string
  opacity: number // 0..1
  sizePct: number // 1..100 (페이지 대비 상대 크기)
  layout: WmLayout
  rotationDeg: number
  /** 바둑판(tile) 간격 — 값이 클수록 워터마크 사이가 벌어진다 (base 대비 %) */
  gapPct: number
}

export const DEFAULT_WATERMARK: WatermarkOpts = {
  enabled: false,
  type: 'text',
  text: '이성현',
  color: '#888888',
  opacity: 0.35, // pdf-editor 기본과 동일 — 0.22는 사진 위에서 안 보여 "적용 안 됨"으로 오인(2026-07-13 피드백)
  sizePct: 22,
  layout: 'diagonal',
  rotationDeg: -30,
  gapPct: 45
}

const FONT = `bold {px}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', sans-serif`
type Img = HTMLImageElement | HTMLCanvasElement

function unit(ctx: CanvasRenderingContext2D, o: WatermarkOpts, sig: Img | undefined, px: number): void {
  if (o.type === 'signature' && sig) {
    const w = px
    const h = px * (sig.height / sig.width)
    ctx.drawImage(sig, -w / 2, -h / 2, w, h)
  } else {
    ctx.font = FONT.replace('{px}', String(px))
    ctx.fillStyle = o.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(o.text || '', 0, 0)
  }
}

/** 워터마크를 ctx(W×H)에 그린다. sig = 서명 이미지(서명 타입일 때). */
export function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number, o: WatermarkOpts, sig?: Img): void {
  if (!o.enabled) return
  if (o.type === 'text' && !o.text.trim()) return
  if (o.type === 'signature' && !sig) return
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity))
  const base = Math.min(W, H)
  const angle = ((o.rotationDeg || 0) * Math.PI) / 180

  if (o.layout === 'corner') {
    const pad = base * 0.04
    if (o.type === 'signature' && sig) {
      const w = base * (o.sizePct / 100) * 1.6
      const h = w * (sig.height / sig.width)
      ctx.drawImage(sig, W - w - pad, H - h - pad, w, h)
    } else {
      ctx.font = FONT.replace('{px}', String(base * (o.sizePct / 100) * 0.7))
      ctx.fillStyle = o.color
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillText(o.text || '', W - pad, H - pad)
    }
  } else if (o.layout === 'diagonal') {
    ctx.translate(W / 2, H / 2)
    ctx.rotate(angle)
    let px: number
    if (o.type === 'signature' && sig) {
      px = W * (o.sizePct / 100) * 2.2
    } else {
      ctx.font = FONT.replace('{px}', '100')
      const w = ctx.measureText(o.text || '').width || 1
      px = 100 * ((W * 0.85 * (o.sizePct / 100) * 2.6) / w)
    }
    unit(ctx, o, sig, px)
  } else {
    // tile
    ctx.translate(W / 2, H / 2)
    ctx.rotate(angle)
    const px = base * (o.sizePct / 100)
    let uw: number
    let uh: number
    if (o.type === 'signature' && sig) {
      uw = px
      uh = px * (sig.height / sig.width)
    } else {
      ctx.font = FONT.replace('{px}', String(px))
      uw = ctx.measureText(o.text || '').width || px
      uh = px
    }
    const gap = base * (Math.max(0, o.gapPct) / 100)
    const stepX = uw + gap
    const stepY = uh + gap
    const D = Math.hypot(W, H) / 2 + Math.max(stepX, stepY)
    for (let y = -D; y <= D; y += stepY) {
      for (let x = -D; x <= D; x += stepX) {
        ctx.save()
        ctx.translate(x, y)
        unit(ctx, o, sig, px)
        ctx.restore()
      }
    }
  }
  ctx.restore()
}
