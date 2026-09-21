import { memo } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import CloseRounded from '@mui/icons-material/CloseRounded'
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import { FORMATS } from '@core/index'
import { AppFile } from '../types'
import { humanSize } from '../util/format'
import { ui } from '../theme'

const { color, chrome, size, space, font, surface } = ui

interface RowProps {
  file: AppFile
  index: number
  active: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
}

/** 파일 목록 한 행 (34px) — 선택 행은 accent 채움 + 흰 글자 (클래식 목록 선택) */
const FileRow = memo(function FileRow({ file, index, active, canMoveUp, canMoveDown, onSelect, onRemove, onMove }: RowProps): JSX.Element {
  const info = FORMATS[file.srcKind ?? file.kind] // HEIC/TIFF는 원래 포맷으로 배지 표시
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  const fg = active ? color.textOnAccent : color.text
  const sub = active ? color.textOnAccent : color.textSecondary
  const btnSx = { width: 16, height: 14, color: sub, '&:hover': { bgcolor: color.canvas, color: color.text } }
  return (
    <Box
      role="option"
      aria-selected={active}
      onClick={() => onSelect(file.id)}
      sx={{
        height: size.fileRow,
        display: 'flex',
        alignItems: 'center',
        gap: `${space.md}px`,
        px: `${space.sm}px`,
        borderBottom: `1px solid ${color.border}`,
        bgcolor: active ? color.accent : 'transparent',
        color: fg,
        '&:hover': { bgcolor: active ? color.accent : color.hover }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <IconButton disabled={!canMoveUp} onClick={stop(() => onMove(file.id, -1))} aria-label="위로" sx={btnSx}>
          <KeyboardArrowUpRounded sx={{ fontSize: '14px !important' }} />
        </IconButton>
        <IconButton disabled={!canMoveDown} onClick={stop(() => onMove(file.id, 1))} aria-label="아래로" sx={btnSx}>
          <KeyboardArrowDownRounded sx={{ fontSize: '14px !important' }} />
        </IconButton>
      </Box>
      <Box className="tnum" sx={{ width: 16, fontSize: font.xs, color: sub, textAlign: 'right', flexShrink: 0 }}>
        {index + 1}
      </Box>
      <Box
        sx={{
          width: size.thumb,
          height: size.thumb,
          flexShrink: 0,
          border: `1px solid ${color.borderStrong}`,
          bgcolor: color.canvas,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        {file.previewUrl ? (
          <Box component="img" src={file.previewUrl} alt="" loading="lazy" decoding="async" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Box component="span" sx={{ fontSize: 9, fontWeight: font.bold, color: color.textSecondary }}>
            {info.label}
          </Box>
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, lineHeight: font.lhDense }}>
        <Box title={file.name} sx={{ fontSize: font.md, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {file.name}
        </Box>
        <Box className="tnum" sx={{ fontSize: font.xs, color: sub, whiteSpace: 'nowrap' }}>
          {info.label} · {humanSize(file.size)}
        </Box>
      </Box>
      <IconButton onClick={stop(() => onRemove(file.id))} aria-label="제거" title="제거" sx={{ flexShrink: 0, color: sub }}>
        <CloseRounded />
      </IconButton>
    </Box>
  )
})

export interface FileSidebarProps {
  files: AppFile[]
  activeId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onAddFiles: () => void
}

/** 좌측 파일 목록 (220px) — 머리 띠 + 목록. ↑/↓ 키로 선택 이동 */
export default function FileSidebar(p: FileSidebarProps): JSX.Element {
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = p.files.findIndex((f) => f.id === p.activeId)
    const j = Math.max(0, Math.min(p.files.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    if (p.files[j]) p.onSelect(p.files[j].id)
  }
  return (
    <Box sx={{ width: size.sidebar, flexShrink: 0, borderRight: `1px solid ${chrome.frame}`, bgcolor: color.canvas, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box
        sx={{
          height: size.toolBar - 4,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: `${space.sm}px`,
          px: `${space.base}px`,
          background: surface.toolbar,
          borderBottom: `1px solid ${chrome.frame}`
        }}
      >
        <Box component="span" sx={{ fontWeight: font.bold }}>
          파일
        </Box>
        <Box component="span" className="tnum" sx={{ color: color.textSecondary }}>
          ({p.files.length})
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<AddRounded />} onClick={p.onAddFiles} sx={{ height: size.ctlSm, px: `${space.base}px` }}>
          추가
        </Button>
      </Box>
      <Box role="listbox" aria-label="파일 목록" tabIndex={0} onKeyDown={onKey} sx={{ overflowY: 'auto', flex: 1, minHeight: 0, outlineOffset: '-2px' }}>
        {p.files.length === 0 && <Box sx={{ p: `${space.base}px`, color: color.textSecondary }}>아직 추가된 파일이 없습니다.</Box>}
        {p.files.map((f, i) => (
          <FileRow key={f.id} file={f} index={i} active={f.id === p.activeId} canMoveUp={i > 0} canMoveDown={i < p.files.length - 1} onSelect={p.onSelect} onRemove={p.onRemove} onMove={p.onMove} />
        ))}
      </Box>
    </Box>
  )
}
