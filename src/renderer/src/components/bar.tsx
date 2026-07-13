import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import Popover from '@mui/material/Popover'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import AddRounded from '@mui/icons-material/AddRounded'
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded'
import { ui } from '../theme'

/**
 * 컨텍스트 바 공용 부품 — pdf-editor SubToolbar 의 문법(Guru 규약)을 이식.
 * 컨트롤마다 [의미 아이콘] + [36px 통일 높이 박스] 로 묶고 그룹 사이는 세로 구분선.
 */

/** 통일된 컨트롤 높이 (2026-07-13 UI 확대: 36 → 40) */
export const CTL_H = 40

export const selectSx = {
  height: CTL_H,
  bgcolor: '#fff',
  '& .MuiSelect-select': { py: 0.5, display: 'flex', alignItems: 'center' }
} as const

/** 박스형 트리거 버튼 공통 스타일 (팔레트/슬라이더 팝오버) */
export const boxBtnSx = {
  height: CTL_H,
  px: 0.8,
  borderRadius: 2,
  border: `1px solid ${ui.gray[300]}`,
  bgcolor: '#fff',
  display: 'flex',
  alignItems: 'center',
  gap: 0.3,
  boxShadow: ui.shadow.xs,
  '&:hover': { bgcolor: ui.gray[50] }
} as const

/** 그룹: 회색 의미 아이콘 + 컨트롤 (아이콘에 툴팁) */
export function Group({ icon, tooltip, children }: { icon?: React.ReactNode; tooltip?: string; children: React.ReactNode }): JSX.Element {
  const iconBox = icon ? <Box sx={{ display: 'flex', color: ui.gray[500], '& svg': { fontSize: 22 } }}>{icon}</Box> : null
  return (
    <Stack direction="row" alignItems="center" spacing={0.7} sx={{ flexShrink: 0 }}>
      {iconBox && (tooltip ? <Tooltip title={tooltip}>{iconBox}</Tooltip> : iconBox)}
      {children}
    </Stack>
  )
}

export function GDivider(): JSX.Element {
  return <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
}

/** 바 안에서 쓰는 소형 인풋 (텍스트/숫자) */
export function BarInput({
  value,
  onChange,
  placeholder,
  width = 168,
  type = 'text'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  width?: number
  type?: 'text' | 'number'
}): JSX.Element {
  return (
    <Box
      component="input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      sx={{
        height: CTL_H,
        width,
        px: 1.2,
        border: `1px solid ${ui.gray[300]}`,
        borderRadius: 2,
        bgcolor: '#fff',
        fontSize: 15.5,
        fontFamily: 'inherit',
        outline: 'none',
        boxShadow: ui.shadow.xs,
        '&:focus': { borderColor: ui.brand[500], boxShadow: ui.shadow.focusRing },
        '&::placeholder': { color: ui.gray[400] },
        // 숫자 인풋 스피너 숨김 (좁은 바 안에서 자리만 차지)
        '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', m: 0 }
      }}
    />
  )
}

/** pdf-editor 와 동일한 프리셋 팔레트 (진한 6 / 파스텔 6 / 무채색 5) */
const PALETTE: string[][] = [
  ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#d946ef'],
  ['#f87171', '#fdba74', '#fde047', '#86efac', '#93c5fd', '#f0abfc'],
  ['#ffffff', '#d1d5db', '#9ca3af', '#4b5563', '#111111']
]

function Swatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }): JSX.Element {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        bgcolor: color,
        border: color.toLowerCase() === '#ffffff' ? `1px solid ${ui.gray[300]}` : '1px solid rgba(0,0,0,.08)',
        outline: selected ? `2px solid ${ui.brand[500]}` : 'none',
        outlineOffset: 1
      }}
    />
  )
}

