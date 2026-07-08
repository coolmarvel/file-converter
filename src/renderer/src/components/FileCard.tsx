import { MouseEvent as RMouseEvent } from 'react'
import { FORMATS } from '@core/index'
import { AppFile } from '../types'

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function FileCard({
  file,
  active,
  index,
  canMoveUp,
  canMoveDown,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown
}: {
  file: AppFile
  active: boolean
  /** 목록 내 순서(1-based 표시용) */
  index: number
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}): JSX.Element {
  const info = FORMATS[file.kind]
  const stop = (fn: () => void) => (e: RMouseEvent) => {
    e.stopPropagation()
    fn()
  }
  return (
    <div className={`filecard selectable${active ? ' active' : ''}`} onClick={onSelect}>
      <div className="order">
        <button className="ordbtn" title="위로" disabled={!canMoveUp} onClick={stop(onMoveUp)}>
          ▲
        </button>
        <span className="ordnum">{index + 1}</span>
        <button className="ordbtn" title="아래로" disabled={!canMoveDown} onClick={stop(onMoveDown)}>
          ▼
        </button>
      </div>
      <div className="thumb">
        {file.previewUrl ? <img src={file.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : info.label}
      </div>
      <div className="meta">
        <div className="name" title={file.name}>
          {file.name}
        </div>
        <div className="info">
          <span className={`badge${file.kind === 'unknown' ? ' warn' : ''}`}>{info.label}</span>{' '}
          {humanSize(file.size)}
        </div>
      </div>
      <button className="iconbtn" title="제거" onClick={stop(onRemove)}>
        ✕
      </button>
    </div>
  )
}
