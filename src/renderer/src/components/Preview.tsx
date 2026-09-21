import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import GridOnRounded from '@mui/icons-material/GridOnRounded'
import { Adjustments, hasAdjust, applyAdjustments, CanvasSizeOptions, changesCanvas, canvasTarget, anchorOffset } from '@core/index'
import type { PdfHandle } from '../convert/pdf' // 런타임(pdf.js)은 PDF 소스일 때만 지연 로딩
import { bytesToUrl, targetSize, ResizeOpts, Transform, CropRect, hasCrop, loadImageFromUrl, removeWhitePixels } from '../convert/image'
import { WatermarkOpts } from '../watermark/model'
import { WatermarkOverlay } from './WatermarkOverlay'
import { ui } from '../theme'

const { color, chrome, size, space, font, surface } = ui
const pct = (v: number): string => `${v * 100}%`

/** 화면 배율(출력 1px 당 CSS px) 범위 */
const MIN_SCALE = 0.02
const MAX_SCALE = 32
/** 이 배율 이상이면 픽셀 그리드 (Compositor: 확대 시 픽셀 격자) */
const GRID_FROM = 8
/** 미리보기 픽셀 패스(보정·흰색제거) 작업 해상도 상한 */
const PASS_MAX_SIDE = 1600

// ── 자르기 ────────────────────────────────────────────────────────────────

type Corner = 'nw' | 'ne' | 'sw' | 'se'
type CropDrag =
  { kind: 'new'; ax: number; ay: number } | { kind: 'move'; startX: number; startY: number; orig: CropRect } | { kind: 'resize'; ax: number; ay: number; cx: number; cy: number; ratio: number }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * 앵커 (ax,ay) 에서 포인터 (px,py) 까지의 사각형.
 * r = 정규화 좌표 기준 가로/세로 비 (null = 자유), sym = 앵커가 가운데(Alt 대칭 — Compositor Option 대칭 자르기).
 * 비율이 있으면 프레임 밖으로 나가지 않게 비율을 지킨 채 줄인다.
 */
function rectFrom(ax: number, ay: number, px: number, py: number, r: number | null, sym: boolean): CropRect {
  const sx = px >= ax ? 1 : -1
  const sy = py >= ay ? 1 : -1
  let w = Math.abs(px - ax)
  let h = Math.abs(py - ay)
  const maxW = sym ? Math.min(ax, 1 - ax) : sx > 0 ? 1 - ax : ax
  const maxH = sym ? Math.min(ay, 1 - ay) : sy > 0 ? 1 - ay : ay
  if (r) {
    w = Math.max(w, h * r)
    w = Math.min(w, maxW, maxH * r)
    h = w / r
  } else {
    w = Math.min(w, maxW)
    h = Math.min(h, maxH)
  }
  if (sym) return { x: ax - w, y: ay - h, w: w * 2, h: h * 2 }
  return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h }
}

/** 가장자리·가운데 스냅 (자유 비율일 때만) — 움직이는 변을 0/0.5/1 에 붙인다 */
function snapRect(c: CropRect, tolX: number, tolY: number, move: boolean): CropRect {
  const snap = (v: number, tol: number): number => {
    for (const t of [0, 0.5, 1]) if (Math.abs(v - t) < tol) return t
    return v
  }
  if (move) {
    // 왼쪽·오른쪽·가운데 중 가장 가까운 것 하나로
    const cands = [
      { v: c.x, off: 0 },
      { v: c.x + c.w, off: c.w },
      { v: c.x + c.w / 2, off: c.w / 2 }
    ]
    let x = c.x
    for (const k of cands) {
      const s = snap(k.v, tolX)
      if (s !== k.v) {
        x = s - k.off
        break
      }
    }
    const candsY = [
      { v: c.y, off: 0 },
      { v: c.y + c.h, off: c.h },
      { v: c.y + c.h / 2, off: c.h / 2 }
    ]
    let y = c.y
    for (const k of candsY) {
      const s = snap(k.v, tolY)
      if (s !== k.v) {
        y = s - k.off
        break
      }
    }
    return { ...c, x: Math.min(1 - c.w, Math.max(0, x)), y: Math.min(1 - c.h, Math.max(0, y)) }
  }
  const x1 = snap(c.x, tolX)
  const y1 = snap(c.y, tolY)
  const x2 = snap(c.x + c.w, tolX)
  const y2 = snap(c.y + c.h, tolY)
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) }
}

