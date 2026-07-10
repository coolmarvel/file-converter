import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded'
import appIconUrl from '../assets/app-icon.png'

export interface TopBarProps {
  busy: boolean
  fileCount: number
  canConvert: boolean
  onConvert: () => void
}

/** 타이틀바 — 좌: 앱 아이덴티티 / 우: 변환 실행 (pdf-editor TopBar 문법) */
export default function TopBar({ busy, fileCount, canConvert, onConvert }: TopBarProps): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, bgcolor: '#fff', borderBottom: 1, borderColor: 'divider', gap: 2 }}>
      <Stack direction="row" spacing={0.8} alignItems="center">
        <Box component="img" src={appIconUrl} alt="" sx={{ width: 26, height: 26 }} />
        <Typography fontWeight={800} sx={{ whiteSpace: 'nowrap' }}>
          파일 변환기
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        PDF · 이미지 · DICOM · 오프라인
      </Typography>

      <Box sx={{ flex: 1 }} />

      {busy && <CircularProgress size={20} />}
      <Button
        variant="contained"
        startIcon={<SwapHorizRounded />}
        disabled={busy || !canConvert}
        onClick={onConvert}
        sx={{ borderRadius: 99, px: 3 }}
      >
        {busy ? '변환 중…' : fileCount > 0 ? `${fileCount}개 변환 후 저장` : '변환 후 저장'}
      </Button>
    </Box>
  )
}
