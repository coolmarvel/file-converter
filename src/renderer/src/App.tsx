import { useEffect, useMemo, useState } from 'react'
import { detectFileKind, targetsFor, FileKind, FORMATS } from '@core/index'
import { AppFile } from './types'
import { runConversion } from './convert'
import { DicomMeta } from './convert/dicom'
import { WatermarkOpts, DEFAULT_WATERMARK, WmLayout } from './watermark/model'
import { DropZone } from './components/DropZone'
import { FileCard } from './components/FileCard'
import { DicomForm } from './components/DicomForm'
import { Preview, PreviewSource } from './components/Preview'
import appIconUrl from './assets/app-icon.png'
import signUrl from './assets/sign.png'

type Status = { kind: 'info' | 'ok' | 'err'; text: string } | null

const EMPTY_DICOM: DicomMeta = { patientName: '', patientID: '', patientSex: '', modality: 'OT' }
let idSeq = 0

const PEN_COLORS = ['#111111', '#e53935', '#1e88e5', '#2e7d32', '#fbc02d']

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

  return (
    <div className="app">
      <header className="topbar">
        <img src={appIconUrl} className="brand-logo" alt="" />
        <h1>파일 변환기</h1>
        <span className="sub">PDF · 이미지 · DICOM 변환 · 오프라인</span>
      </header>

      <div className="main">
        <section className="left">
          <DropZone onFiles={addFiles} />
          <div className="panel preview-panel">
            <h2>미리보기</h2>
            <Preview source={previewSource} watermark={target && target !== 'dicom' && wm.enabled ? wm : undefined} />
          </div>
        </section>

        <aside className="right">
          <div className="panel filelist-panel">
            <h2>파일 {files.length > 0 && <span className="count-badge">{files.length}</span>}</h2>
            <div className="filelist">
              {files.length === 0 && <p className="empty">아직 추가된 파일이 없습니다.</p>}
              {files.map((f, i) => (
                <FileCard
                  key={f.id}
                  file={f}
                  index={i}
                  active={f.id === activeId}
                  canMoveUp={i > 0}
                  canMoveDown={i < files.length - 1}
                  onSelect={() => setActiveId(f.id)}
                  onRemove={() => removeFile(f.id)}
                  onMoveUp={() => moveFile(f.id, -1)}
                  onMoveDown={() => moveFile(f.id, 1)}
                />
              ))}
            </div>
          </div>

          <div className="panel convert-panel">
            <h2>변환</h2>

            <>
                {commonKind === null && <p className="hint">파일을 추가하면 변환 옵션이 나타납니다.</p>}
                {commonKind === 'mixed' && <p className="hint">같은 종류의 파일끼리만 함께 변환할 수 있어요. 종류가 섞여 있습니다.</p>}
                {commonKind && commonKind !== 'mixed' && targets.length === 0 && (
                  <p className="hint">{FORMATS[commonKind].label} 은(는) 현재 버전에서 변환 대상이 없습니다.</p>
                )}

                {targets.length > 0 && (
                  <>
                    <div className="targetgrid">
                      {targets.map((t) => (
                        <div key={t.to} className={`target${target === t.to ? ' on' : ''}`} onClick={() => setTarget(t.to)}>
                          <span>{target === t.to ? '●' : '○'}</span> {t.label}
                        </div>
                      ))}
                    </div>

                    {commonKind === 'pdf' && (
                      <label className="field">
                        <span>해상도</span>
                        <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                          <option value={1.5}>보통 (1.5x)</option>
                          <option value={2}>선명 (2x)</option>
                          <option value={3}>고화질 (3x)</option>
                        </select>
                      </label>
                    )}

                    {targetIsImage && (
                      <div className="optbox">
                        <div className="optbox-title">크기 (px) — 비우면 원본 유지</div>
                        <div className="size-row">
                          <label className="field size-field">
                            <span>가로</span>
                            <input type="number" min={1} placeholder="자동" value={resizeW} onChange={(e) => setResizeW(e.target.value)} />
                          </label>
                          <span className="size-x">×</span>
                          <label className="field size-field">
                            <span>세로</span>
                            <input type="number" min={1} placeholder="자동" value={resizeH} onChange={(e) => setResizeH(e.target.value)} />
                          </label>
                        </div>
                        <p className="hint" style={{ marginTop: 6 }}>한쪽만 입력하면 비율을 유지해요.</p>
                      </div>
                    )}

                    {activeTarget?.needs === 'dicomMeta' && <DicomForm meta={dicomMeta} onChange={setDicomMeta} />}

                    {target !== 'dicom' && <WatermarkControls wm={wm} onChange={setWm} />}

                    <button className="btn" disabled={busy || !target} onClick={handleConvert}>
                      {busy ? '변환 중…' : `${files.length}개 파일 변환 후 저장`}
                    </button>
                  </>
                )}
            </>

            {status && <div className={`status ${status.kind}`}>{status.text}</div>}
          </div>
        </aside>
      </div>

      <footer className="credit">
        <span className="cred-by">
          제작 · <b>이성현</b> · © 2026
        </span>
        <img className="cred-sign" src={signUrl} alt="이성현 서명" />
        <span className="cred-note">오프라인 동작 · 원본 파일은 수정하지 않습니다</span>
      </footer>
    </div>
  )
}

