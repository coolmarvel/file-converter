import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Popover from '@mui/material/Popover'
import TuneRounded from '@mui/icons-material/TuneRounded'
import AspectRatioRounded from '@mui/icons-material/AspectRatioRounded'
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded'
import BrandingWatermarkOutlined from '@mui/icons-material/BrandingWatermarkOutlined'
import TextFieldsRounded from '@mui/icons-material/TextFieldsRounded'
import FormatColorTextRounded from '@mui/icons-material/FormatColorTextRounded'
import ContrastRounded from '@mui/icons-material/ContrastRounded'
import FormatSizeRounded from '@mui/icons-material/FormatSizeRounded'
import GridOnRounded from '@mui/icons-material/GridOnRounded'
import RotateRightRounded from '@mui/icons-material/RotateRightRounded'
import SpaceBarRounded from '@mui/icons-material/SpaceBarRounded'
import { FileKind, ConversionTarget, FORMATS } from '@core/index'
import { DicomMeta } from '../convert/dicom'
import { WatermarkOpts, WmLayout } from '../watermark/model'
import { DicomForm } from './DicomForm'
import { Group, GDivider, BarInput, PaletteControl, SliderControl, CTL_H, selectSx } from './bar'
import { ui } from '../theme'

export interface OptionsBarProps {
  commonKind: FileKind | 'mixed' | null
  targets: ConversionTarget[]
  target: FileKind | null
  activeTarget: ConversionTarget | null
  targetIsImage: boolean
  scale: number
  onScale: (s: number) => void
  resizeW: string
  resizeH: string
  onResizeW: (v: string) => void
  onResizeH: (v: string) => void
  dicomMeta: DicomMeta
  onDicomMeta: (m: DicomMeta) => void
  wm: WatermarkOpts
  onWm: (w: WatermarkOpts) => void
}

const WM_LAYOUTS: { key: WmLayout; label: string }[] = [
  { key: 'diagonal', label: '대각선' },
  { key: 'tile', label: '바둑판' },
  { key: 'corner', label: '모서리' }
]

/** [환자 정보] 버튼 → DICOM 폼 팝오버. 필수값 누락이면 경고 톤 */
function DicomControl({ meta, onChange }: { meta: DicomMeta; onChange: (m: DicomMeta) => void }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const missing = !meta.patientName.trim() || !meta.patientID.trim()
  return (
    <Group icon={<PersonOutlineRounded />} tooltip="환자 정보">
      <Button
        variant="outlined"
        size="small"
        color={missing ? 'error' : 'inherit'}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ height: CTL_H, whiteSpace: 'nowrap' }}
      >
        환자 정보{missing ? ' (필수 입력)' : ` — ${meta.patientName}`}
      </Button>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <DicomForm meta={meta} onChange={onChange} />
      </Popover>
    </Group>
  )
}

/** 워터마크 켜기/끄기 칩 버튼 — 켜지면 브랜드 틴트 */
function WmToggle({ on, onClick }: { on: boolean; onClick: () => void }): JSX.Element {
  return (
    <Tooltip title="변환 결과물에 워터마크를 합성합니다 (미리보기에 실시간 표시)">
      <ButtonBase
        onClick={onClick}
        sx={{
          height: CTL_H,
          px: 1.2,
          borderRadius: 2,
          border: `1px solid ${on ? ui.brand[500] : ui.gray[300]}`,
          bgcolor: on ? 'primary.light' : '#fff',
          color: on ? 'primary.main' : ui.gray[700],
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          boxShadow: ui.shadow.xs,
          '&:hover': { bgcolor: on ? 'primary.light' : ui.gray[50] }
        }}
      >
        <BrandingWatermarkOutlined sx={{ fontSize: 18 }} />
        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>워터마크</Typography>
      </ButtonBase>
    </Tooltip>
  )
}

/**
 * 컨텍스트 툴바 — 선택된 변환 대상에 따라 옵션이 바뀐다 (pdf-editor SubToolbar 문법).
 * height 고정(minHeight 아님): 대상마다 내용이 달라져도 본문이 세로로 튀지 않는다.
 */
