import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import CloseRounded from '@mui/icons-material/CloseRounded'
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import { FORMATS } from '@core/index'
import { AppFile } from '../types'
import { ui } from '../theme'

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function FileCard({
  file,
  index,
  active,
  canMoveUp,
  canMoveDown,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown
}: {
  file: AppFile
  index: number
  active: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}): JSX.Element {
  const info = FORMATS[file.kind]
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      onClick={onSelect}
      sx={{
        p: 0.8,
        borderRadius: 2,
        cursor: 'pointer',
        border: `1px solid ${active ? ui.brand[500] : ui.gray[200]}`,
        bgcolor: active ? ui.brand[50] : '#fff',
        boxShadow: ui.shadow.xs,
        '&:hover': { bgcolor: active ? ui.brand[50] : ui.gray[50] }
      }}
    >
      <Stack alignItems="center" sx={{ flexShrink: 0 }}>
        <IconButton size="small" disabled={!canMoveUp} onClick={stop(onMoveUp)} sx={{ p: 0, width: 20, height: 16 }}>
          <KeyboardArrowUpRounded sx={{ fontSize: 16 }} />
        </IconButton>
        <Typography variant="caption" sx={{ fontSize: 11, color: ui.gray[500], lineHeight: 1 }}>
          {index + 1}
        </Typography>
        <IconButton size="small" disabled={!canMoveDown} onClick={stop(onMoveDown)} sx={{ p: 0, width: 20, height: 16 }}>
          <KeyboardArrowDownRounded sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>
      <Box
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: ui.gray[100],
          border: `1px solid ${ui.gray[200]}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {file.previewUrl ? (
          <Box component="img" src={file.previewUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Typography variant="caption" sx={{ fontSize: 10, color: ui.gray[500], fontWeight: 700 }}>
            {info.label}
          </Typography>
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap title={file.name} sx={{ fontSize: 13.5, fontWeight: 500 }}>
          {file.name}
        </Typography>
        <Stack direction="row" spacing={0.6} alignItems="center">
          <Chip
            label={info.label}
            size="small"
            color={file.kind === 'unknown' ? 'warning' : 'default'}
            sx={{ height: 18, fontSize: 10.5, fontWeight: 600, '& .MuiChip-label': { px: 0.8 } }}
          />
          <Typography variant="caption" sx={{ fontSize: 11.5, color: ui.gray[500] }}>
            {humanSize(file.size)}
          </Typography>
        </Stack>
      </Box>
      <Tooltip title="제거">
        <IconButton size="small" onClick={stop(onRemove)} sx={{ flexShrink: 0 }}>
          <CloseRounded sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}

export interface FileSidebarProps {
  files: AppFile[]
  activeId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onAddFiles: () => void
}

/** 좌측 파일 목록 사이드바 (pdf-editor ThumbnailSidebar 위치·톤) */
export default function FileSidebar(p: FileSidebarProps): JSX.Element {
  return (
    <Box sx={{ width: 296, flexShrink: 0, borderRight: 1, borderColor: 'divider', bgcolor: ui.gray[25], display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Stack direction="row" alignItems="center" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>파일</Typography>
        {p.files.length > 0 && (
          <Chip label={p.files.length} size="small" color="primary" sx={{ ml: 0.8, height: 18, fontSize: 11, '& .MuiChip-label': { px: 0.8 } }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddRounded />} onClick={p.onAddFiles} sx={{ px: 1 }}>
          추가
        </Button>
      </Stack>
      <Stack spacing={0.8} sx={{ p: 1.2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {p.files.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 0.5, py: 1 }}>
            아직 추가된 파일이 없습니다.
          </Typography>
        )}
        {p.files.map((f, i) => (
          <FileCard
            key={f.id}
            file={f}
            index={i}
            active={f.id === p.activeId}
            canMoveUp={i > 0}
            canMoveDown={i < p.files.length - 1}
            onSelect={() => p.onSelect(f.id)}
            onRemove={() => p.onRemove(f.id)}
            onMoveUp={() => p.onMove(f.id, -1)}
            onMoveDown={() => p.onMove(f.id, 1)}
          />
        ))}
      </Stack>
    </Box>
  )
}