// ── 워터마크 옵션 ─────────────────────────────────────
function WatermarkControls({ wm, onChange }: { wm: WatermarkOpts; onChange: (w: WatermarkOpts) => void }): JSX.Element {
  const set = (patch: Partial<WatermarkOpts>) => onChange({ ...wm, ...patch })
  const layouts: { key: WmLayout; label: string }[] = [
    { key: 'diagonal', label: '대각선' },
    { key: 'tile', label: '바둑판' },
    { key: 'corner', label: '모서리' }
  ]
  return (
    <div className="optbox wmbox">
      <label className="edittoggle" style={{ margin: 0, background: 'transparent', padding: 0 }}>
        <input type="checkbox" checked={wm.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span>💧 워터마크 넣기</span>
      </label>

      {wm.enabled && (
        <div style={{ marginTop: 10 }}>
          <div className="toolrow" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 10 }}>
            <button className={`toolbtn${wm.type === 'text' ? ' on' : ''}`} onClick={() => set({ type: 'text' })}>
              텍스트
            </button>
            <button className={`toolbtn${wm.type === 'signature' ? ' on' : ''}`} onClick={() => set({ type: 'signature' })}>
              내 서명
            </button>
          </div>

          {wm.type === 'text' && (
            <label className="field">
              <span>문구</span>
              <input value={wm.text} onChange={(e) => set({ text: e.target.value })} placeholder="예: 이성현 · 대외비" />
            </label>
          )}

          <label className="field">
            <span>배치</span>
            <div className="toolrow" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {layouts.map((l) => (
                <button key={l.key} className={`toolbtn${wm.layout === l.key ? ' on' : ''}`} onClick={() => set({ layout: l.key })}>
                  {l.label}
                </button>
              ))}
            </div>
          </label>

          {wm.type === 'text' && (
            <div className="swatches" style={{ marginTop: 10 }}>
              {PEN_COLORS.map((c) => (
                <button key={c} className={`swatch${wm.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} title={c} />
              ))}
              <input type="color" value={wm.color} onChange={(e) => set({ color: e.target.value })} className="colorpick" title="직접 선택" />
            </div>
          )}

          <label className="field">
            <span>크기 ({wm.sizePct}%)</span>
            <input type="range" min={5} max={60} value={wm.sizePct} onChange={(e) => set({ sizePct: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>진하기 ({Math.round(wm.opacity * 100)}%)</span>
            <input type="range" min={0.05} max={1} step={0.05} value={wm.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
          </label>
          {wm.layout === 'tile' && (
            <label className="field">
              <span>간격 ({wm.gapPct}%)</span>
              <input type="range" min={5} max={120} step={5} value={wm.gapPct} onChange={(e) => set({ gapPct: Number(e.target.value) })} />
            </label>
          )}
          {wm.layout !== 'corner' && (
            <label className="field">
              <span>기울기 ({wm.rotationDeg}°)</span>
              <input type="range" min={-90} max={90} step={5} value={wm.rotationDeg} onChange={(e) => set({ rotationDeg: Number(e.target.value) })} />
            </label>
          )}
          <p className="hint">미리보기에 실시간 표시돼요. DICOM 대상에는 적용되지 않고, 변환 결과물에만 찍힙니다.</p>
        </div>
      )}
    </div>
  )
}
