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
import { openPdf, PdfHandle } from '../convert/pdf'
import { blobPart } from '../convert/image'
import { WatermarkOpts } from '../watermark/model'
import { WatermarkOverlay } from './WatermarkOverlay'
import { ui } from '../theme'

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

export function Preview({ source, watermark }: { source: PreviewSource; watermark?: WatermarkOpts }): JSX.Element {
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false) // 페이지 넘김 중 (이전 페이지는 계속 표시)
  const [zoom, setZoom] = useState(1)
  const [stageW, setStageW] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const pdfCache = useRef<Map<number, string>>(new Map())
  // PDF 문서는 소스당 한 번만 열고 재사용 — 페이지 넘김마다 재파싱하면 대용량에서 크래시
  const pdfDoc = useRef<PdfHandle | null>(null)
  const renderGen = useRef(0) // 연타 시 이전(무효) 렌더 결과를 버리기 위한 세대 번호

  const sourceKey = keyOf(source)

  // 스테이지 폭 추적 — 콜백 ref로 붙여야 스테이지가 뒤늦게 마운트돼도 측정된다(확대/축소 먹통 수정)
  const setStage = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    if (!el) return
    const update = () => setStageW(el.clientWidth - 16) // padding 8*2
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    roRef.current = ro
  }, [])

  // 소스 바뀌면 배율 초기화
  useEffect(() => {
    setZoom(1)
  }, [sourceKey])

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
    openPdf(source.bytes)
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
          파일을 선택하면 미리보기가 표시됩니다. (DICOM은 미지원)
        </Typography>
      </Box>
    )
  }

  const frameW = stageW > 0 ? Math.max(80, Math.round(stageW * zoom)) : undefined

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
        <Typography variant="caption" sx={{ minWidth: 42, textAlign: 'center', color: ui.gray[600] }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="확대">
          <span>
            <IconButton size="small" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}>
              <AddRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="너비 맞춤">
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
          textAlign: 'center',
          bgcolor: ui.gray[100],
          border: `1px solid ${ui.gray[200]}`,
          borderRadius: 2,
          p: 1
        }}
      >
        {url ? (
          <Box sx={{ position: 'relative', display: 'inline-block', lineHeight: 0, verticalAlign: 'top', maxWidth: 'none', width: frameW }}>
            <Box component="img" src={url} alt="미리보기" sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: 1, boxShadow: ui.shadow.sm }} />
            {loading && (
              <Typography
                variant="caption"
                sx={{ position: 'absolute', top: 10, left: 10, zIndex: 4, bgcolor: 'rgba(255,255,255,.85)', borderRadius: 1, px: 0.8, py: 0.2, color: ui.gray[600] }}
              >
                불러오는 중…
              </Typography>
            )}
            {watermark?.enabled && <WatermarkOverlay wm={watermark} />}
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pt: 4 }}>
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
          <Typography variant="caption" sx={{ minWidth: 56, textAlign: 'center', color: ui.gray[600] }}>
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
