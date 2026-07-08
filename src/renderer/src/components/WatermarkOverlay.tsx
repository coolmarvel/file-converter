import { useEffect, useRef, useState } from 'react'
import { WatermarkOpts, drawWatermark } from '../watermark/model'
import { loadImageFromUrl } from '../convert/image'
import signUrl from '../assets/sign.png'

/** 오버레이 캔버스 백킹 해상도의 긴 변 상한(px) */
const MAX_SIDE = 2000

/**
 * 미리보기 위에 워터마크를 비대화형으로 그려 결과물을 미리 보여준다.
 * 이미지 위(z-index 1), 주석 캔버스(z-2) 아래. pointer-events 없음.
 */
export function WatermarkOverlay({ wm }: { wm: WatermarkOpts }): JSX.Element | null {
  const ref = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [sig, setSig] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (wm.type !== 'signature') return
    let ok = true
    loadImageFromUrl(signUrl)
      .then((img) => ok && setSig(img))
      .catch(() => {})
    return () => {
      ok = false
    }
  }, [wm.type])

  useEffect(() => {
    const c = ref.current
    const p = c?.parentElement
    if (!p) return
    const update = () =>
      setBox((prev) => {
        const w = p.clientWidth
        const h = p.clientHeight
        return prev.w === w && prev.h === h ? prev : { w, h } // 같은 크기면 재할당/재그리기 생략
      })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(p)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || box.w === 0) return
    // 백킹 해상도 상한 — 확대 배율 × 윈도우 DPI 배율만큼 커지면 캔버스가 수백 MB가 되어
    // (예: 400% 확대 + dpr 1.5 = 5700×8100px) 페이지 넘김마다 재생성 시 GPU/메모리 크래시.
    // 워터마크 미리보기는 장식이므로 상한을 두고 CSS로 늘려 표시한다.
    const dpr = window.devicePixelRatio || 1
    let w = box.w * dpr
    let h = box.h * dpr
    const long = Math.max(w, h)
    if (long > MAX_SIDE) {
      const k = MAX_SIDE / long
      w *= k
      h *= k
    }
    c.width = Math.max(1, Math.round(w))
    c.height = Math.max(1, Math.round(h))
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    drawWatermark(ctx, c.width, c.height, wm, sig ?? undefined)
  }, [box, wm, sig])

  if (!wm.enabled) return null
  return <canvas ref={ref} className="wm-overlay" style={{ width: '100%', height: '100%' }} />
}
