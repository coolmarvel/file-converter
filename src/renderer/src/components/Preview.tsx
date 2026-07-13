import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import FitScreenRounded from '@mui/icons-material/FitScreenRounded'
import type { PdfHandle } from '../convert/pdf' // 런타임(pdf.js)은 PDF 소스일 때만 지연 로딩
import { blobPart, targetSize, ResizeOpts, Transform, CropRect, hasCrop, loadImageFromUrl, removeWhiteBg } from '../convert/image'
import { WatermarkOpts } from '../watermark/model'
import { WatermarkOverlay } from './WatermarkOverlay'
import { ui } from '../theme'

const pct = (v: number): string => `${v * 100}%`

/** 자르기 드래그 상태 */
type CropDrag =
  | { kind: 'new'; startX: number; startY: number }
  | { kind: 'move'; startX: number; startY: number; orig: CropRect }
  | { kind: 'resize'; corner: 'nw' | 'ne' | 'sw' | 'se'; anchorX: number; anchorY: number }

/**
 * 자르기 레이어 — 프레임 위에서 드래그로 영역을 그리고(그림판 방식), 안쪽 드래그 = 이동,
 * 모서리 핸들 = 크기 조절. 바깥은 어둡게(dim) 표시해 어디까지 잘리는지 보여준다.
 * 좌표는 프레임 기준 0~1 정규화 — 변환 파이프라인의 CropRect와 동일 좌표계.
 */