/** [아이콘] + 박스형 색 버튼(스와치+⌄) → 팔레트 팝오버 */
export function PaletteControl({
  value,
  onChange,
  title,
  icon
}: {
  value: string
  onChange: (c: string) => void
  title: string
  icon?: React.ReactNode
}): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const customRef = useRef<HTMLInputElement>(null)
  return (
    <Group icon={icon} tooltip={title}>
      <Tooltip title={title}>
        <ButtonBase onClick={(e) => setAnchor(e.currentTarget)} sx={boxBtnSx}>
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              bgcolor: value,
              border: value.toLowerCase() === '#ffffff' ? `1.5px solid ${ui.gray[300]}` : '1.5px solid rgba(0,0,0,.1)'
            }}
          />
          <ArrowDropDownRounded sx={{ fontSize: 18, color: ui.gray[500] }} />
        </ButtonBase>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5 }}>
          <Stack spacing={0.8}>
            {PALETTE.map((row, ri) => (
              <Stack key={ri} direction="row" spacing={0.8}>
                {row.map((c) => (
                  <Swatch key={c} color={c} selected={value.toLowerCase() === c.toLowerCase()} onClick={() => onChange(c)} />
                ))}
              </Stack>
            ))}
            <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
              직접 선택
            </Typography>
            <Box>
              <ButtonBase
                onClick={() => customRef.current?.click()}
                sx={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px dashed ${ui.gray[400]}`, color: ui.gray[500], position: 'relative' }}
              >
                <AddRounded sx={{ fontSize: 16 }} />
                <input
                  ref={customRef}
                  type="color"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                />
              </ButtonBase>
            </Box>
          </Stack>
        </Box>
      </Popover>
    </Group>
  )
}

/** 켜기/끄기 칩 버튼 — 켜지면 브랜드 틴트 (워터마크·흑백·자르기 등 공용) */
export function ToggleChip({ icon, label, tooltip, on, onClick }: { icon: JSX.Element; label: string; tooltip: string; on: boolean; onClick: () => void }): JSX.Element {
  return (
    <Tooltip title={tooltip}>
      <ButtonBase
        onClick={onClick}
        sx={{
          height: CTL_H,
          px: 1.4,
          borderRadius: 2,
          border: `1px solid ${on ? ui.brand[500] : ui.gray[300]}`,
          bgcolor: on ? 'primary.light' : '#fff',
          color: on ? 'primary.main' : ui.gray[700],
          display: 'flex',
          alignItems: 'center',
          gap: 0.7,
          flexShrink: 0,
          boxShadow: ui.shadow.xs,
          '&:hover': { bgcolor: on ? 'primary.light' : ui.gray[50] },
          '&.Mui-focusVisible': { boxShadow: ui.shadow.focusRing }
        }}
      >
        {icon}
        <Typography sx={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</Typography>
      </ButtonBase>
    </Tooltip>
  )
}

/** 정사각 아이콘 토글 버튼 (반전 등) — 켜지면 브랜드 틴트 */
export function IconToggle({ icon, tooltip, on, onClick }: { icon: JSX.Element; tooltip: string; on: boolean; onClick: () => void }): JSX.Element {
  return (
    <Tooltip title={tooltip}>
      <ButtonBase
        onClick={onClick}
        sx={{
          width: CTL_H,
          height: CTL_H,
          borderRadius: 2,
          border: `1px solid ${on ? ui.brand[500] : ui.gray[300]}`,
          bgcolor: on ? 'primary.light' : '#fff',
          color: on ? 'primary.main' : ui.gray[600],
          boxShadow: ui.shadow.xs,
          '&:hover': { bgcolor: on ? 'primary.light' : ui.gray[50] }
        }}
      >
        {icon}
      </ButtonBase>
    </Tooltip>
  )
}

/** [아이콘] + 박스형 값 버튼 → 슬라이더 팝오버 (진하기/크기/간격/기울기 공용) */
export function SliderControl({
  icon,
  tooltip,
  value,
  min,
  max,
  step = 1,
  format,
  onChange
}: {
  icon: React.ReactNode
  tooltip: string
  value: number
  min: number
  max: number
  step?: number
  format: (v: number) => string
  onChange: (v: number) => void
}): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <Group icon={icon} tooltip={tooltip}>
      <Tooltip title={tooltip}>
        <ButtonBase onClick={(e) => setAnchor(e.currentTarget)} sx={{ ...boxBtnSx, px: 1 }}>
          <Typography sx={{ fontSize: 15.5, minWidth: 42, textAlign: 'left', whiteSpace: 'nowrap' }}>{format(value)}</Typography>
          <ArrowDropDownRounded sx={{ fontSize: 18, color: ui.gray[500] }} />
        </ButtonBase>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ px: 2, py: 1, width: 200, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Slider size="small" min={min} max={max} step={step} value={value} onChange={(_, v) => onChange(v as number)} />
          <Typography variant="caption" sx={{ width: 44, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {format(value)}
          </Typography>
        </Box>
      </Popover>
    </Group>
  )
}