/**
 * 자르기 레이어 — 프레임 위에서 드래그로 영역을 그리고(그림판 방식), 안쪽 드래그 = 이동, 모서리 = 크기 조절.
 * Shift = 비율 고정, Alt = 가운데 기준 대칭, 자유 비율이면 가장자리·가운데에 스냅.
 * 바깥은 어둡게 — 어디까지 잘리는지 보인다. 좌표는 프레임 기준 0~1 (변환 파이프라인의 CropRect 와 동일).
 */
function CropLayer({
  crop,
  active,
  onCrop,
  aspect,
  frame
}: {
  crop: CropRect | null
  active: boolean
  onCrop: (c: CropRect | null) => void
  /** 출력 픽셀 기준 가로/세로 비 (null = 자유) */
  aspect: number | null
  /** 프레임 화면 크기(CSS px) — 비율·스냅 환산용 */
  frame: { w: number; h: number }
}): JSX.Element | null {
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<CropDrag | null>(null)

  if (!active && !hasCrop(crop)) return null

  // 출력 비율 → 정규화 좌표 비율 (프레임이 정사각이 아니면 다르다)
  const toNorm = (a: number): number => (a * frame.h) / Math.max(1, frame.w)
  const tolX = 6 / Math.max(1, frame.w)
  const tolY = 6 / Math.max(1, frame.h)

  const norm = (e: React.PointerEvent): { x: number; y: number } => {
    const r = boxRef.current!.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }
  const ratioFor = (e: React.PointerEvent, current: number | null): number | null => {
    if (aspect) return toNorm(aspect)
    if (e.shiftKey) return current ?? toNorm(1)
    return null
  }

  const down = (e: React.PointerEvent, drag: CropDrag): void => {
    if (!active) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = drag
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d) return
    const p = norm(e)
    if (d.kind === 'move') {
      const next = { ...d.orig, x: Math.min(1 - d.orig.w, Math.max(0, d.orig.x + p.x - d.startX)), y: Math.min(1 - d.orig.h, Math.max(0, d.orig.y + p.y - d.startY)) }
      onCrop(snapRect(next, tolX, tolY, true))
      return
    }
    const sym = e.altKey
    const ax = d.kind === 'resize' && sym ? d.cx : d.ax
    const ay = d.kind === 'resize' && sym ? d.cy : d.ay
    const r = ratioFor(e, d.kind === 'resize' ? d.ratio : null)
    const rect = rectFrom(ax, ay, p.x, p.y, r, sym)
    onCrop(r ? rect : snapRect(rect, tolX, tolY, false))
  }
  const up = (): void => {
    const d = dragRef.current
    dragRef.current = null
    // 클릭만 하고 끝난 티끌 영역은 취소로 간주
    if (d && crop && (crop.w < 0.01 || crop.h < 0.01)) onCrop(null)
  }

  const corners: { corner: Corner; cursor: string }[] = [
    { corner: 'nw', cursor: 'nwse-resize' },
    { corner: 'ne', cursor: 'nesw-resize' },
    { corner: 'sw', cursor: 'nesw-resize' },
    { corner: 'se', cursor: 'nwse-resize' }
  ]

  return (
    <Box
      ref={boxRef}
      onPointerDown={(e) => {
        if (!active) return
        const p = norm(e)
        down(e, { kind: 'new', ax: p.x, ay: p.y })
        onCrop({ x: p.x, y: p.y, w: 0, h: 0 })
      }}
      onPointerMove={move}
      onPointerUp={up}
      sx={{ position: 'absolute', inset: 0, zIndex: 3, overflow: 'hidden', cursor: active ? 'crosshair' : 'default', pointerEvents: active ? 'auto' : 'none', touchAction: 'none' }}
    >
      {hasCrop(crop) && (
        <Box
          onPointerDown={(e) => {
            const p = norm(e)
            down(e, { kind: 'move', startX: p.x, startY: p.y, orig: crop })
          }}
          onPointerMove={move}
          onPointerUp={up}
          sx={{
            position: 'absolute',
            left: pct(crop.x),
            top: pct(crop.y),
            width: pct(crop.w),
            height: pct(crop.h),
            outline: `1px dashed ${color.canvas}`,
            border: `1px dashed ${color.accent}`,
            boxShadow: '0 0 0 100000px rgba(0, 0, 0, 0.55)', // 바깥 어둡게 = 잘려나갈 부분
            cursor: active ? 'move' : 'default',
            pointerEvents: active ? 'auto' : 'none',
            touchAction: 'none',
            // 3분할 안내선 (구도 잡기)
            backgroundImage: active
              ? `linear-gradient(to right, transparent 33.2%, rgba(255,255,255,.35) 33.2%, rgba(255,255,255,.35) 33.5%, transparent 33.5%, transparent 66.5%, rgba(255,255,255,.35) 66.5%, rgba(255,255,255,.35) 66.8%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,.35) 33.2%, rgba(255,255,255,.35) 33.5%, transparent 33.5%, transparent 66.5%, rgba(255,255,255,.35) 66.5%, rgba(255,255,255,.35) 66.8%, transparent 66.8%)`
              : 'none'
          }}
        >
          {active &&
            corners.map((h) => (
              <Box
                key={h.corner}
                onPointerDown={(e) => {
                  const ax = h.corner.includes('w') ? crop.x + crop.w : crop.x
                  const ay = h.corner.includes('n') ? crop.y + crop.h : crop.y
                  down(e, { kind: 'resize', ax, ay, cx: crop.x + crop.w / 2, cy: crop.y + crop.h / 2, ratio: crop.w / crop.h })
                }}
                onPointerMove={move}
                onPointerUp={up}
                sx={{
                  position: 'absolute',
                  left: h.corner.includes('w') ? -5 : 'auto',
                  right: h.corner.includes('e') ? -5 : 'auto',
                  top: h.corner.includes('n') ? -5 : 'auto',
                  bottom: h.corner.includes('s') ? -5 : 'auto',
                  width: 9,
                  height: 9,
                  bgcolor: color.canvas,
                  border: `1px solid ${color.text}`,
                  cursor: h.cursor,
                  touchAction: 'none'
                }}
              />
            ))}
        </Box>
      )}
    </Box>
  )
}