function CropLayer({ crop, active, onCrop }: { crop: CropRect | null; active: boolean; onCrop: (c: CropRect | null) => void }): JSX.Element | null {
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<CropDrag | null>(null)

  if (!active && !hasCrop(crop)) return null

  const norm = (e: React.PointerEvent): { x: number; y: number } => {
    const r = boxRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const rectFrom = (x1: number, y1: number, x2: number, y2: number): CropRect => ({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1)
  })

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
    if (d.kind === 'new') onCrop(rectFrom(d.startX, d.startY, p.x, p.y))
    else if (d.kind === 'resize') onCrop(rectFrom(d.anchorX, d.anchorY, p.x, p.y))
    else {
      const dx = p.x - d.startX
      const dy = p.y - d.startY
      onCrop({
        ...d.orig,
        x: Math.min(1 - d.orig.w, Math.max(0, d.orig.x + dx)),
        y: Math.min(1 - d.orig.h, Math.max(0, d.orig.y + dy))
      })
    }
  }
  const up = (): void => {
    const d = dragRef.current
    dragRef.current = null
    // 클릭만 하고 끝난 티끌 영역은 취소로 간주
    if (d && crop && (crop.w < 0.01 || crop.h < 0.01)) onCrop(null)
  }

  const handles: { corner: 'nw' | 'ne' | 'sw' | 'se'; left: number; top: number; cursor: string }[] = crop
    ? [
        { corner: 'nw', left: crop.x, top: crop.y, cursor: 'nwse-resize' },
        { corner: 'ne', left: crop.x + crop.w, top: crop.y, cursor: 'nesw-resize' },
        { corner: 'sw', left: crop.x, top: crop.y + crop.h, cursor: 'nesw-resize' },
        { corner: 'se', left: crop.x + crop.w, top: crop.y + crop.h, cursor: 'nwse-resize' }
      ]
    : []
  // 핸들의 반대편 모서리가 리사이즈 앵커
  const anchorOf = (corner: string): { x: number; y: number } => ({
    x: corner.includes('w') ? crop!.x + crop!.w : crop!.x,
    y: corner.includes('n') ? crop!.y + crop!.h : crop!.y
  })

  return (
    <Box
      ref={boxRef}
      onPointerDown={(e) => {
        if (!active) return
        const p = norm(e)
        down(e, { kind: 'new', startX: p.x, startY: p.y })
        onCrop({ x: p.x, y: p.y, w: 0, h: 0 })
      }}
      onPointerMove={move}
      onPointerUp={up}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        overflow: 'hidden', // dim(box-shadow)이 프레임 밖으로 새지 않게
        cursor: active ? 'crosshair' : 'default',
        pointerEvents: active ? 'auto' : 'none',
        touchAction: 'none'
      }}
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
            border: `2px dashed ${ui.brand[500]}`,
            boxShadow: '0 0 0 100000px rgba(15, 23, 42, 0.45)', // 바깥 어둡게 = 잘려나갈 부분
            cursor: active ? 'move' : 'default',
            pointerEvents: active ? 'auto' : 'none',
            touchAction: 'none'
          }}
        >
          {active &&
            handles.map((h) => (
              <Box
                key={h.corner}
                onPointerDown={(e) => {
                  const a = anchorOf(h.corner)
                  down(e, { kind: 'resize', corner: h.corner, anchorX: a.x, anchorY: a.y })
                }}
                onPointerMove={move}
                onPointerUp={up}
                sx={{
                  position: 'absolute',
                  // crop 박스 내부 기준 좌표로 환산
                  left: `calc(${pct((h.left - crop.x) / crop.w)} - 6px)`,
                  top: `calc(${pct((h.top - crop.y) / crop.h)} - 6px)`,
                  width: 12,
                  height: 12,
                  bgcolor: '#fff',
                  border: `2px solid ${ui.brand[500]}`,
                  borderRadius: '2px',
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

/**
 * 미리보기 소스.
 * - images: object URL 배열. **URL 소유권은 호출측(App)** — Preview는 revoke하지 않는다.
 * - pdf: 페이지 수를 pdf.js로 조회하고 현재 페이지만 지연 렌더. 렌더 URL은 **Preview 소유**.
 */
export type PreviewSource =
  | { type: 'images'; urls: string[] }
  | { type: 'pdf'; bytes: Uint8Array; scale: number }
  | null

function keyOf(source: PreviewSource): string {
  if (!source) return 'none'
  return source.type === 'images' ? `img:${source.urls.join('|')}` : `pdf:${source.bytes.length}:${source.scale}`
}

export interface PreviewProps {
  source: PreviewSource
  /** 변환 옵션을 미리보기에 실시간 반영 — 보이는 그대로가 결과물 (pdf-editor 방식, 2026-07-13 피드백) */
  watermark?: WatermarkOpts
  transform?: Transform
  resize?: ResizeOpts
  /** 자르기: 영역(정규화)과 편집 모드 */
  crop?: CropRect | null
  cropMode?: boolean
  onCrop?: (c: CropRect | null) => void
  /** 흰색→투명 실시간 미리보기 (null=끔) */
  whiteTolerance?: number | null
  /** 투명 배경 모드 — 체커보드 배경으로 투명 영역을 보여준다 */
  transparent?: boolean
}

export function Preview({ source, watermark, transform, resize, crop = null, cropMode = false, onCrop, whiteTolerance = null, transparent = false }: PreviewProps): JSX.Element {
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false) // 페이지 넘김 중 (이전 페이지는 계속 표시)
  const [zoom, setZoom] = useState(1)
  const [stage, setStageSize] = useState({ w: 0, h: 0 })
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null) // 현재 표시 중인 이미지의 원본 픽셀 크기
  const roRef = useRef<ResizeObserver | null>(null)
  const pdfCache = useRef<Map<number, string>>(new Map())
  // PDF 문서는 소스당 한 번만 열고 재사용 — 페이지 넘김마다 재파싱하면 대용량에서 크래시
  const pdfDoc = useRef<PdfHandle | null>(null)
  const renderGen = useRef(0) // 연타 시 이전(무효) 렌더 결과를 버리기 위한 세대 번호

  const sourceKey = keyOf(source)

  // 스테이지 크기 추적 — 콜백 ref로 붙여야 스테이지가 뒤늦게 마운트돼도 측정된다(확대/축소 먹통 수정)
  const setStage = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    if (!el) return
    const update = () => setStageSize({ w: el.clientWidth - 16, h: el.clientHeight - 16 }) // padding 8*2
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    roRef.current = ro
  }, [])

  // 소스 바뀌면 배율·원본 크기 초기화 (페이지 넘김은 유지 — 같은 문서는 보통 페이지 크기가 같아 깜빡임 방지)
  useEffect(() => {
    setZoom(1)
    setNat(null)
  }, [sourceKey])

  // 흰색→투명 실시간 미리보기: 표시 중인 이미지에 같은 픽셀 연산을 적용해 보여준다 (디바운스)
  const [whiteUrl, setWhiteUrl] = useState<{ src: string; tol: number; out: string } | null>(null)
  useEffect(() => {
    if (whiteTolerance == null || !url) {
      setWhiteUrl(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const img = await loadImageFromUrl(url)
        const k = Math.min(1, 2000 / Math.max(1, img.naturalWidth, img.naturalHeight)) // 미리보기용 상한
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.naturalWidth * k))
        c.height = Math.max(1, Math.round(img.naturalHeight * k))
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        removeWhiteBg(c, whiteTolerance)
        if (!cancelled) setWhiteUrl({ src: url, tol: whiteTolerance, out: c.toDataURL('image/png') })
      } catch {
        if (!cancelled) setWhiteUrl(null)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [url, whiteTolerance])

  const displayUrl = whiteTolerance != null && whiteUrl && whiteUrl.src === url ? whiteUrl.out : url

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
    // 이전 페이지를 그대로 보여주면서 렌더 — 프레임(이미지+워터마크 캔버스)을 매번
    // 부수고 다시 만들지 않아야 캔버스 재할당 폭주가 없다. url은 준비되면 교체.
    setLoading(true)
    doc
      .renderPagePng(page, source.scale)
      .then((png) => {
        if (gen !== renderGen.current || pdfDoc.current !== doc) return // 더 최근 요청이 있거나 소스가 바뀜
        const u = URL.createObjectURL(new Blob([blobPart(png)], { type: 'image/png' }))
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

  if (!source || count === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          파일을 선택하면 미리보기가 표시됩니다.
        </Typography>
      </Box>
    )
  }

  // 100% = "화면에 맞춤"(pdf-editor 레이아웃 메뉴와 동일): 이미지/페이지 전체가 스크롤 없이
  // 스테이지 안에 들어오는 배율. 가로·세로 중 더 넘치는 쪽 기준(contain). zoom은 그 배율의 배수.
  // 원본 크기(nat)는 <img> onLoad에서 얻는다 — 측정 전에는 CSS contain 폴백으로 새지 않게.
  // 변환 옵션도 반영: 리사이즈(비율 강제 포함) → 회전/반전(CSS transform) → 흑백(filter).
  // 워터마크 오버레이는 회전된 프레임 위에 정방향으로 — 변환 처리 순서와 동일.
  const rot = transform?.rotate ?? 0
  const swap = rot === 90 || rot === 270
  let frame: { w: number; h: number } | null = null // 회전 반영된 바깥 박스
  let disp: { w: number; h: number } | null = null // 회전 전 이미지 표시 크기
  if (stage.w > 0 && stage.h > 0 && nat) {
    const eff = targetSize(nat.w, nat.h, resize) // 리사이즈가 비율을 바꾸면 미리보기 비율도 바뀐다
    const boxW = swap ? eff.height : eff.width
    const boxH = swap ? eff.width : eff.height
    const fit = Math.min(stage.w / boxW, stage.h / boxH)
    frame = { w: Math.max(40, Math.round(boxW * fit * zoom)), h: Math.max(40, Math.round(boxH * fit * zoom)) }
    disp = { w: Math.max(1, Math.round(eff.width * fit * zoom)), h: Math.max(1, Math.round(eff.height * fit * zoom)) }
  }
  const imgTransform = `translate(-50%, -50%) rotate(${rot}deg) scale(${transform?.flipH ? -1 : 1}, ${transform?.flipV ? -1 : 1})`
  const imgFilter = transform?.grayscale ? 'grayscale(1)' : 'none'

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Stack direction="row" alignItems="center" spacing={0.6}>
        <Tooltip title="축소">
          <span>
            <IconButton size="small" disabled={zoom <= 0.4} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}>
              <RemoveRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography sx={{ fontSize: 14.5, minWidth: 48, textAlign: 'center', color: ui.gray[600] }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="확대">
          <span>
            <IconButton size="small" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}>
              <AddRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="화면에 맞춤 (100%)">
          <Button size="small" color="inherit" startIcon={<FitScreenRounded />} onClick={() => setZoom(1)} sx={{ px: 1, minWidth: 0 }}>
            맞춤
          </Button>
        </Tooltip>
      </Stack>

      <Box
        ref={setStage}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex', // + 프레임의 m:'auto' → 화면보다 작으면 정중앙, 크면 스크롤
          bgcolor: ui.gray[100],
          border: `1px solid ${ui.gray[200]}`,
          borderRadius: 2,
          p: 1
        }}
      >
        {url ? (
          <Box
            sx={{
              position: 'relative',
              m: 'auto',
              flexShrink: 0,
              lineHeight: 0,
              width: frame?.w,
              height: frame?.h,
              // 투명 배경 모드: 체커보드로 투명 영역을 보여준다
              ...(transparent && {
                backgroundImage: 'conic-gradient(#e2e8f0 0 25%, #ffffff 0 50%, #e2e8f0 0 75%, #ffffff 0)',
                backgroundSize: '16px 16px',
                borderRadius: 1
              })
            }}
          >
            <Box
              component="img"
              src={displayUrl ?? undefined}
              alt="미리보기"
              onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
                const el = e.currentTarget
                // 흰색제거 미리보기(축소본)가 아니라 원본이 로드됐을 때만 원본 크기를 갱신
                if (el.src !== url) return
                if (el.naturalWidth && el.naturalHeight) setNat({ w: el.naturalWidth, h: el.naturalHeight })
              }}
              sx={
                frame && disp
                  ? {
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: disp.w,
                      height: disp.h,
                      transform: imgTransform,
                      filter: imgFilter,
                      borderRadius: 1,
                      boxShadow: ui.shadow.sm
                    }
                  : // 원본 크기 측정 전 폴백: CSS contain으로 화면 안에 가둔다
                    {
                      maxWidth: '100%',
                      maxHeight: stage.h > 0 ? `${stage.h}px` : '100%',
                      width: 'auto',
                      height: 'auto',
                      display: 'block',
                      filter: imgFilter,
                      borderRadius: 1,
                      boxShadow: ui.shadow.sm
                    }
              }
            />
            {loading && (
              <Typography
                variant="caption"
                sx={{ position: 'absolute', top: 10, left: 10, zIndex: 4, bgcolor: 'rgba(255,255,255,.85)', borderRadius: 1, px: 0.8, py: 0.2, color: ui.gray[600] }}
              >
                불러오는 중…
              </Typography>
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
            {onCrop && <CropLayer crop={crop} active={cropMode} onCrop={onCrop} />}
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ m: 'auto' }}>
            불러오는 중…
          </Typography>
        )}
      </Box>

      {count > 1 && (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.6}>
          <Tooltip title="이전 페이지">
            <span>
              <IconButton size="small" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeftRounded />
              </IconButton>
            </span>
          </Tooltip>
          <Typography sx={{ fontSize: 14.5, minWidth: 60, textAlign: 'center', color: ui.gray[600] }}>
            {page + 1} / {count}
          </Typography>
          <Tooltip title="다음 페이지">
            <span>
              <IconButton size="small" disabled={page >= count - 1} onClick={() => setPage((p) => Math.min(count - 1, p + 1))}>
                <ChevronRightRounded />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}
    </Box>
  )
}