export default function OptionsBar(p: OptionsBarProps): JSX.Element {
  const set = (patch: Partial<WatermarkOpts>): void => p.onWm({ ...p.wm, ...patch })

  const hint = (text: string): JSX.Element => (
    <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
      {text}
    </Typography>
  )

  let content: JSX.Element
  if (p.commonKind === null) content = hint('파일을 추가하면 변환 옵션이 나타납니다.')
  else if (p.commonKind === 'mixed') content = hint('같은 종류의 파일끼리만 함께 변환할 수 있어요.')
  else if (p.targets.length === 0) content = hint(`${FORMATS[p.commonKind].label} 은(는) 현재 버전에서 변환 대상이 없습니다.`)
  else if (!p.target) content = hint('위 툴바에서 변환 대상을 선택하세요.')
  else {
    content = (
      <>
        {p.commonKind === 'pdf' && (
          <>
            <Group icon={<TuneRounded />} tooltip="렌더링 해상도">
              <Select size="small" value={p.scale} onChange={(e) => p.onScale(Number(e.target.value))} sx={{ ...selectSx, minWidth: 118 }}>
                <MenuItem value={1.5}>보통 (1.5x)</MenuItem>
                <MenuItem value={2}>선명 (2x)</MenuItem>
                <MenuItem value={3}>고화질 (3x)</MenuItem>
              </Select>
            </Group>
            <GDivider />
          </>
        )}

        {p.targetIsImage && (
          <>
            <Group icon={<AspectRatioRounded />} tooltip="출력 크기(px) — 비우면 원본 유지, 한쪽만 입력하면 비율 유지">
              <BarInput type="number" value={p.resizeW} onChange={p.onResizeW} placeholder="가로 자동" width={86} />
              <Typography sx={{ color: ui.gray[400], fontSize: 13 }}>×</Typography>
              <BarInput type="number" value={p.resizeH} onChange={p.onResizeH} placeholder="세로 자동" width={86} />
            </Group>
            <GDivider />
          </>
        )}

        {p.activeTarget?.needs === 'dicomMeta' && (
          <>
            <DicomControl meta={p.dicomMeta} onChange={p.onDicomMeta} />
            <GDivider />
          </>
        )}

        {p.target !== 'dicom' && (
          <>
            <WmToggle on={p.wm.enabled} onClick={() => set({ enabled: !p.wm.enabled })} />
            {p.wm.enabled && (
              <>
                <Group icon={<BrandingWatermarkOutlined />} tooltip="워터마크 종류">
                  <Select size="small" value={p.wm.type} onChange={(e) => set({ type: e.target.value as WatermarkOpts['type'] })} sx={{ ...selectSx, minWidth: 92 }}>
                    <MenuItem value="text">텍스트</MenuItem>
                    <MenuItem value="signature">내 서명</MenuItem>
                  </Select>
                </Group>
                {p.wm.type === 'text' && (
                  <>
                    <Group icon={<TextFieldsRounded />} tooltip="워터마크 문구">
                      <BarInput value={p.wm.text} onChange={(text) => set({ text })} placeholder="예: 이성현 · 대외비" width={150} />
                    </Group>
                    <PaletteControl icon={<FormatColorTextRounded />} title="색상" value={p.wm.color} onChange={(color) => set({ color })} />
                  </>
                )}
                <GDivider />
                <Group icon={<GridOnRounded />} tooltip="배치">
                  <Select size="small" value={p.wm.layout} onChange={(e) => set({ layout: e.target.value as WmLayout })} sx={{ ...selectSx, minWidth: 96 }}>
                    {WM_LAYOUTS.map((l) => (
                      <MenuItem key={l.key} value={l.key}>
                        {l.label}
                      </MenuItem>
                    ))}
                  </Select>
                </Group>
                <SliderControl icon={<FormatSizeRounded />} tooltip="크기" value={p.wm.sizePct} min={5} max={60} format={(v) => `${v}%`} onChange={(sizePct) => set({ sizePct })} />
                <SliderControl
                  icon={<ContrastRounded />}
                  tooltip="진하기"
                  value={Math.round(p.wm.opacity * 100)}
                  min={5}
                  max={100}
                  step={5}
                  format={(v) => `${v}%`}
                  onChange={(v) => set({ opacity: v / 100 })}
                />
                {p.wm.layout === 'tile' && (
                  <SliderControl icon={<SpaceBarRounded />} tooltip="간격" value={p.wm.gapPct} min={5} max={120} step={5} format={(v) => `${v}%`} onChange={(gapPct) => set({ gapPct })} />
                )}
                {p.wm.layout !== 'corner' && (
                  <SliderControl
                    icon={<RotateRightRounded />}
                    tooltip="기울기"
                    value={p.wm.rotationDeg}
                    min={-90}
                    max={90}
                    step={5}
                    format={(v) => `${v}°`}
                    onChange={(rotationDeg) => set({ rotationDeg })}
                  />
                )}
              </>
            )}
          </>
        )}
      </>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, px: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', height: 52, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {content}
    </Box>
  )
}