// ── 미리보기 ─────────────────────────────────────────────────────────────

/**
 * 미리보기 소스.
 * - images: object URL 배열. **URL 소유권은 호출측(App)** — Preview는 revoke하지 않는다.
 * - pdf: 페이지 수를 pdf.js로 조회하고 현재 페이지만 지연 렌더. 렌더 URL은 **Preview 소유**.
 */
export type PreviewSource = { type: 'images'; urls: string[] } | { type: 'pdf'; bytes: Uint8Array; scale: number } | null

function keyOf(source: PreviewSource): string {
  if (!source) return 'none'
  return source.type === 'images' ? `img:${source.urls.join('|')}` : `pdf:${source.bytes.length}:${source.scale}`
}

export interface PreviewHandle {
  zoomIn(): void
  zoomOut(): void
  fit(): void
  actual(): void
}

export interface PreviewProps {
  source: PreviewSource
  /** 변환 옵션을 미리보기에 실시간 반영 — 보이는 그대로가 결과물 */
  watermark?: WatermarkOpts
  transform?: Transform
  resize?: ResizeOpts
  adjust?: Adjustments
  canvasSize?: CanvasSizeOptions | null
  /** 자르기: 영역(정규화)과 편집 모드, 비율(출력 px 기준) */
  crop?: CropRect | null
  cropMode?: boolean
  cropAspect?: number | null
  onCrop?: (c: CropRect | null) => void
  /** 흰색→투명 실시간 미리보기 (null=끔) */
  whiteTolerance?: number | null
  /** 투명 배경 모드 — 체커보드 배경으로 투명 영역을 보여준다 */
  transparent?: boolean
  /**
   * 렌더 미리보기(v1.5.0): 필터·효과·내용 인식 채우기처럼 CSS 로 흉내 낼 수 없는 옵션이 켜지면 App 이 실제 파이프라인을
   * 축소 배율로 돌린 결과를 소스로 넘긴다. 이때 이미지 픽셀 크기가 아니라 이 값(출력 픽셀)을 프레임 크기로 쓴다.
   */
  natOverride?: { w: number; h: number } | null
  /** 출력 프레임 크기(px)·배율 보고 — 상태 줄·자르기 수치 입력용 */
  onFrame?: (info: { w: number; h: number; zoomPct: number; page: number; pages: number } | null) => void
}

