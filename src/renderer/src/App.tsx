import { useEffect, useMemo, useRef, useState, DragEvent } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { detectFileKind, targetsFor, FileKind, FORMATS } from '@core/index'
import { AppFile } from './types'
import { runConversion } from './convert'
import { DicomMeta } from './convert/dicom'
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

const EMPTY_DICOM: DicomMeta = { patientName: '', patientID: '', patientSex: '', modality: 'OT' }
let idSeq = 0

export default function App(): JSX.Element {
  const [files, setFiles] = useState<AppFile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [target, setTarget] = useState<FileKind | null>(null)
  const [scale, setScale] = useState(2)
  const [resizeW, setResizeW] = useState('')
  const [resizeH, setResizeH] = useState('')
  const [dicomMeta, setDicomMeta] = useState<DicomMeta>(EMPTY_DICOM)
  const [wm, setWm] = useState<WatermarkOpts>(DEFAULT_WATERMARK)
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const commonKind = useMemo<FileKind | 'mixed' | null>(() => {
    if (files.length === 0) return null
    const first = files[0].kind
    return files.every((f) => f.kind === first) ? first : 'mixed'
  }, [files])

  const targets = commonKind && commonKind !== 'mixed' ? targetsFor(commonKind) : []
  const activeTarget = targets.find((t) => t.to === target) ?? null
  const targetIsImage = target ? FORMATS[target].isImage : false

  useEffect(() => {
    if (targets.length === 0) setTarget(null)
    else if (!targets.some((t) => t.to === target)) setTarget(targets[0].to)
  }, [commonKind]) // eslint-disable-line react-hooks/exhaustive-deps

  const previewSource = useMemo<PreviewSource>(() => {
    if (commonKind && commonKind !== 'mixed' && FORMATS[commonKind].isImage && target === 'pdf' && files.length > 0) {
      const urls = files.map((f) => f.previewUrl).filter((u): u is string => !!u)
      if (urls.length) return { type: 'images', urls }
    }
    const active = files.find((f) => f.id === activeId)
    if (!active) return null
    if (FORMATS[active.kind].isImage && active.previewUrl) return { type: 'images', urls: [active.previewUrl] }
    if (active.kind === 'pdf') return { type: 'pdf', bytes: active.bytes, scale: 2 }
    return null
  }, [files, activeId, commonKind, target])

  // 렌더러 크래시 → 자동 복구 후 안내 (조용히 리셋되면 "앱이 꺼졌다"로 오해)
  useEffect(() => {
    window.api.onRecovered?.(() => {
      setStatus({ kind: 'err', text: '화면 문제가 감지되어 자동 복구했습니다. 파일을 다시 추가해 주세요. (반복되면 알려주세요)' })
    })
  }, [])

  async function addFiles(incoming: File[]): Promise<void> {
    const loaded: AppFile[] = []
    for (const file of incoming) {
      const buf = new Uint8Array(await file.arrayBuffer())
      const kind = detectFileKind(file.name, buf.subarray(0, 140))
      const isImage = FORMATS[kind].isImage
      loaded.push({
        id: `f${idSeq++}`,
        name: file.name,
        kind,
        size: buf.length,
        bytes: buf,
        previewUrl: isImage ? URL.createObjectURL(new Blob([buf], { type: FORMATS[kind].mime })) : undefined
      })
    }
    setFiles((prev) => {
      const next = [...prev, ...loaded]
      if (!activeId && next.length) setActiveId(next[0].id)
      return next
    })
    setStatus(null)
  }

  function removeFile(id: string): void {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
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
    if (activeTarget?.needs === 'dicomMeta' && (!dicomMeta.patientName.trim() || !dicomMeta.patientID.trim())) {
      setStatus({ kind: 'err', text: '환자 이름과 환자 ID는 필수입니다.' })
      return
    }
    setBusy(true)
    setStatus({ kind: 'info', text: '변환 중…' })
    try {
      const w = Number(resizeW)
      const h = Number(resizeH)
      const resize = targetIsImage && (w > 0 || h > 0) ? { width: w > 0 ? w : undefined, height: h > 0 ? h : undefined } : undefined
      const results = await runConversion(files, {
        to: target,
        scale,
        resize,
        dicomMeta: activeTarget?.needs === 'dicomMeta' ? dicomMeta : undefined,
        watermark: target !== 'dicom' && wm.enabled ? wm : undefined
      })
      if (results.length === 0) throw new Error('변환 결과가 없습니다.')

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
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : '변환 중 오류가 발생했습니다.' })
    } finally {
      setBusy(false)
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
        commonKind={commonKind}
        targets={targets}
        target={target}
        onTarget={setTarget}
      />
      <OptionsBar
        commonKind={commonKind}
        targets={targets}
        target={target}
        activeTarget={activeTarget}
        targetIsImage={targetIsImage}
        scale={scale}
        onScale={setScale}
        resizeW={resizeW}
        resizeH={resizeH}
        onResizeW={setResizeW}
        onResizeH={setResizeH}
        dicomMeta={dicomMeta}
        onDicomMeta={setDicomMeta}
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
            <Preview source={previewSource} watermark={target && target !== 'dicom' && wm.enabled ? wm : undefined} />
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
        accept=".pdf,.png,.jpg,.jpeg,.webp,.dcm,.dicom"
        onChange={(e) => {
          if (e.target.files) void addFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />

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
