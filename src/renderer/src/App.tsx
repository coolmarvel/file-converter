import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, DragEvent } from 'react'
import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import {
  detectFileKind,
  targetsFor,
  FileKind,
  FORMATS,
  Adjustments,
  DEFAULT_ADJUST,
  CanvasSizeOptions,
  Histogram,
  histogram,
  autoLevels,
  DEFAULT_MATTE,
  hasMatteRefine,
  readDpi,
  changesCanvas,
  Filters,
  DEFAULT_FILTERS,
  hasFilters,
  scaleFilters,
  LayerEffects,
  DEFAULT_EFFECTS,
  hasEffects,
  scaleEffects,
  Quad,
  quadOutputSize,
  warpQuad,
  CONTENT_FILL
} from '@core/index'
import { AppFile } from './types'
import { runConversion, BgOptions, NamedBytes, ConvertOptions } from './convert'
import { Transform, CropRect, supportsAlpha, targetSize, loadImage, loadImageFromUrl, mimeFor, hasCrop, bytesToUrl, canvasToBytes, assertCanvasSize } from './convert/image'
import type { PdfToolRequest } from './convert/pdftools'
import { WatermarkOpts, DEFAULT_WATERMARK } from './watermark/model'
import TitleBar from './components/chrome/TitleBar'
import MenuBar, { MenuDef } from './components/chrome/MenuBar'
import StatusBar from './components/chrome/StatusBar'
import ConvertToolbar from './components/ConvertToolbar'
import OptionsBar, { CROP_ASPECTS } from './components/OptionsBar'
import FileSidebar from './components/FileSidebar'
import { DropZone } from './components/DropZone'
import { Preview, PreviewSource, PreviewHandle } from './components/Preview'
import type { ImageSizeResult } from './components/dialogs/ImageSizeDialog'
import type { EncodedSample } from './components/dialogs/ExportDialog'
import { ACCEPT_ATTR } from './util/accept'
import { dims } from './util/format'
import { useHistory } from './hooks/useHistory'
import { ui } from './theme'
import { applySkin, loadSkin } from './styles/tokens'
import { SKINS, SKIN_LABELS, SkinName } from './styles/skins'

const { color, shadow } = ui

type Status = { kind: 'info' | 'ok' | 'err'; text: string } | null
/** 오래 걸리는 작업의 진행 표시 (value 없으면 불확정 바) */
type Progress = { label: string; value?: number } | null
type DialogKind = 'imageSize' | 'canvasSize' | 'export' | 'adjust' | 'filters' | 'effects' | 'perspective' | 'about' | null
type FrameInfo = { w: number; h: number; zoomPct: number; page: number; pages: number } | null

const DEFAULT_TRANSFORM: Transform = { rotate: 0, flipH: false, flipV: false, grayscale: false }
const DEFAULT_BG: BgOptions = { mode: 'none', tolerance: 12, matte: DEFAULT_MATTE }
let idSeq = 0

// 대화상자는 열 때만 불러온다 — 시작 번들에서 빠지고, 닫혀 있는 동안 마운트도 안 된다
const ImageSizeDialog = lazy(() => import('./components/dialogs/ImageSizeDialog'))
const CanvasSizeDialog = lazy(() => import('./components/dialogs/CanvasSizeDialog'))
const ExportDialog = lazy(() => import('./components/dialogs/ExportDialog'))
const AdjustDialog = lazy(() => import('./components/dialogs/AdjustDialog'))
const AboutDialog = lazy(() => import('./components/dialogs/AboutDialog'))
const FiltersDialog = lazy(() => import('./components/dialogs/FiltersDialog'))
const EffectsDialog = lazy(() => import('./components/dialogs/EffectsDialog'))
const PerspectiveDialog = lazy(() => import('./components/dialogs/PerspectiveDialog'))

/** 렌더 미리보기(필터·효과·내용 인식 채우기)의 계산 해상도 상한 — 긴 변 */
const RENDER_PREVIEW_SIDE = 1400
const quadKey = (id: string, q: Quad): string => `${id}#${q.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';')}`

