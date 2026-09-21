import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { ClassicDialog, GroupBox } from './parts'
import { ui } from '../../theme'
import appIconUrl from '../../assets/app-icon.png'
import signUrl from '../../assets/sign.png'

const { color, space, font } = ui

declare const __APP_VERSION__: string

/** 도움말 → 정보. 제작 크레딧 + 오픈소스 고지 (Compositor MIT 조건: 저작권 표시 유지) */
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
  return (
    <ClassicDialog
      open={open}
      title="파일 변환기 정보"
      onClose={onClose}
      onEnter={onClose}
      width={460}
      actions={
        <Button variant="contained" onClick={onClose}>
          확인
        </Button>
      }
    >
      <Box sx={{ display: 'flex', gap: `${space.lg}px`, alignItems: 'center' }}>
        <Box component="img" src={appIconUrl} alt="" sx={{ width: 48, height: 48 }} />
        <Box>
          <Box sx={{ fontSize: font.xl, fontWeight: font.bold }}>파일 변환기 {version && `v${version}`}</Box>
          <Box sx={{ color: color.textSecondary }}>PDF · 이미지 오프라인 변환기</Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: `${space.sm}px`, mt: `${space.xs}px` }}>
            제작 이성현 © 2026
            <Box component="img" src={signUrl} alt="이성현 서명" sx={{ height: 16 }} />
          </Box>
        </Box>
      </Box>
      <GroupBox title="오픈소스 고지">
        <Box className="selectable" sx={{ fontSize: font.xs, color: color.textSecondary, lineHeight: font.lhNormal }}>
          이미지 크기·캔버스 크기·보정(레벨·커브·노출·색조/채도·그레인·그라데이션 맵)·고품질 축소·내보내기 미리보기·배경 제거 가장자리 다듬기의 설계와 수식은
          <b> Compositor</b> (Copyright © 2026 Wonder Assembly LLC, MIT License) 를 참고해 TypeScript 로 옮긴 것입니다.
          <br />
          AI 배경 제거: @imgly/background-removal (AGPL-3.0) · PDF: pdf.js (Apache-2.0), pdf-lib (MIT) · UI: MUI (MIT)
        </Box>
      </GroupBox>
    </ClassicDialog>
  )
}
