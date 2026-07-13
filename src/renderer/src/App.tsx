import { useEffect, useMemo, useRef, useState, DragEvent } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import { detectFileKind, targetsFor, FileKind, FORMATS } from '@core/index'
import { AppFile } from './types'
import { runConversion, BgOptions, NamedBytes } from './convert'
import { Transform, CropRect, supportsAlpha } from './convert/image'
import type { PdfToolRequest } from './convert/pdftools'
import { WatermarkOpts, DEFAULT_WATERMARK } from './watermark/model'
import TopBar from './components/TopBar'
import ConvertToolbar from './components/ConvertToolbar'
import OptionsBar from './components/OptionsBar'
import FileSidebar from './components/FileSidebar'
import { DropZone } from './components/DropZone'
import { Preview, PreviewSource } from './components/Preview'
import { ui } from './theme'
import signUrl from './assets/sign.png'

type Status = { kind: 'info' | 'ok' | 'err'; text: string } | null
/** 오래 걸리는 작업의 진행 표시 (value 없으면 불확정 바) */
type Progress = { label: string; value?: number } | null

const DEFAULT_TRANSFORM: Transform = { rotate: 0, flipH: false, flipV: false, grayscale: false }
const DEFAULT_BG: BgOptions = { mode: 'none', tolerance: 12 }
let idSeq = 0

/** undo/redo 이력 한 칸 — 작업 결과에 영향을 주는 상태 전부의 스냅샷 (bytes는 불변이라 참조 공유) */
interface Snapshot {
  files: AppFile[]
  activeId: string | null
  target: FileKind | null
  scale: number
  resizeW: string
  resizeH: string
  quality: number
  tf: Transform
  crop: CropRect | null
  bg: BgOptions
  wm: WatermarkOpts
}

const HISTORY_MAX = 100
/** 슬라이더 드래그·연속 타이핑을 이력 한 칸으로 묶는 침묵 시간(ms) */
const HISTORY_DEBOUNCE = 400

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (Object.keys(a) as (keyof Snapshot)[]).every((k) => a[k] === b[k])
}

