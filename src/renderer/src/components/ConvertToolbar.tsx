import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined'
import UndoRounded from '@mui/icons-material/UndoRounded'
import RedoRounded from '@mui/icons-material/RedoRounded'
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import PhotoOutlined from '@mui/icons-material/PhotoOutlined'
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined'
import InsertPhotoOutlined from '@mui/icons-material/InsertPhotoOutlined'
import { FileKind, FORMATS, ConversionTarget } from '@core/index'

/** 모든 툴 버튼 규격 통일 (pdf-editor ToolBtn): 본체 76×48px 고정 — 라벨 길이와 무관하게 같은 박스 */
const TOOLBTN_W = 76
const TOOLBTN_H = 48

function ToolBtn({
  label,
  tooltip,
  icon,
  active,
  disabled,
  onClick
}: {
  label: string
  tooltip?: string
  icon: JSX.Element
  active?: boolean
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <Tooltip title={tooltip ?? label}>
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            onClick={onClick}
            sx={{
              width: TOOLBTN_W,
              height: TOOLBTN_H,
              flexDirection: 'column',
              justifyContent: 'center',
              borderRadius: 2,
              p: 0,
              color: active ? 'primary.main' : 'text.primary',
              bgcolor: active ? 'primary.light' : 'transparent',
              '&:hover': { bgcolor: active ? 'primary.light' : '#f2f4f7' }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', height: 24 }}>{icon}</Box>
            <Typography
              variant="caption"
              sx={{ fontSize: 11.5, lineHeight: 1.15, mt: 0.2, whiteSpace: 'nowrap', maxWidth: TOOLBTN_W - 4, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {label}
            </Typography>
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}

const TARGET_ICONS: Partial<Record<FileKind, JSX.Element>> = {
  pdf: <PictureAsPdfRounded />,
  png: <ImageOutlined />,
  jpeg: <PhotoOutlined />,
  webp: <CollectionsOutlined />,
  bmp: <InsertPhotoOutlined />
}

export interface ConvertToolbarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onAddFiles: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** 파일들의 공통 종류 (null=파일 없음, 'mixed'=종류 혼재) */
  commonKind: FileKind | 'mixed' | null
  targets: ConversionTarget[]
  target: FileKind | null
  onTarget: (t: FileKind) => void
}

/** 메인 툴바 — 좌: 파일 관리·실행취소 / 우측 영역: 변환 대상 선택 (pdf-editor Toolbar 문법) */
export default function ConvertToolbar(p: ConvertToolbarProps): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.3, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', gap: 0.2, flexWrap: 'nowrap', overflowX: 'auto' }}>
      <ToolBtn label="파일 목록" icon={<ViewSidebarOutlined />} active={p.sidebarOpen} onClick={p.onToggleSidebar} />
      <ToolBtn label="파일 추가" icon={<UploadFileOutlined />} onClick={p.onAddFiles} />

      <Divider orientation="vertical" flexItem sx={{ mx: 0.8, my: 1 }} />

      <ToolBtn label="실행취소" tooltip="실행취소 (Ctrl+Z)" icon={<UndoRounded />} disabled={!p.canUndo} onClick={p.onUndo} />
      <ToolBtn label="다시실행" tooltip="다시실행 (Ctrl+Y)" icon={<RedoRounded />} disabled={!p.canRedo} onClick={p.onRedo} />

      <Divider orientation="vertical" flexItem sx={{ mx: 0.8, my: 1 }} />

      {p.commonKind && p.commonKind !== 'mixed' && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {FORMATS[p.commonKind].label} →
        </Typography>
      )}

      {p.targets.map((t) => (
        <ToolBtn
          key={t.to}
          label={FORMATS[t.to].label}
          tooltip={t.label}
          icon={TARGET_ICONS[t.to] ?? <ImageOutlined />}
          active={p.target === t.to}
          onClick={() => p.onTarget(t.to)}
        />
      ))}

      {p.commonKind === null && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          파일을 추가하면 변환 대상이 나타납니다
        </Typography>
      )}
      {p.commonKind === 'mixed' && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          같은 종류의 파일끼리만 함께 변환할 수 있어요 — 종류가 섞여 있습니다
        </Typography>
      )}
      {p.commonKind && p.commonKind !== 'mixed' && p.targets.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          {FORMATS[p.commonKind].label} 은(는) 현재 버전에서 변환 대상이 없습니다
        </Typography>
      )}
    </Box>
  )
}