/** 체커보드 (투명 표시) — 어두운 뷰어에 맞춘 어두운 두 칸 */
const checkerSx = {
  backgroundColor: color.checkerA,
  backgroundImage: `linear-gradient(45deg, ${color.checkerB} 25%, transparent 25%, transparent 75%, ${color.checkerB} 75%), linear-gradient(45deg, ${color.checkerB} 25%, transparent 25%, transparent 75%, ${color.checkerB} 75%)`,
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px'
} as const

export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  {
    source,
    watermark,
    transform,
    resize,
    adjust,
    canvasSize = null,
    crop = null,
    cropMode = false,
    cropAspect = null,
    onCrop,
    whiteTolerance = null,
    transparent = false,
    natOverride = null,
    onFrame
  },
  ref
): JSX.Element {
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false) // 페이지 넘김 중 (이전 페이지는 계속 표시)
  const [zoom, setZoom] = useState<number | null>(null) // null = 화면에 맞춤, 숫자 = 출력 1px 당 CSS px
  const [grid, setGrid] = useState(true)
  const [stage, setStageSize] = useState({ w: 0, h: 0 })
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null) // 현재 표시 중인 이미지의 원본 픽셀 크기
  const roRef = useRef<ResizeObserver | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const wheelOff = useRef<(() => void) | null>(null)
  const stepZoomRef = useRef<(dir: 1 | -1) => void>(() => {}) // 휠·명령이 최신 배율 계산을 쓰도록
  const pdfCache = useRef<Map<number, string>>(new Map())
  // PDF 문서는 소스당 한 번만 열고 재사용 — 페이지 넘김마다 재파싱하면 대용량에서 크래시
  const pdfDoc = useRef<PdfHandle | null>(null)
  const renderGen = useRef(0) // 연타 시 이전(무효) 렌더 결과를 버리기 위한 세대 번호

  const sourceKey = keyOf(source)

  // 스테이지 크기 추적 — 콜백 ref로 붙여야 스테이지가 뒤늦게 마운트돼도 측정된다
  const setStage = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    wheelOff.current?.()
    stageRef.current = el
    if (!el) return
    const update = (): void => setStageSize({ w: el.clientWidth - 2 * space.lg, h: el.clientHeight - 2 * space.lg })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    roRef.current = ro
    // Ctrl+휠 = 확대/축소 — passive 리스너로는 preventDefault 가 안 돼서 직접, 스테이지당 한 번만 붙인다
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      stepZoomRef.current(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    wheelOff.current = () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 소스 바뀌면 배율·원본 크기 초기화 (페이지 넘김은 유지 — 같은 문서는 보통 페이지 크기가 같아 깜빡임 방지)
  useEffect(() => {
    setZoom(null)
    setNat(null)
  }, [sourceKey])

  // ── 픽셀 패스: 보정 + 흰색제거를 원본 단계에서 (픽셀별 연산이라 기하와 순서가 무관 — image.ts finishCanvas 주석)
  // 디코드 결과(축소본 ImageData)는 url 당 한 번만 만들고, 슬라이더가 움직일 때마다 복사본에만 연산한다.
  const baseRef = useRef<{ url: string; data: ImageData } | null>(null)
  const [passUrl, setPassUrl] = useState<{ src: string; key: string; out: string } | null>(null)
  const passOn = hasAdjust(adjust) || whiteTolerance != null
  const passKey = passOn ? JSON.stringify([adjust && hasAdjust(adjust) ? adjust : null, whiteTolerance]) : ''
  useEffect(() => {
    if (!passOn || !url) {
      setPassUrl(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        if (baseRef.current?.url !== url) {
          const img = await loadImageFromUrl(url)
          const k = Math.min(1, PASS_MAX_SIDE / Math.max(1, img.naturalWidth, img.naturalHeight))
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(img.naturalWidth * k))
          c.height = Math.max(1, Math.round(img.naturalHeight * k))
          const x = c.getContext('2d', { willReadFrequently: true })!
          x.imageSmoothingQuality = 'high'
          x.drawImage(img, 0, 0, c.width, c.height)
          baseRef.current = { url, data: x.getImageData(0, 0, c.width, c.height) }
        }
        if (cancelled) return
        const base = baseRef.current.data
        const work = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
        if (adjust && hasAdjust(adjust)) applyAdjustments(work.data, adjust)
        if (whiteTolerance != null) removeWhitePixels(work.data, whiteTolerance)
        const c = document.createElement('canvas')
        c.width = work.width
        c.height = work.height
        c.getContext('2d')!.putImageData(work, 0, 0)
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
        if (cancelled || !blob) return
        const out = URL.createObjectURL(blob)
        setPassUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev.out)
          return { src: url, key: passKey, out }
        })
      } catch {
        if (!cancelled) setPassUrl(null)
      }
    }, 90)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, passKey])

  const displayUrl = passOn && passUrl && passUrl.src === url ? passUrl.out : url

  useEffect(() => {
    setPage(0)
    for (const u of pdfCache.current.values()) URL.revokeObjectURL(u)
    pdfCache.current = new Map()
    pdfDoc.current?.destroy().catch(() => {})
    pdfDoc.current = null

    if (!source) {
      setCount(0)
      setUrl(null)
      return
    }
    if (source.type === 'images') {
      setCount(source.urls.length)
      return
    }
    let cancelled = false
    setCount(0)
    setUrl(null)
    import('../convert/pdf')
      .then(({ openPdf }) => openPdf(source.bytes))
      .then((h) => {
        if (cancelled) {
          h.destroy().catch(() => {})
          return
        }
        pdfDoc.current = h
        setCount(h.numPages)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])

  useEffect(() => {
    if (!source || count === 0) {
      setUrl(null)
      setLoading(false)
      return
    }
    if (source.type === 'images') {
      setUrl(source.urls[page] ?? null)
      setLoading(false)
      return
    }
    const cached = pdfCache.current.get(page)
    if (cached) {
      setUrl(cached)
      setLoading(false)
      return
    }
    const doc = pdfDoc.current
    if (!doc) return
    const gen = ++renderGen.current
    setLoading(true)
    doc
      .renderPagePng(page, source.scale)
      .then((png) => {
        if (gen !== renderGen.current || pdfDoc.current !== doc) return // 더 최근 요청이 있거나 소스가 바뀜
        const u = bytesToUrl(png, 'image/png')
        pdfCache.current.set(page, u)
        setUrl(u)
        setLoading(false)
      })
      .catch(() => {
        if (gen === renderGen.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, page, count])

  useEffect(() => {
    return () => {
      for (const u of pdfCache.current.values()) URL.revokeObjectURL(u)
      pdfDoc.current?.destroy().catch(() => {})
      pdfDoc.current = null
    }
  }, [])

  // ── 기하: 원본 → 리사이즈 → 회전 → 캔버스 크기(종이). 종이가 곧 출력 프레임 ──
  const rot = transform?.rotate ?? 0
  const swap = rot === 90 || rot === 270
  let geo: {
    eff: { width: number; height: number }
    box: { w: number; h: number } // 회전 반영된 이미지 박스 (출력 px)
    paper: { w: number; h: number } // 캔버스 크기 반영된 종이 (출력 px)
    off: { dx: number; dy: number }
    fit: number
  } | null = null
  if (stage.w > 0 && stage.h > 0 && nat) {
    const base = natOverride ?? nat
    const eff = targetSize(base.w, base.h, resize)
    const box = { w: swap ? eff.height : eff.width, h: swap ? eff.width : eff.height }
    const hasCanvas = changesCanvas(box.w, box.h, canvasSize)
    const t = hasCanvas ? canvasTarget(box.w, box.h, canvasSize!) : { width: box.w, height: box.h }
    const off = hasCanvas ? anchorOffset(box.w, box.h, t.width, t.height, canvasSize!.anchor) : { dx: 0, dy: 0 }
    geo = { eff, box, paper: { w: t.width, h: t.height }, off, fit: Math.min(stage.w / t.width, stage.h / t.height) }
  }
  const scale = geo ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom ?? geo.fit)) : 1

  // 상태 줄·자르기 수치 입력에 프레임 정보 보고
  const frameKey = geo ? `${geo.paper.w}x${geo.paper.h}@${Math.round(scale * 100)}:${page}/${count}` : ''
  useEffect(() => {
    onFrame?.(geo ? { w: geo.paper.w, h: geo.paper.h, zoomPct: Math.round(scale * 100), page, pages: count } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey])

  // 배율 단계 — 클래식 뷰어의 고정 단계(Photoshop 식)
  const STEPS = [0.02, 0.05, 0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32]
  const stepZoom = (dir: 1 | -1): void => {
    const cur = scale
    const next = dir > 0 ? (STEPS.find((s) => s > cur * 1.001) ?? MAX_SCALE) : ([...STEPS].reverse().find((s) => s < cur * 0.999) ?? MIN_SCALE)
    setZoom(next)
  }
  stepZoomRef.current = stepZoom
  useImperativeHandle(ref, () => ({ zoomIn: () => stepZoomRef.current(1), zoomOut: () => stepZoomRef.current(-1), fit: () => setZoom(null), actual: () => setZoom(1) }), [])

  if (!source || count === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: color.viewer, color: color.textMuted }}>
        {source ? '불러오는 중…' : '파일을 선택하면 미리보기가 표시됩니다.'}
      </Box>
    )
  }

  const paperPx = geo ? { w: Math.max(1, Math.round(geo.paper.w * scale)), h: Math.max(1, Math.round(geo.paper.h * scale)) } : null
  const imgTransform = `translate(-50%, -50%) rotate(${rot}deg) scale(${transform?.flipH ? -1 : 1}, ${transform?.flipV ? -1 : 1})`
  const imgFilter = transform?.grayscale ? 'grayscale(1)' : 'none'
  const pixelated = scale >= 4
  const paperBg =
    canvasSize && changesCanvas(geo?.box.w ?? 0, geo?.box.h ?? 0, canvasSize) && canvasSize.background
      ? { bgcolor: canvasSize.background }
      : transparent || (canvasSize && !canvasSize.background)
        ? checkerSx
        : null

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 뷰어 툴바 — 배율·맞춤·실제 크기·그리드·페이지 */}
      <Box
        sx={{
          height: size.toolBar - 4,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: `${space.xs}px`,
          px: `${space.sm}px`,
          background: surface.toolbar,
          borderBottom: `1px solid ${chrome.frame}`
        }}
      >
        <IconButton onClick={() => stepZoom(-1)} disabled={scale <= MIN_SCALE} aria-label="축소" title="축소 (Ctrl+-)">
          <RemoveRounded />
        </IconButton>
        <Box className="tnum" sx={{ minWidth: 44, textAlign: 'center', fontSize: font.md }}>
          {Math.round(scale * 100)}%
        </Box>
        <IconButton onClick={() => stepZoom(1)} disabled={scale >= MAX_SCALE} aria-label="확대" title="확대 (Ctrl+=)">
          <AddRounded />
        </IconButton>
        <Button variant="outlined" onClick={() => setZoom(null)} sx={{ height: size.ctlSm, px: `${space.base}px` }} title="화면에 맞춤 (Ctrl+0)">
          맞춤
        </Button>
        <Button variant="outlined" onClick={() => setZoom(1)} sx={{ height: size.ctlSm, px: `${space.base}px` }} title="실제 크기 100% (Ctrl+1)">
          100%
        </Button>
        <IconButton onClick={() => setGrid((g) => !g)} aria-pressed={grid} title={`픽셀 그리드 (${GRID_FROM * 100}% 이상에서 표시)`} sx={grid ? { color: color.accent } : undefined}>
          <GridOnRounded />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        {count > 1 && (
          <>
            <IconButton disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="이전 페이지" title="이전 페이지 (PageUp)">
              <ChevronLeftRounded />
            </IconButton>
            <Box className="tnum" sx={{ minWidth: 56, textAlign: 'center' }}>
              {page + 1} / {count}
            </Box>
            <IconButton disabled={page >= count - 1} onClick={() => setPage((p) => Math.min(count - 1, p + 1))} aria-label="다음 페이지" title="다음 페이지 (PageDown)">
              <ChevronRightRounded />
            </IconButton>
          </>
        )}
      </Box>

      <Box
        ref={setStage}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'PageDown') setPage((p) => Math.min(count - 1, p + 1))
          if (e.key === 'PageUp') setPage((p) => Math.max(0, p - 1))
        }}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', bgcolor: color.viewer, p: `${space.lg}px`, outline: 'none' }}
      >
        {url ? (
          <Box
            sx={{
              position: 'relative',
              m: 'auto',
              flexShrink: 0,
              lineHeight: 0,
              width: paperPx?.w,
              height: paperPx?.h,
              overflow: 'hidden',
              outline: `1px solid ${color.checkerA}`,
              ...paperBg
            }}
          >
            {/* 이미지 박스 — 캔버스 크기 앵커 위치 (회전 반영 크기) */}
            <Box sx={geo ? { position: 'absolute', left: geo.off.dx * scale, top: geo.off.dy * scale, width: geo.box.w * scale, height: geo.box.h * scale } : { position: 'relative' }}>
              <Box
                component="img"
                src={displayUrl ?? undefined}
                alt="미리보기"
                draggable={false}
                onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  const el = e.currentTarget
                  // 픽셀 패스 결과(축소본)가 아니라 원본이 로드됐을 때만 원본 크기를 갱신
                  if (el.src !== url) return
                  if (el.naturalWidth && el.naturalHeight) setNat({ w: el.naturalWidth, h: el.naturalHeight })
                }}
                sx={
                  geo
                    ? {
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: geo.eff.width * scale,
                        height: geo.eff.height * scale,
                        maxWidth: 'none',
                        transform: imgTransform,
                        filter: imgFilter,
                        imageRendering: pixelated ? 'pixelated' : 'auto'
                      }
                    : // 원본 크기 측정 전 폴백: CSS contain으로 화면 안에 가둔다
                      { maxWidth: '100%', maxHeight: stage.h > 0 ? `${stage.h}px` : '100%', display: 'block', filter: imgFilter }
                }
              />
            </Box>
            {grid && scale >= GRID_FROM && (
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 2,
                  pointerEvents: 'none',
                  backgroundImage: 'linear-gradient(to right, rgba(128,128,128,.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,.45) 1px, transparent 1px)',
                  backgroundSize: `${scale}px ${scale}px`
                }}
              />
            )}
            {loading && (
              <Box
                sx={{
                  position: 'absolute',
                  top: space.base,
                  left: space.base,
                  zIndex: 4,
                  bgcolor: color.warningSubtle,
                  border: `1px solid ${color.borderStrong}`,
                  px: `${space.md}px`,
                  lineHeight: '18px',
                  fontSize: font.xs
                }}
              >
                불러오는 중…
              </Box>
            )}
            {watermark?.enabled &&
              (hasCrop(crop) ? (
                // 워터마크는 잘린 결과물 기준으로 배치된다(변환 순서: 자르기 → 워터마크) — 미리보기도 crop 영역 안에
                <Box sx={{ position: 'absolute', left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h), pointerEvents: 'none', overflow: 'hidden' }}>
                  <WatermarkOverlay wm={watermark} />
                </Box>
              ) : (
                <WatermarkOverlay wm={watermark} />
              ))}
            {onCrop && paperPx && <CropLayer crop={crop} active={cropMode} onCrop={onCrop} aspect={cropAspect} frame={paperPx} />}
          </Box>
        ) : (
          <Box sx={{ m: 'auto', color: color.textMuted }}>불러오는 중…</Box>
        )}
      </Box>
    </Box>
  )
})
