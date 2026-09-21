import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined'
import UndoRounded from '@mui/icons-material/UndoRounded'
import RedoRounded from '@mui/icons-material/RedoRounded'
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import PhotoOutlined from '@mui/icons-material/PhotoOutlined'
import CollectionsOutlined from '@mui/icons-material/CollectionsOutlined'
import InsertPhotoOutlined from '@mui/icons-material/InsertPhotoOutlined'
import WebAssetRounded from '@mui/icons-material/WebAssetRounded'
import PolylineOutlined from '@mui/icons-material/PolylineOutlined'
import SaveAltRounded from '@mui/icons-material/SaveAltRounded'
import { FileKind, FORMATS, ConversionTarget } from '@core/index'
import { ToolButton, GDivider, Hint } from './bar'
import { ui } from '../theme'

const { color, chrome, size, space, font, surface } = ui

const TARGET_ICONS: Partial<Record<FileKind, JSX.Element>> = {
  pdf: <PictureAsPdfRounded />,
  png: <ImageOutlined />,
  jpeg: <PhotoOutlined />,
  webp: <CollectionsOutlined />,
  bmp: <InsertPhotoOutlined />,
  ico: <WebAssetRounded />,
  svg: <PolylineOutlined />
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
  busy: boolean
  fileCount: number
  onConvert: () => void
}

/**
 * 메인 툴바 (30px) — 파일·실행취소 │ 변환 대상(눌린 버튼 = 선택) │ 오른쪽 끝 주 버튼 "변환 후 저장".
 * 한 화면의 주(accent) 버튼은 이것 하나.
 */
export default function ConvertToolbar(p: ConvertToolbarProps): JSX.Element {
  const hasKind = p.commonKind && p.commonKind !== 'mixed'
  return (
    <Box
      role="toolbar"
      aria-label="변환"
      sx={{
        height: size.toolBar,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: `${space.xs}px`,
        px: `${space.sm}px`,
        background: surface.toolbar,
        borderBottom: `1px solid ${chrome.toolbarEdge}`,
        overflowX: 'auto',
        overflowY: 'hidden'
      }}
    >
      <ToolButton icon={<ViewSidebarOutlined />} tooltip="파일 목록 보이기/숨기기" active={p.sidebarOpen} onClick={p.onToggleSidebar} />
      <ToolButton icon={<UploadFileOutlined />} label="열기" tooltip="파일 추가 (Ctrl+O)" onClick={p.onAddFiles} />
      <GDivider />
      <ToolButton icon={<UndoRounded />} tooltip="실행취소 (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo} />
      <ToolButton icon={<RedoRounded />} tooltip="다시실행 (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo} />
      <GDivider />

      {hasKind && (
        <Box component="span" sx={{ fontSize: font.md, color: color.textSecondary, px: `${space.sm}px`, whiteSpace: 'nowrap' }}>
          {FORMATS[p.commonKind as FileKind].label} →
        </Box>
      )}
      {p.targets.map((t) => (
        <ToolButton key={t.to} icon={TARGET_ICONS[t.to] ?? <ImageOutlined />} label={FORMATS[t.to].label} tooltip={t.label} active={p.target === t.to} onClick={() => p.onTarget(t.to)} />
      ))}
      {p.commonKind === null && <Hint>파일을 추가하면 변환 대상이 나타납니다</Hint>}
      {p.commonKind === 'mixed' && <Hint>같은 종류의 파일끼리만 함께 변환할 수 있습니다 — 종류가 섞여 있습니다</Hint>}
      {hasKind && p.targets.length === 0 && <Hint>{FORMATS[p.commonKind as FileKind].label} 은(는) 변환 대상이 없습니다</Hint>}

      <Box sx={{ flex: 1 }} />
      <Button variant="contained" startIcon={<SaveAltRounded />} disabled={p.busy || !p.target || p.fileCount === 0} onClick={p.onConvert} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
        {p.busy ? '변환 중…' : p.fileCount > 0 ? `${p.fileCount}개 변환 후 저장` : '변환 후 저장'}
      </Button>
    </Box>
  )
}