export default function App(): JSX.Element {
  const [files, setFiles] = useState<AppFile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [target, setTarget] = useState<FileKind | null>(null)
  const [scale, setScale] = useState(2)
  const [resizeW, setResizeW] = useState('')
  const [resizeH, setResizeH] = useState('')
  const [quality, setQuality] = useState(92) // % — jpeg/webp 인코딩 품질
  const [tf, setTf] = useState<Transform>(DEFAULT_TRANSFORM)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [bg, setBg] = useState<BgOptions>(DEFAULT_BG)
  const [wm, setWm] = useState<WatermarkOpts>(DEFAULT_WATERMARK)
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [histState, setHistState] = useState({ canUndo: false, canRedo: false })
  const fileInputRef = useRef<HTMLInputElement>(null)
  // AI 배경 제거 결과 캐시 (fileId → PNG 바이트/미리보기 URL). 이력 대상 아님 — 같은 파일 재계산 방지용
  const aiCache = useRef<Map<string, Uint8Array>>(new Map())
  const [aiUrls, setAiUrls] = useState<Map<string, string>>(new Map())
  const aiGen = useRef(0) // 파일/모드 변경 시 이전 배치 결과 무시

  const commonKind = useMemo<FileKind | 'mixed' | null>(() => {
    if (files.length === 0) return null
    const first = files[0].kind
    return files.every((f) => f.kind === first) ? first : 'mixed'
  }, [files])

  const targets = commonKind && commonKind !== 'mixed' ? targetsFor(commonKind) : []
  const targetIsImage = target ? FORMATS[target].isImage : false
  const sourceIsImage = !!commonKind && commonKind !== 'mixed' && FORMATS[commonKind].isImage

  // 변환·미리보기가 같은 값을 쓰는 출력 크기 (한쪽만 입력 = 비율 유지)
  const rw = Number(resizeW)
  const rh = Number(resizeH)
  const resize = rw > 0 || rh > 0 ? { width: rw > 0 ? rw : undefined, height: rh > 0 ? rh : undefined } : undefined

  useEffect(() => {
    if (targets.length === 0) setTarget(null)
    else if (!targets.some((t) => t.to === target)) setTarget(targets[0].to)
  }, [commonKind]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── undo/redo ──────────────────────────────────────────────────────────
  // 상태 변경을 지켜보다가 잠잠해지면(디바운스) 직전 스냅샷을 이력에 쌓는다.
  // 자르기 드래그·슬라이더처럼 연속으로 바뀌는 조작이 이력 한 칸이 되도록.
  const snapshot: Snapshot = { files, activeId, target, scale, resizeW, resizeH, quality, tf, crop, bg, wm }
  const hist = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] })
  const committed = useRef<Snapshot>(snapshot) // 마지막으로 이력에 반영된 상태
  const restoring = useRef(false) // undo/redo로 인한 상태 변경은 이력에 다시 쌓지 않는다
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapRef = useRef(snapshot)
  snapRef.current = snapshot

  const syncHistState = (): void =>
    setHistState((prev) => {
      const next = { canUndo: hist.current.past.length > 0, canRedo: hist.current.future.length > 0 }
      return prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next
    })

  /** 대기 중(디바운스)인 변경을 즉시 이력에 반영 */
  const flushHistory = (): void => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
    if (!sameSnapshot(committed.current, snapRef.current)) {
      hist.current.past.push(committed.current)
      if (hist.current.past.length > HISTORY_MAX) hist.current.past.shift()
      hist.current.future = []
      committed.current = snapRef.current
      syncHistState()
    }
  }

  useEffect(() => {
    if (restoring.current) {
      restoring.current = false
      committed.current = snapRef.current
      return
    }
    if (sameSnapshot(committed.current, snapRef.current)) return
    if (commitTimer.current) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(flushHistory, HISTORY_DEBOUNCE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, activeId, target, scale, resizeW, resizeH, quality, tf, crop, bg, wm])

  function applySnapshot(s: Snapshot): void {
    restoring.current = true
    setFiles(s.files)
    setActiveId(s.activeId)
    setTarget(s.target)
    setScale(s.scale)
    setResizeW(s.resizeW)
    setResizeH(s.resizeH)
    setQuality(s.quality)
    setTf(s.tf)
    setCrop(s.crop)
    setBg(s.bg)
    setWm(s.wm)
  }

  function undo(): void {
    flushHistory()
    const prev = hist.current.past.pop()
    if (!prev) return
    hist.current.future.push(committed.current)
    committed.current = prev
    applySnapshot(prev)
    syncHistState()
  }

  function redo(): void {
    flushHistory()
    const next = hist.current.future.pop()
    if (!next) return
    hist.current.past.push(committed.current)
    committed.current = next
    applySnapshot(next)
    syncHistState()
  }

  const undoRef = useRef({ undo, redo })
  undoRef.current = { undo, redo }

  // Ctrl+Z / Ctrl+Y (또는 Ctrl+Shift+Z) — 입력창에 포커스가 있으면 브라우저 기본 동작에 양보
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoRef.current.undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        undoRef.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // AI 배경 제거가 켜져 있으면 제거된 결과 URL을 미리보기로 (WYSIWYG)
  const urlOf = (f: AppFile): string | undefined => (bg.mode === 'ai' ? aiUrls.get(f.id) ?? f.previewUrl : f.previewUrl)

  const previewSource = useMemo<PreviewSource>(() => {
    if (commonKind && commonKind !== 'mixed' && FORMATS[commonKind].isImage && target === 'pdf' && files.length > 0) {
      const urls = files.map(urlOf).filter((u): u is string => !!u)
      if (urls.length) return { type: 'images', urls }
    }
    const active = files.find((f) => f.id === activeId)
    if (!active) return null
    if (FORMATS[active.kind].isImage && active.previewUrl) return { type: 'images', urls: [urlOf(active)!] }
    if (active.kind === 'pdf') return { type: 'pdf', bytes: active.bytes, scale: 2 }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, activeId, commonKind, target, bg.mode, aiUrls])

  // AI 배경 제거: 켜지면 이미지 파일들을 순차 처리해 미리보기·변환 공용 캐시에 담는다
  useEffect(() => {
    if (bg.mode !== 'ai' || !sourceIsImage) return
    const todo = files.filter((f) => FORMATS[f.kind].isImage && !aiCache.current.has(f.id))
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
          aiCache.current.set(f.id, png)
          const url = URL.createObjectURL(new Blob([png as unknown as BlobPart], { type: 'image/png' }))
          setAiUrls((prev) => new Map(prev).set(f.id, url))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg.mode, files, sourceIsImage])

  // 렌더러 크래시 → 자동 복구 후 안내 (조용히 리셋되면 "앱이 꺼졌다"로 오해)
  useEffect(() => {
    window.api.onRecovered?.(() => {
      setStatus({ kind: 'err', text: '화면 문제가 감지되어 자동 복구했습니다. 파일을 다시 추가해 주세요. (반복되면 알려주세요)' })
    })
  }, [])

  async function addFiles(incoming: File[]): Promise<void> {
    const loaded: AppFile[] = []
    try {
      for (const file of incoming) {
        let buf = new Uint8Array(await file.arrayBuffer())
        let kind = detectFileKind(file.name, buf.subarray(0, 512)) // SVG 텍스트 마커까지 커버
        let srcKind: FileKind | undefined
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
          previewUrl: isImage ? URL.createObjectURL(new Blob([buf], { type: FORMATS[kind].mime })) : undefined
        })
      }
    } finally {
      setProgress(null)
    }
    if (loaded.length === 0) return
    setFiles((prev) => {
      const next = [...prev, ...loaded]
      if (!activeId && next.length) setActiveId(next[0].id)
      return next
    })
    setStatus(null)
  }

  // Ctrl+V — 클립보드의 이미지(스크린샷 등)를 파일로 추가
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const items = e.clipboardData?.items
      if (!items) return
      const images: File[] = []
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) {
            const ext = (f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
            images.push(new File([f], f.name && f.name !== 'image.png' ? f.name : `붙여넣기_${new Date().toLocaleTimeString('ko', { hour12: false }).replaceAll(':', '')}.${ext}`, { type: f.type }))
          }
        }
      }
      if (images.length) {
        e.preventDefault()
        void addFiles(images)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  function removeFile(id: string): void {
    // previewUrl은 revoke하지 않는다 — undo로 파일을 되살릴 때 다시 쓴다 (앱 종료 시 일괄 해제됨)
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  function moveFile(id: string, dir: -1 | 1): void {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function handleConvert(): Promise<void> {
    if (!target || files.length === 0) return
    setBusy(true)
    setStatus(null)
    setProgress({ label: '변환 준비 중…' })
    try {
      const results = await runConversion(files, {
        to: target,
        scale,
        resize,
        quality: quality / 100,
        transform: sourceIsImage ? tf : undefined,
        crop,
        bg: sourceIsImage || commonKind === 'pdf' ? bg : undefined,
        aiCache: aiCache.current,
        watermark: wm.enabled ? wm : undefined,
        onProgress: (done, total, label) =>
          setProgress({ label: label ?? `변환 중… (${Math.min(done + 1, total)}/${total})`, value: total > 0 ? Math.round((done / total) * 100) : undefined })
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

  const openPicker = (): void => fileInputRef.current?.click()

  // 파일이 이미 있어도 본문 어디에나 끌어다 놓으면 추가되도록 (랜딩 드롭존과 별개)
  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    if (e.dataTransfer.files.length) void addFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar busy={busy} fileCount={files.length} canConvert={!!target && files.length > 0} onConvert={() => void handleConvert()} />
      <ConvertToolbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onAddFiles={openPicker}
        canUndo={histState.canUndo}
        canRedo={histState.canRedo}
        onUndo={undo}
        onRedo={redo}
        commonKind={commonKind}
        targets={targets}
        target={target}
        onTarget={setTarget}
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
        quality={quality}
        onQuality={setQuality}
        tf={tf}
        onTf={setTf}
        crop={crop}
        cropMode={cropMode}
        onCrop={setCrop}
        onCropMode={setCropMode}
        bg={bg}
        onBg={setBg}
        pdfCount={files.filter((f) => f.kind === 'pdf').length}
        onPdfTool={(req) => void handlePdfTool(req)}
        wm={wm}
        onWm={setWm}
      />

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {sidebarOpen && (
          <FileSidebar files={files} activeId={activeId} onSelect={setActiveId} onRemove={removeFile} onMove={moveFile} onAddFiles={openPicker} />
        )}
        <Box
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.default', p: 2 }}
        >
          {files.length === 0 ? (
            <DropZone onFiles={(f) => void addFiles(f)} />
          ) : (
            <Preview
              source={previewSource}
              watermark={target && wm.enabled ? wm : undefined}
              transform={sourceIsImage ? tf : undefined}
              resize={resize}
              crop={crop}
              cropMode={cropMode}
              onCrop={setCrop}
              whiteTolerance={bg.mode === 'white' && target && supportsAlpha(target) ? bg.tolerance : null}
              transparent={bg.mode !== 'none' && !!target && supportsAlpha(target)}
            />
          )}
        </Box>
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 0.4, borderTop: 1, borderColor: 'divider', bgcolor: '#fff', flexShrink: 0 }}
      >
        <Typography variant="caption" sx={{ color: ui.gray[500] }}>
          제작 · <b>이성현</b> · © 2026
        </Typography>
        <Box component="img" src={signUrl} alt="이성현 서명" sx={{ height: 16, opacity: 0.8 }} />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: ui.gray[400] }}>
          오프라인 동작 · 원본 파일은 수정하지 않습니다
        </Typography>
      </Stack>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif,.svg,.avif,.heic,.heif,.tif,.tiff,.ico"
        onChange={(e) => {
          if (e.target.files) void addFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />

      {progress && (
        <Paper
          elevation={6}
          sx={{ position: 'fixed', bottom: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 1400, px: 2.5, py: 1.5, borderRadius: 3, minWidth: 340, maxWidth: '80vw' }}
        >
          <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mb: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {progress.label}
            </Typography>
          </Stack>
          <LinearProgress variant={progress.value != null ? 'determinate' : 'indeterminate'} value={progress.value ?? 0} sx={{ borderRadius: 1 }} />
        </Paper>
      )}

      <Snackbar
        open={!!status}
        autoHideDuration={status?.kind === 'err' ? null : 5000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return
          setStatus(null)
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={status?.kind === 'ok' ? 'success' : status?.kind === 'err' ? 'error' : 'info'}
          variant="filled"
          onClose={() => setStatus(null)}
          sx={{ boxShadow: ui.shadow.lg }}
        >
          {status?.text}
        </Alert>
      </Snackbar>
    </Box>
  )
}