/** 입력창에 포커스가 있으면 앱 단축키가 끼어들지 않는다 */
const isTyping = (el: EventTarget | null): boolean => {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

export default function App(): JSX.Element {
  // ── 작업 상태 (undo/redo 대상) ──
  const [files, setFiles] = useState<AppFile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [target, setTarget] = useState<FileKind | null>(null)
  const [scale, setScale] = useState(2)
  const [resizeW, setResizeW] = useState('')
  const [resizeH, setResizeH] = useState('')
  const [dpi, setDpi] = useState<number | null>(null)
  const [quality, setQuality] = useState(92) // % — jpeg/webp 인코딩 품질
  const [matte, setMatte] = useState('#ffffff') // 불투명 출력의 투명 자리 색
  const [tf, setTf] = useState<Transform>(DEFAULT_TRANSFORM)
  const [adjust, setAdjust] = useState<Adjustments>(DEFAULT_ADJUST)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [effects, setEffects] = useState<LayerEffects>(DEFAULT_EFFECTS)
  /** 파일별 원근 보정(문서 펴기) 네 모서리 */
  const [warps, setWarps] = useState<Record<string, Quad>>({})
  const [canvasSize, setCanvasSize] = useState<CanvasSizeOptions | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [bg, setBg] = useState<BgOptions>(DEFAULT_BG)
  const [wm, setWm] = useState<WatermarkOpts>(DEFAULT_WATERMARK)

  // ── 화면 상태 (이력 밖) ──
  const [cropMode, setCropMode] = useState(false)
  const [cropAspect, setCropAspect] = useState('free')
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [skin, setSkin] = useState<SkinName>(loadSkin)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [frame, setFrame] = useState<FrameInfo>(null)
  const [activeDims, setActiveDims] = useState<{ width: number; height: number } | null>(null)
  const [hist, setHist] = useState<Histogram | null>(null)
  const [sample, setSample] = useState<ImageData | null>(null)
  const [rendered, setRendered] = useState<{ key: string; url: string; w: number; h: number } | null>(null)
  // 원근 보정 결과 캐시 (quadKey → 펴진 PNG). 이력 대상 아님 — undo 로 모서리가 돌아와도 다시 계산하지 않게
  const warpCache = useRef<Map<string, { bytes: Uint8Array; url: string }>>(new Map())
  const [warpTick, setWarpTick] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<PreviewHandle>(null)
  // AI 배경 제거 결과 캐시 (fileId → PNG 바이트/미리보기 URL). 이력 대상 아님 — 같은 파일 재계산 방지용
  const aiCache = useRef<Map<string, Uint8Array>>(new Map())
  const [aiUrls, setAiUrls] = useState<Map<string, string>>(new Map())
  const aiGen = useRef(0) // 파일/모드 변경 시 이전 배치 결과 무시
  const [aiRefined, setAiRefined] = useState<{ id: string; key: string; url: string } | null>(null)
  const dimsCache = useRef<Map<string, { width: number; height: number }>>(new Map())

  const commonKind = useMemo<FileKind | 'mixed' | null>(() => {
    if (files.length === 0) return null
    const first = files[0].kind
    return files.every((f) => f.kind === first) ? first : 'mixed'
  }, [files])

  const targets = useMemo(() => (commonKind && commonKind !== 'mixed' ? targetsFor(commonKind) : []), [commonKind])
  const targetIsImage = target ? FORMATS[target].isImage : false
  const sourceIsImage = !!commonKind && commonKind !== 'mixed' && FORMATS[commonKind].isImage
  /**
   * 실제로 변환·미리보기에 쓰는 파일 — 원근 보정이 걸린 파일은 펴진 PNG 로 바꿔 끼운다.
   * 캐시 키(cacheKey)가 달라지므로 AI 배경 제거 같은 파일별 캐시가 옛 결과를 쓰지 않는다.
   */
  const effFiles = useMemo<AppFile[]>(
    () =>
      files.map((f) => {
        const q = warps[f.id]
        const c = q && warpCache.current.get(quadKey(f.id, q))
        return c ? { ...f, bytes: c.bytes, kind: 'png', srcKind: f.srcKind ?? f.kind, size: c.bytes.length, previewUrl: c.url, cacheKey: quadKey(f.id, q) } : f
      }),
    [files, warps, warpTick] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const keyOf = (f: AppFile): string => f.cacheKey ?? f.id
  const active = effFiles.find((f) => f.id === activeId) ?? null
  const rawActive = files.find((f) => f.id === activeId) ?? null

  // 변환·미리보기가 같은 값을 쓰는 출력 크기 (한쪽만 입력 = 비율 유지)
  const resize = useMemo(() => {
    const rw = Number(resizeW)
    const rh = Number(resizeH)
    return rw > 0 || rh > 0 ? { width: rw > 0 ? rw : undefined, height: rh > 0 ? rh : undefined } : undefined
  }, [resizeW, resizeH])

  useEffect(() => {
    if (targets.length === 0) setTarget(null)
    else if (!targets.some((t) => t.to === target)) setTarget(targets[0].to)
  }, [commonKind]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── undo/redo (hooks/useHistory — 디바운스로 슬라이더·드래그를 한 칸으로) ──
  const history = useHistory({ files, activeId, target, scale, resizeW, resizeH, dpi, quality, matte, tf, adjust, filters, effects, warps, canvasSize, crop, bg, wm }, (s) => {
    setFiles(s.files)
    setActiveId(s.activeId)
    setTarget(s.target)
    setScale(s.scale)
    setResizeW(s.resizeW)
    setResizeH(s.resizeH)
    setDpi(s.dpi)
    setQuality(s.quality)
    setMatte(s.matte)
    setTf(s.tf)
    setAdjust(s.adjust)
    setFilters(s.filters)
    setEffects(s.effects)
    setWarps(s.warps)
    setCanvasSize(s.canvasSize)
    setCrop(s.crop)
    setBg(s.bg)
    setWm(s.wm)
  })

  // ── 원근 보정: 캐시에 없는 모서리(undo 로 돌아온 값 등)는 여기서 편다 ──
  useEffect(() => {
    const todo = files.filter((f) => warps[f.id] && !warpCache.current.has(quadKey(f.id, warps[f.id])))
    if (todo.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const f of todo) {
        const bytes = await warpFile(f, warps[f.id])
        if (cancelled) return
        warpCache.current.set(quadKey(f.id, warps[f.id]), { bytes, url: bytesToUrl(bytes, 'image/png') })
      }
      setWarpTick((t) => t + 1)
    })().catch((e) => setStatus({ kind: 'err', text: `원근 보정 실패: ${e instanceof Error ? e.message : String(e)}` }))
    return () => {
      cancelled = true
    }
  }, [files, warps])

  // ── 선택 파일의 원본 크기 (대화상자·상태 줄) — 파일당 한 번만 디코드 ──
  useEffect(() => {
    if (!active || !FORMATS[active.kind].isImage) {
      setActiveDims(null)
      return
    }
    const cached = dimsCache.current.get(keyOf(active))
    if (cached) {
      setActiveDims(cached)
      return
    }
    let cancelled = false
    loadImage(active.bytes, mimeFor(active.kind))
      .then((img) => {
        const d = { width: img.naturalWidth, height: img.naturalHeight }
        dimsCache.current.set(keyOf(active), d)
        if (!cancelled) setActiveDims(d)
      })
      .catch(() => !cancelled && setActiveDims(null))
    return () => {
      cancelled = true
    }
  }, [active])

  // ── AI 배경 제거 ──
  // 켜지면 이미지 파일들을 순차 처리해 미리보기·변환 공용 캐시에 담는다
  useEffect(() => {
    if (bg.mode !== 'ai' || !sourceIsImage) return
    const todo = effFiles.filter((f) => FORMATS[f.kind].isImage && !aiCache.current.has(keyOf(f)))
    if (todo.length === 0) return
    const gen = ++aiGen.current
    let cancelled = false
    ;(async () => {
      try {
        const { removeBackgroundBytes } = await import('./convert/bgremove')
        for (let i = 0; i < todo.length; i++) {
          if (cancelled || gen !== aiGen.current) return
          const f = todo[i]
          setProgress({ label: `AI 배경 제거 중… (${i + 1}/${todo.length}) ${f.name}` })
          const png = await removeBackgroundBytes(f.bytes, FORMATS[f.kind].mime ?? 'image/png', (label) => {
            if (gen === aiGen.current) setProgress({ label: `${label} (${i + 1}/${todo.length})` })
          })
          if (cancelled || gen !== aiGen.current) return
          aiCache.current.set(keyOf(f), png)
          const url = bytesToUrl(png, 'image/png')
          setAiUrls((prev) => new Map(prev).set(keyOf(f), url))
        }
      } catch (e) {
        if (gen === aiGen.current) {
          setStatus({ kind: 'err', text: `AI 배경 제거 실패: ${e instanceof Error ? e.message : String(e)}` })
          setBg((prev) => (prev.mode === 'ai' ? { ...prev, mode: 'none' } : prev))
        }
      } finally {
        if (gen === aiGen.current) setProgress(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bg.mode, effFiles, sourceIsImage]) // eslint-disable-line react-hooks/exhaustive-deps

  // 가장자리 다듬기 미리보기 — 선택 파일만, 슬라이더가 멈추면(150ms) 축소 해상도(1024)로
  const matteKey = JSON.stringify(bg.matte)
  useEffect(() => {
    if (bg.mode !== 'ai' || !active || !hasMatteRefine(bg.matte)) return
    const cut = aiCache.current.get(keyOf(active))
    if (!cut || !aiUrls.has(keyOf(active))) return
    const key = `${keyOf(active)}|${matteKey}`
    if (aiRefined?.key === key) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const { refineCutout } = await import('./convert/matte')
      const png = await refineCutout(cut, active.bytes, active.kind, bg.matte, 1024)
      if (cancelled) return
      const url = bytesToUrl(png, 'image/png')
      setAiRefined((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { id: keyOf(active), key, url }
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [bg.mode, matteKey, active, aiUrls]) // eslint-disable-line react-hooks/exhaustive-deps

  // AI 배경 제거가 켜져 있으면 제거(+다듬기)된 결과 URL을 미리보기로 (WYSIWYG)
  const urlOf = useCallback(
    (f: AppFile): string | undefined => {
      if (bg.mode !== 'ai') return f.previewUrl
      if (hasMatteRefine(bg.matte) && aiRefined?.id === keyOf(f) && aiRefined.key === `${keyOf(f)}|${matteKey}`) return aiRefined.url
      return aiUrls.get(keyOf(f)) ?? f.previewUrl
    },
    [bg.mode, bg.matte, aiRefined, aiUrls, matteKey]
  )

  const previewSource = useMemo<PreviewSource>(() => {
    if (sourceIsImage && target === 'pdf' && effFiles.length > 0) {
      const urls = effFiles.map(urlOf).filter((u): u is string => !!u)
      if (urls.length) return { type: 'images', urls }
    }
    if (!active) return null
    if (FORMATS[active.kind].isImage && active.previewUrl) return { type: 'images', urls: [urlOf(active)!] }
    if (active.kind === 'pdf') return { type: 'pdf', bytes: active.bytes, scale: 2 }
    return null
  }, [effFiles, active, sourceIsImage, target, urlOf])

  // 렌더러 크래시 → 자동 복구 후 안내 (조용히 리셋되면 "앱이 꺼졌다"로 오해)
  useEffect(() => {
    window.api.onRecovered?.(() => {
      setStatus({ kind: 'err', text: '화면 문제가 감지되어 자동 복구했습니다. 파일을 다시 추가해 주세요. (반복되면 알려주세요)' })
    })
  }, [])

  // ── 파일 ──
  async function addFiles(incoming: File[]): Promise<void> {
    const loaded: AppFile[] = []
    let firstDpi: number | null = null
    try {
      for (const file of incoming) {
        let buf = new Uint8Array(await file.arrayBuffer())
        let kind = detectFileKind(file.name, buf.subarray(0, 512)) // SVG 텍스트 마커까지 커버
        let srcKind: FileKind | undefined
        firstDpi ??= readDpi(buf)
        // 브라우저가 직접 못 여는 포맷은 추가 시점에 PNG로 풀어둔다 (배지는 원래 포맷 유지)
        if (kind === 'heic' || kind === 'tiff') {
          setProgress({ label: `${FORMATS[kind].label} 여는 중… ${file.name}` })
          const { heicToPng, tiffToPng } = await import('./convert/decode')
          try {
            buf = kind === 'heic' ? await heicToPng(buf) : await tiffToPng(buf)
            srcKind = kind
            kind = 'png'
          } catch (e) {
            setStatus({ kind: 'err', text: `${file.name}: ${FORMATS[kind].label} 해석 실패 — ${e instanceof Error ? e.message : String(e)}` })
            continue
          }
        }
        const isImage = FORMATS[kind].isImage
        loaded.push({
          id: `f${idSeq++}`,
          name: file.name,
          kind,
          srcKind,
          size: buf.length,
          bytes: buf,
          previewUrl: isImage ? bytesToUrl(buf, FORMATS[kind].mime ?? 'image/png') : undefined
        })
      }
    } finally {
      setProgress(null)
    }
    if (loaded.length === 0) return
    // 원본에 해상도가 적혀 있으면 첫 파일의 값을 이어받는다 (이미지 크기 대화상자 기본값)
    if (firstDpi && dpi == null) setDpi(firstDpi)
    setFiles((prev) => {
      const next = [...prev, ...loaded]
      if (!activeId && next.length) setActiveId(next[0].id)
      return next
    })
    setStatus(null)
  }

  const clipboardFiles = (list: Iterable<{ type: string; getAsFile?: () => File | null }> | File[]): File[] => {
    const out: File[] = []
    const stamp = new Date().toLocaleTimeString('ko', { hour12: false }).replaceAll(':', '')
    for (const item of list as Iterable<File | DataTransferItem>) {
      const f = item instanceof File ? item : item.type.startsWith('image/') ? (item as DataTransferItem).getAsFile() : null
      if (!f || !f.type.startsWith('image/')) continue
      const ext = (f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
      out.push(new File([f], f.name && f.name !== 'image.png' ? f.name : `붙여넣기_${stamp}.${ext}`, { type: f.type }))
    }
    return out
  }

  // Ctrl+V — 클립보드의 이미지(스크린샷 등)를 파일로 추가
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (isTyping(e.target) || !e.clipboardData) return
      const images = clipboardFiles(Array.from(e.clipboardData.items).filter((i) => i.kind === 'file'))
      if (images.length) {
        e.preventDefault()
        void addFiles(images)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }) // addFiles 가 최신 상태를 보도록 매 렌더 재등록 (리스너 하나라 비용 없음)

  /** 메뉴 "붙여넣기" — 비동기 클립보드 API */
  async function pasteFromMenu(): Promise<void> {
    try {
      const items = await navigator.clipboard.read()
      const blobs: File[] = []
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'))
        if (type) blobs.push(new File([await it.getType(type)], '', { type }))
      }
      const images = clipboardFiles(blobs)
      if (images.length) await addFiles(images)
      else setStatus({ kind: 'info', text: '클립보드에 이미지가 없습니다.' })
    } catch {
      setStatus({ kind: 'info', text: '클립보드를 읽지 못했습니다. Ctrl+V 로 붙여넣어 보세요.' })
    }
  }

  // 콜백을 안정 참조로 — FileSidebar 의 행(memo)이 선택 변경 때 전부 다시 그려지지 않게
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const removeFile = useCallback((id: string): void => {
    // previewUrl은 revoke하지 않는다 — undo로 파일을 되살릴 때 다시 쓴다 (앱 종료 시 일괄 해제됨)
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id)
      if (activeIdRef.current === id) setActiveId(next[0]?.id ?? null)
      return next
    })
  }, [])

  const moveFile = useCallback((id: string, dir: -1 | 1): void => {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }, [])

  // ── 변환 ──
  /** 현재 옵션 전부 → 변환 옵션 (변환·내보내기 미리보기 공용) */
  function buildOptions(to: FileKind): ConvertOptions {
    const imageLike = FORMATS[to].isImage || to === 'svg' || to === 'ico'
    return {
      to,
      scale,
      resize,
      quality: quality / 100,
      matte,
      dpi,
      transform: sourceIsImage ? tf : undefined,
      adjust: imageLike && to !== 'svg' ? adjust : null,
      filters: to !== 'svg' ? filters : null,
      effects: to !== 'svg' ? effects : null,
      canvasSize,
      crop,
      bg: sourceIsImage || commonKind === 'pdf' ? bg : undefined,
      aiCache: aiCache.current,
      watermark: wm.enabled ? wm : undefined
    }
  }

  async function handleConvert(): Promise<void> {
    if (!target || files.length === 0 || busy) return
    setBusy(true)
    setStatus(null)
    setProgress({ label: '변환 준비 중…' })
    try {
      const results = await runConversion(effFiles, {
        ...buildOptions(target),
        onProgress: (done, total, label) => setProgress({ label: label ?? `변환 중… (${Math.min(done + 1, total)}/${total})`, value: total > 0 ? Math.round((done / total) * 100) : undefined })
      })
      setProgress(null)
      if (results.length === 0) throw new Error('변환 결과가 없습니다.')
      await saveResults(results)
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : '변환 중 오류가 발생했습니다.' })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  /** 내보내기 미리보기: 선택 파일(PDF 면 보고 있는 페이지) 하나만 실제 인코딩 */
  async function encodeSample(q: number, m: string): Promise<EncodedSample> {
    if (!active || !target) throw new Error('선택된 파일이 없습니다.')
    const [r] = await runConversion([active], { ...buildOptions(target), quality: q / 100, matte: m, pageIndices: active.kind === 'pdf' ? [frame?.page ?? 0] : undefined })
    if (!r) throw new Error('결과가 없습니다.')
    const mime = FORMATS[target].mime ?? 'application/octet-stream'
    const bmp = await createImageBitmap(new Blob([r.bytes as unknown as BlobPart], { type: mime })) // 크기만 읽는다
    const out = { bytes: r.bytes, mime, width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  }

  /** 결과물 저장 공통 흐름: 1개 = 저장 다이얼로그, 여러 개 = 폴더 선택 후 일괄 (변환·PDF 도구 공용) */
  async function saveResults(results: NamedBytes[]): Promise<void> {
    if (results.length === 1) {
      const savedPath = await window.api.saveBuffer(results[0].name, results[0].bytes)
      if (!savedPath) return setStatus({ kind: 'info', text: '저장이 취소되었습니다.' })
      await window.api.showItem(savedPath)
      setStatus({ kind: 'ok', text: `저장 완료: ${savedPath}` })
    } else {
      const dir = await window.api.pickSaveDir()
      if (!dir) return setStatus({ kind: 'info', text: '저장이 취소되었습니다.' })
      let first = ''
      for (const r of results) {
        const p = await window.api.writeInDir(dir, r.name, r.bytes)
        if (!first) first = p
      }
      if (first) await window.api.showItem(first)
      setStatus({ kind: 'ok', text: `${results.length}개 파일 저장 완료: ${dir}` })
    }
  }

  /** PDF 문서 정리(병합/분할/회전/삭제/순서) 실행 + 저장 */
  async function handlePdfTool(req: PdfToolRequest): Promise<void> {
    setBusy(true)
    setProgress({ label: 'PDF 처리 중…' })
    try {
      const { runPdfTool } = await import('./convert/pdftools') // pdf-lib 청크는 실제 사용 시에만
      const results = await runPdfTool(files, activeId, req)
      setProgress(null)
      await saveResults(results)
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'PDF 처리 중 오류가 발생했습니다.' })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  // ── 보정 보조: 선택 파일 히스토그램·스포이트 표본 (보정 대화상자·자동 레벨) ──
  async function sampleActive(side = 512): Promise<ImageData | null> {
    const url = active ? urlOf(active) : undefined
    if (!url) return null
    const img = await loadImageFromUrl(url).catch(() => null)
    if (!img) return null
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k))
    c.height = Math.max(1, Math.round(img.naturalHeight * k))
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.drawImage(img, 0, 0, c.width, c.height)
    return x.getImageData(0, 0, c.width, c.height)
  }
  async function computeHistogram(): Promise<Histogram | null> {
    const d = await sampleActive()
    return d ? histogram(d.data) : null
  }
  async function openAdjust(): Promise<void> {
    setDialog('adjust')
    const d = await sampleActive()
    setHist(d ? histogram(d.data) : null)
    setSample(d)
  }

  // ── 원근 보정(문서 펴기) ──
  /** 원본 파일을 네 모서리대로 편 PNG */
  async function warpFile(f: AppFile, q: Quad): Promise<Uint8Array> {
    const img = await loadImage(f.bytes, mimeFor(f.kind))
    const W = img.naturalWidth
    const H = img.naturalHeight
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.drawImage(img, 0, 0)
    const o = quadOutputSize(q, W, H)
    assertCanvasSize(o.width, o.height)
    const px = warpQuad(x.getImageData(0, 0, W, H).data, W, H, q, o.width, o.height)
    const out = document.createElement('canvas')
    out.width = o.width
    out.height = o.height
    const im = out.getContext('2d')!.createImageData(o.width, o.height)
    im.data.set(px)
    out.getContext('2d')!.putImageData(im, 0, 0)
    return canvasToBytes(out, 'image/png')
  }
  async function applyWarp(q: Quad | null): Promise<void> {
    setDialog(null)
    if (!rawActive) return
    const id = rawActive.id
    if (!q) {
      setWarps((w) => {
        const next = { ...w }
        delete next[id]
        return next
      })
      return
    }
    setProgress({ label: '원근 보정 중…' })
    try {
      const key = quadKey(id, q)
      if (!warpCache.current.has(key)) {
        const bytes = await warpFile(rawActive, q)
        warpCache.current.set(key, { bytes, url: bytesToUrl(bytes, 'image/png') })
      }
      setWarps((w) => ({ ...w, [id]: q }))
    } catch (e) {
      setStatus({ kind: 'err', text: `원근 보정 실패: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setProgress(null)
    }
  }

  // ── 결과를 클립보드로 (Compositor Copy Merged) — 선택 파일(PDF 면 보고 있는 쪽) 하나, 모든 옵션 반영 PNG ──
  async function copyResult(): Promise<void> {
    if (!active) return
    setProgress({ label: '클립보드로 복사하는 중…' })
    try {
      const [r] = await runConversion([active], { ...buildOptions('png'), pageIndices: active.kind === 'pdf' ? [frame?.page ?? 0] : undefined })
      if (!r) throw new Error('결과가 없습니다.')
      const ok = await window.api.copyImage(r.bytes)
      setStatus(ok ? { kind: 'ok', text: '결과를 클립보드에 복사했습니다. 다른 프로그램에 Ctrl+V 로 붙여넣으세요.' } : { kind: 'err', text: '클립보드에 복사하지 못했습니다.' })
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : '복사 중 오류가 발생했습니다.' })
    } finally {
      setProgress(null)
    }
  }
  async function autoLevelsNow(): Promise<void> {
    const h = await computeHistogram()
    const a = h && autoLevels(h)
    if (a) setAdjust((prev) => ({ ...prev, ...a, midtone: 1 }))
    else setStatus({ kind: 'info', text: '자동 레벨을 계산할 이미지가 없습니다.' })
  }

  function applyImageSize(r: ImageSizeResult): void {
    setDialog(null)
    setDpi(r.dpi)
    if (r.width == null) return // 리샘플 끔 = 픽셀 그대로
    setResizeW(String(r.width))
    // 비율 잠금이면 가로만 — 여러 파일이 각자 비율을 지킨다
    setResizeH(r.lock ? '' : String(r.height))
  }

  function resetOptions(): void {
    setResizeW('')
    setResizeH('')
    setDpi(null)
    setTf(DEFAULT_TRANSFORM)
    setAdjust(DEFAULT_ADJUST)
    setFilters(DEFAULT_FILTERS)
    setEffects(DEFAULT_EFFECTS)
    setWarps({})
    setCanvasSize(null)
    setCrop(null)
    setCropMode(false)
    setBg(DEFAULT_BG)
    setWm({ ...wm, enabled: false })
  }

  const openPicker = (): void => fileInputRef.current?.click()

  // 파일이 이미 있어도 본문 어디에나 끌어다 놓으면 추가되도록 (랜딩 드롭존과 별개)
  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    if (e.dataTransfer.files.length) void addFiles(Array.from(e.dataTransfer.files))
  }

  // ── 파생 값 ──
  const rotate = (dir: 1 | -1): void => setTf({ ...tf, rotate: (((((tf.rotate ?? 0) + dir * 90) % 360) + 360) % 360) as Transform['rotate'] })
  const hasFiles = files.length > 0
  const canImage = sourceIsImage && !!target && target !== 'svg'
  const alphaTarget = !!target && supportsAlpha(target)
  const aspectEntry = CROP_ASPECTS.find((a) => a.key === cropAspect)
  const cropAspectValue = aspectEntry?.value === 'orig' ? (frame ? frame.w / frame.h : null) : (aspectEntry?.value ?? null)
  // 캔버스 대화상자의 기준 = 리사이즈·회전까지 반영한 크기
  const boxDims = useMemo(() => {
    if (!activeDims) return null
    const e = targetSize(activeDims.width, activeDims.height, resize)
    const swap = tf.rotate === 90 || tf.rotate === 270
    return { width: swap ? e.height : e.width, height: swap ? e.width : e.height }
  }, [activeDims, resize, tf.rotate])

  // ── 메뉴 (도구 버튼에 흩어진 기능을 메뉴·단축키로도) ──
  const menus: MenuDef[] = [
    {
      label: '파일(F)',
      items: [
        { label: '열기…', shortcut: 'Ctrl+O', onClick: openPicker },
        { label: '클립보드에서 붙여넣기', shortcut: 'Ctrl+V', onClick: () => void pasteFromMenu() },
        'sep',
        { label: '변환 후 저장', shortcut: 'Ctrl+S', onClick: () => void handleConvert(), disabled: !target || !hasFiles || busy },
        { label: '내보내기 미리보기…', shortcut: 'Ctrl+Alt+Shift+S', onClick: () => setDialog('export'), disabled: !active || !(target === 'jpeg' || target === 'webp') },
        'sep',
        { label: '모든 파일 닫기', onClick: () => setFiles([]), disabled: !hasFiles },
        'sep',
        { label: '끝내기', shortcut: 'Alt+F4', onClick: () => void window.api.win?.close() }
      ]
    },
    {
      label: '편집(E)',
      items: [
        { label: '실행취소', shortcut: 'Ctrl+Z', onClick: history.undo, disabled: !history.canUndo },
        { label: '다시실행', shortcut: 'Ctrl+Y', onClick: history.redo, disabled: !history.canRedo },
        'sep',
        { label: '결과를 클립보드로 복사', shortcut: 'Ctrl+Shift+C', onClick: () => void copyResult(), disabled: !active || busy },
        'sep',
        { label: '선택 파일 제거', shortcut: 'Del', onClick: () => active && removeFile(active.id), disabled: !active },
        { label: '모든 옵션 초기화', onClick: resetOptions, disabled: !hasFiles }
      ]
    },
    {
      label: '이미지(I)',
      items: [
        { label: '이미지 크기…', shortcut: 'Ctrl+Alt+I', onClick: () => setDialog('imageSize'), disabled: !activeDims },
        { label: '캔버스 크기…', shortcut: 'Ctrl+Alt+C', onClick: () => setDialog('canvasSize'), disabled: !boxDims },
        { label: '원근 보정·기울기…', shortcut: 'Ctrl+Shift+P', onClick: () => setDialog('perspective'), disabled: !rawActive?.previewUrl },
        'sep',
        { label: '필터…', shortcut: 'Ctrl+Shift+F', onClick: () => setDialog('filters'), disabled: !hasFiles || target === 'svg' },
        { label: '효과…', shortcut: 'Ctrl+Shift+E', onClick: () => setDialog('effects'), disabled: !hasFiles || target === 'svg' },
        { label: '보정…', shortcut: 'Ctrl+M', onClick: () => void openAdjust(), disabled: !canImage && commonKind !== 'pdf' },
        { label: '자동 레벨', shortcut: 'Ctrl+Shift+L', onClick: () => void autoLevelsNow(), disabled: !activeDims },
        { label: '반전', shortcut: 'Ctrl+I', onClick: () => setAdjust({ ...adjust, invert: !adjust.invert }), checked: adjust.invert, disabled: !hasFiles },
        { label: '흑백', onClick: () => setTf({ ...tf, grayscale: !tf.grayscale }), checked: !!tf.grayscale, disabled: !sourceIsImage },
        'sep',
        { label: '왼쪽으로 90° 회전', onClick: () => rotate(-1), disabled: !sourceIsImage },
        { label: '오른쪽으로 90° 회전', onClick: () => rotate(1), disabled: !sourceIsImage },
        { label: '좌우 반전', onClick: () => setTf({ ...tf, flipH: !tf.flipH }), checked: !!tf.flipH, disabled: !sourceIsImage },
        { label: '상하 반전', onClick: () => setTf({ ...tf, flipV: !tf.flipV }), checked: !!tf.flipV, disabled: !sourceIsImage },
        'sep',
        { label: '자르기', shortcut: 'C', onClick: () => setCropMode(!cropMode), checked: cropMode, disabled: !hasFiles },
        { label: '자르기 해제', onClick: () => (setCrop(null), setCropMode(false)), disabled: !hasCrop(crop) }
      ]
    },
    {
      label: '도구(T)',
      items: [
        { label: '배경: 원본', onClick: () => setBg({ ...bg, mode: 'none' }), checked: bg.mode === 'none', disabled: !hasFiles },
        { label: '배경: 흰색 → 투명', onClick: () => setBg({ ...bg, mode: 'white' }), checked: bg.mode === 'white', disabled: !alphaTarget },
        { label: '배경: AI 배경 제거', onClick: () => setBg({ ...bg, mode: 'ai' }), checked: bg.mode === 'ai', disabled: !sourceIsImage },
        'sep',
        { label: '워터마크', onClick: () => setWm({ ...wm, enabled: !wm.enabled }), checked: wm.enabled, disabled: !hasFiles || target === 'svg' },
        'sep',
        { label: 'PDF 전체 병합', onClick: () => void handlePdfTool({ op: 'merge' }), disabled: files.filter((f) => f.kind === 'pdf').length < 2 }
      ]
    },
    {
      label: '보기(V)',
      items: [
        { label: '파일 목록', shortcut: 'Ctrl+B', onClick: () => setSidebarOpen(!sidebarOpen), checked: sidebarOpen },
        'sep',
        { label: '확대', shortcut: 'Ctrl+=', onClick: () => previewRef.current?.zoomIn(), disabled: !hasFiles },
        { label: '축소', shortcut: 'Ctrl+-', onClick: () => previewRef.current?.zoomOut(), disabled: !hasFiles },
        { label: '화면에 맞춤', shortcut: 'Ctrl+0', onClick: () => previewRef.current?.fit(), disabled: !hasFiles },
        { label: '실제 크기', shortcut: 'Ctrl+1', onClick: () => previewRef.current?.actual(), disabled: !hasFiles },
        'sep',
        // 크롬 스킨 13종 (sh-web-editor DEXT5 실측) — 구조는 같고 띠 색만 바뀐다
        ...(Object.keys(SKINS) as SkinName[]).map((name) => ({
          label: `스킨: ${SKIN_LABELS[name]}`,
          onClick: () => {
            applySkin(name)
            setSkin(name)
          },
          checked: skin === name
        }))
      ]
    },
    { label: '도움말(H)', items: [{ label: '파일 변환기 정보', onClick: () => setDialog('about') }] }
  ]

  // ── 단축키 (메뉴 표기와 1:1) ──
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent): void => {
    if (dialog) return // 대화상자가 떠 있으면 대화상자가 키를 받는다
    const k = e.key.toLowerCase()
    const ctrl = e.ctrlKey || e.metaKey
    const typing = isTyping(e.target)
    const run = (fn: () => void): void => {
      e.preventDefault()
      fn()
    }
    if (ctrl && !e.altKey && k === 'o') return run(openPicker)
    if (ctrl && !e.altKey && !e.shiftKey && k === 's') return run(() => void handleConvert())
    if (typing) return
    if (ctrl && e.altKey && e.shiftKey && k === 's' && active && (target === 'jpeg' || target === 'webp')) return run(() => setDialog('export'))
    if (ctrl && !e.shiftKey && k === 'z') return run(history.undo)
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) return run(history.redo)
    if (ctrl && e.altKey && k === 'i' && activeDims) return run(() => setDialog('imageSize'))
    if (ctrl && e.altKey && k === 'c' && boxDims) return run(() => setDialog('canvasSize'))
    if (ctrl && !e.altKey && k === 'm' && hasFiles) return run(() => void openAdjust())
    if (ctrl && e.shiftKey && !e.altKey && k === 'c' && active) return run(() => void copyResult())
    if (ctrl && e.shiftKey && k === 'p' && rawActive?.previewUrl) return run(() => setDialog('perspective'))
    if (ctrl && e.shiftKey && k === 'f' && hasFiles) return run(() => setDialog('filters'))
    if (ctrl && e.shiftKey && k === 'e' && hasFiles) return run(() => setDialog('effects'))
    if (ctrl && e.shiftKey && k === 'l' && activeDims) return run(() => void autoLevelsNow())
    if (ctrl && !e.altKey && !e.shiftKey && k === 'i' && hasFiles) return run(() => setAdjust({ ...adjust, invert: !adjust.invert }))
    if (ctrl && k === 'b') return run(() => setSidebarOpen(!sidebarOpen))
    if (ctrl && (k === '=' || k === '+')) return run(() => previewRef.current?.zoomIn())
    if (ctrl && k === '-') return run(() => previewRef.current?.zoomOut())
    if (ctrl && k === '0') return run(() => previewRef.current?.fit())
    if (ctrl && k === '1') return run(() => previewRef.current?.actual())
    if (!ctrl && !e.altKey && k === 'c' && hasFiles) return run(() => setCropMode(!cropMode))
    if (!ctrl && k === 'escape' && cropMode) return run(() => setCropMode(false))
    if (!ctrl && k === 'delete' && active) return run(() => removeFile(active.id))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── 렌더 미리보기: 필터·효과·내용 인식 채우기는 CSS 로 흉내 낼 수 없어 실제 파이프라인을 축소 배율로 돌린다 ──
  const needsRender =
    !!active && target !== 'svg' && !(sourceIsImage && target === 'pdf' && effFiles.length > 1) && (hasFilters(filters) || hasEffects(effects) || canvasSize?.background === CONTENT_FILL)
  const renderKey = needsRender && active ? JSON.stringify([keyOf(active), target, resize, tf, adjust, filters, effects, canvasSize, bg, scale, frame?.page ?? 0, activeDims]) : ''
  useEffect(() => {
    if (!needsRender || !active || !target) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const base = buildOptions('png')
        let s = 1
        const opts: ConvertOptions = { ...base, crop: null, watermark: undefined, matteLimit: 1024 }
        if (FORMATS[active.kind].isImage && activeDims) {
          // 출력 크기를 긴 변 RENDER_PREVIEW_SIDE 로 줄여 계산 — px 단위 옵션(흐림·외곽선·캔버스)도 같은 배율로
          const eff = targetSize(activeDims.width, activeDims.height, resize)
          s = Math.min(1, RENDER_PREVIEW_SIDE / Math.max(eff.width, eff.height))
          opts.resize = { width: Math.max(1, Math.round(eff.width * s)), height: Math.max(1, Math.round(eff.height * s)) }
        } else if (active.kind === 'pdf') {
          s = 1 / scale // PDF 는 1x(72dpi)로 렌더하고 px 옵션을 그만큼 줄인다
          opts.scale = 1
          opts.pageIndices = [frame?.page ?? 0]
          if (resize) opts.resize = { width: resize.width && resize.width * s, height: resize.height && resize.height * s }
        }
        opts.filters = scaleFilters(filters, s)
        opts.effects = scaleEffects(effects, s)
        if (canvasSize && canvasSize.mode !== 'square') opts.canvasSize = { ...canvasSize, width: canvasSize.width * s, height: canvasSize.height * s }
        const [r] = await runConversion([active], opts)
        if (cancelled || !r) return
        const bmp = await createImageBitmap(new Blob([r.bytes as unknown as BlobPart], { type: 'image/png' }))
        const next = { key: renderKey, url: bytesToUrl(r.bytes, 'image/png'), w: Math.round(bmp.width / s), h: Math.round(bmp.height / s) }
        bmp.close()
        setRendered((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return next
        })
      } catch (e) {
        if (!cancelled) setStatus({ kind: 'err', text: `미리보기를 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}` })
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [renderKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // 새 결과가 나올 때까지는 직전 렌더를 계속 보여 준다 (깜빡임 방지) — 렌더 미리보기가 꺼지면 바로 원래 미리보기
  const renderedOn = needsRender && !!rendered

  // ── 상태 줄 ──
  const outDims = frame ? (hasCrop(crop) ? { w: Math.round(crop.w * frame.w), h: Math.round(crop.h * frame.h) } : { w: frame.w, h: frame.h }) : null
  const panes: string[] = [`파일 ${files.length}개`]
  if (activeDims && outDims) panes.push(`${dims(activeDims.width, activeDims.height)} → ${dims(outDims.w, outDims.h)}px`)
  else if (outDims) panes.push(`${dims(outDims.w, outDims.h)}px`)
  if (dpi) panes.push(`${Math.round(dpi)}dpi`)
  if (frame && frame.pages > 1) panes.push(`${frame.page + 1}/${frame.pages}쪽`)
  if (frame) panes.push(`${frame.zoomPct}%`)
  const message =
    progress?.label ??
    (status?.kind === 'err' ? status.text : busy ? '작업 중…' : hasFiles ? (cropMode ? '자르기: 드래그로 영역 지정 · Shift 비율 고정 · Alt 가운데 기준 · Esc 끝내기' : '준비') : '파일을 추가하세요')

  // 변환 대상이 투명을 담는지 → 캔버스 크기 투명·배경 체커 표시
  const previewCanvas = canvasSize && boxDims && changesCanvas(boxDims.width, boxDims.height, canvasSize) ? canvasSize : canvasSize && commonKind === 'pdf' ? canvasSize : null
  const pdfTargetImage = commonKind === 'pdf' && targetIsImage

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: color.sunken }}>
      <TitleBar subtitle={active ? active.name : undefined} />
      <MenuBar menus={menus} />
      <ConvertToolbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onAddFiles={openPicker}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        commonKind={commonKind}
        targets={targets}
        target={target}
        onTarget={setTarget}
        busy={busy}
        fileCount={files.length}
        onConvert={() => void handleConvert()}
      />
      <OptionsBar
        commonKind={commonKind}
        targets={targets}
        target={target}
        targetIsImage={targetIsImage}
        sourceIsImage={sourceIsImage}
        scale={scale}
        onScale={setScale}
        resizeW={resizeW}
        resizeH={resizeH}
        onResizeW={setResizeW}
        onResizeH={setResizeH}
        dpi={dpi}
        onOpenImageSize={() => (activeDims ? setDialog('imageSize') : setStatus({ kind: 'info', text: '이미지 파일을 선택하면 쓸 수 있습니다.' }))}
        canvasSize={canvasSize}
        onOpenCanvasSize={() => setDialog('canvasSize')}
        quality={quality}
        onQuality={setQuality}
        onOpenExport={() => setDialog('export')}
        tf={tf}
        onTf={setTf}
        adjust={adjust}
        onOpenAdjust={() => void openAdjust()}
        filters={filters}
        onOpenFilters={() => setDialog('filters')}
        effects={effects}
        onOpenEffects={() => setDialog('effects')}
        warped={!!rawActive && !!warps[rawActive.id]}
        onOpenPerspective={() => setDialog('perspective')}
        crop={crop}
        cropMode={cropMode}
        cropAspect={cropAspect}
        onCrop={setCrop}
        onCropMode={setCropMode}
        onCropAspect={setCropAspect}
        frameSize={frame ? { w: frame.w, h: frame.h } : null}
        bg={bg}
        onBg={setBg}
        pdfCount={files.filter((f) => f.kind === 'pdf').length}
        onPdfTool={(req) => void handlePdfTool(req)}
        wm={wm}
        onWm={setWm}
      />

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {sidebarOpen && <FileSidebar files={effFiles} activeId={activeId} onSelect={setActiveId} onRemove={removeFile} onMove={moveFile} onAddFiles={openPicker} />}
        <Box onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: color.sunken }}>
          {!hasFiles ? (
            <DropZone onFiles={(f) => void addFiles(f)} />
          ) : (
            <Preview
              ref={previewRef}
              source={renderedOn ? { type: 'images', urls: [rendered!.url] } : previewSource}
              natOverride={renderedOn ? { w: rendered!.w, h: rendered!.h } : null}
              watermark={target && wm.enabled && target !== 'svg' ? wm : undefined}
              transform={sourceIsImage && !renderedOn ? tf : undefined}
              resize={(sourceIsImage || pdfTargetImage) && !renderedOn ? resize : undefined}
              adjust={target !== 'svg' && !renderedOn ? adjust : undefined}
              canvasSize={renderedOn ? null : previewCanvas}
              crop={crop}
              cropMode={cropMode}
              cropAspect={cropAspectValue}
              onCrop={setCrop}
              whiteTolerance={bg.mode === 'white' && alphaTarget && !renderedOn ? bg.tolerance : null}
              transparent={bg.mode !== 'none' && alphaTarget}
              onFrame={setFrame}
            />
          )}
        </Box>
      </Box>

      <StatusBar message={message} progress={progress ? (progress.value ?? null) : undefined} panes={panes} />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          if (e.target.files) void addFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />

      <Suspense fallback={null}>
        {dialog === 'imageSize' && <ImageSizeDialog open source={activeDims} initialDpi={dpi} fileCount={files.length} onClose={() => setDialog(null)} onApply={applyImageSize} />}
        {dialog === 'canvasSize' && (
          <CanvasSizeDialog
            open
            frame={boxDims ?? (frame ? { width: frame.w, height: frame.h } : null)}
            value={canvasSize}
            onClose={() => setDialog(null)}
            onApply={(v) => {
              setCanvasSize(v)
              setDialog(null)
            }}
          />
        )}
        {dialog === 'export' && (
          <ExportDialog
            open
            formatLabel={target ? FORMATS[target].label : ''}
            opaque={!!target && !supportsAlpha(target)}
            quality={quality}
            matte={matte}
            encode={encodeSample}
            onClose={() => setDialog(null)}
            onApply={(q, m) => {
              setQuality(q)
              setMatte(m)
              setDialog(null)
            }}
          />
        )}
        {dialog === 'adjust' && <AdjustDialog open value={adjust} hist={hist} sample={sample} onChange={setAdjust} onClose={() => setDialog(null)} />}
        {dialog === 'filters' && <FiltersDialog value={filters} onChange={setFilters} onClose={() => setDialog(null)} />}
        {dialog === 'effects' && <EffectsDialog value={effects} onChange={setEffects} onClose={() => setDialog(null)} />}
        {dialog === 'perspective' && rawActive?.previewUrl && (
          <PerspectiveDialog url={rawActive.previewUrl} fileName={rawActive.name} value={warps[rawActive.id] ?? null} onClose={() => setDialog(null)} onApply={(q) => void applyWarp(q)} />
        )}
        {dialog === 'about' && <AboutDialog open onClose={() => setDialog(null)} />}
      </Suspense>

      <Snackbar
        open={!!status}
        autoHideDuration={status?.kind === 'err' ? null : 5000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return
          setStatus(null)
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ bottom: '30px !important' }}
      >
        <Alert
          severity={status?.kind === 'ok' ? 'success' : status?.kind === 'err' ? 'error' : 'info'}
          variant="standard"
          onClose={() => setStatus(null)}
          sx={{ boxShadow: shadow.raised, bgcolor: color.canvas, maxWidth: 560 }}
        >
          {status?.text}
        </Alert>
      </Snackbar>
    </Box>
  )
}
