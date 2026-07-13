import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import TuneRounded from '@mui/icons-material/TuneRounded'
import AspectRatioRounded from '@mui/icons-material/AspectRatioRounded'
import BrandingWatermarkOutlined from '@mui/icons-material/BrandingWatermarkOutlined'
import TextFieldsRounded from '@mui/icons-material/TextFieldsRounded'
import FormatColorTextRounded from '@mui/icons-material/FormatColorTextRounded'
import ContrastRounded from '@mui/icons-material/ContrastRounded'
import FormatSizeRounded from '@mui/icons-material/FormatSizeRounded'
import GridOnRounded from '@mui/icons-material/GridOnRounded'
import RotateRightRounded from '@mui/icons-material/RotateRightRounded'
import Rotate90DegreesCwRounded from '@mui/icons-material/Rotate90DegreesCwRounded'
import Rotate90DegreesCcwRounded from '@mui/icons-material/Rotate90DegreesCcwRounded'
import FlipRounded from '@mui/icons-material/FlipRounded'
import FilterBAndWRounded from '@mui/icons-material/FilterBAndWRounded'
import HighQualityRounded from '@mui/icons-material/HighQualityRounded'
import SpaceBarRounded from '@mui/icons-material/SpaceBarRounded'
import CropRounded from '@mui/icons-material/CropRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import { FileKind, ConversionTarget, FORMATS } from '@core/index'
import { Transform, CropRect, hasCrop } from '../convert/image'
import { WatermarkOpts, WmLayout } from '../watermark/model'
import { Group, GDivider, BarInput, PaletteControl, SliderControl, CTL_H, selectSx } from './bar'
import { ui } from '../theme'

export interface OptionsBarProps {
  commonKind: FileKind | 'mixed' | null
  targets: ConversionTarget[]
  target: FileKind | null
  targetIsImage: boolean
  sourceIsImage: boolean
  scale: number
  onScale: (s: number) => void
  resizeW: string
  resizeH: string
  onResizeW: (v: string) => void
  onResizeH: (v: string) => void
  /** jpeg/webp 인코딩 품질(%) */
  quality: number
  onQuality: (q: number) => void
  tf: Transform
  onTf: (t: Transform) => void
  crop: CropRect | null
  cropMode: boolean
  onCrop: (c: CropRect | null) => void
  onCropMode: (on: boolean) => void
  wm: WatermarkOpts
  onWm: (w: WatermarkOpts) => void
}

const WM_LAYOUTS: { key: WmLayout; label: string }[] = [
  { key: 'diagonal', label: '대각선' },
  { key: 'tile', label: '바둑판' },
  { key: 'corner', label: '모서리' }
]

/** 켜기/끄기 칩 버튼 — 켜지면 브랜드 틴트 (워터마크·흑백 등 공용) */
function ToggleChip({ icon, label, tooltip, on, onClick }: { icon: JSX.Element; label: string; tooltip: string; on: boolean; onClick: () => void }): JSX.Element {
  return (
    <Tooltip title={tooltip}>
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
          flexShrink: 0,
          boxShadow: ui.shadow.xs,
          '&:hover': { bgcolor: on ? 'primary.light' : ui.gray[50] }
        }}
      >
        {icon}
        <Typography sx={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</Typography>
      </ButtonBase>
    </Tooltip>
  )
}

/** 회전(90° 단위)·좌우/상하 반전 묶음 */
function TransformControl({ tf, onTf }: { tf: Transform; onTf: (t: Transform) => void }): JSX.Element {
  const rotate = tf.rotate ?? 0
  const turn = (dir: 1 | -1): void => onTf({ ...tf, rotate: (((rotate + dir * 90) % 360) + 360) % 360 as Transform['rotate'] })
  const flipBtnSx = (on: boolean) =>
    ({
      width: CTL_H,
      height: CTL_H,
      borderRadius: 2,
      border: `1px solid ${on ? ui.brand[500] : ui.gray[300]}`,
      bgcolor: on ? 'primary.light' : '#fff',
      color: on ? 'primary.main' : ui.gray[600]
    }) as const
  return (
    <Group icon={<RotateRightRounded />} tooltip="회전·반전 (변환 결과물에 적용)">
      <Tooltip title="왼쪽으로 90° 회전">
        <IconButton size="small" onClick={() => turn(-1)} sx={{ width: CTL_H, height: CTL_H, borderRadius: 2 }}>
          <Rotate90DegreesCcwRounded sx={{ fontSize: 19 }} />
        </IconButton>
      </Tooltip>
      <Typography sx={{ fontSize: 13.5, minWidth: 34, textAlign: 'center', color: rotate ? 'primary.main' : ui.gray[500], fontWeight: rotate ? 600 : 400 }}>
        {rotate}°
      </Typography>
      <Tooltip title="오른쪽으로 90° 회전">
        <IconButton size="small" onClick={() => turn(1)} sx={{ width: CTL_H, height: CTL_H, borderRadius: 2 }}>
          <Rotate90DegreesCwRounded sx={{ fontSize: 19 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="좌우 반전">
        <IconButton size="small" onClick={() => onTf({ ...tf, flipH: !tf.flipH })} sx={flipBtnSx(!!tf.flipH)}>
          <FlipRounded sx={{ fontSize: 19 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="상하 반전">
        <IconButton size="small" onClick={() => onTf({ ...tf, flipV: !tf.flipV })} sx={flipBtnSx(!!tf.flipV)}>
          <FlipRounded sx={{ fontSize: 19, transform: 'rotate(90deg)' }} />
        </IconButton>
      </Tooltip>
    </Group>
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

  // 크기 입력: 이미지 출력(px 지정) + 이미지→PDF(임베드 전 리사이즈) 모두 의미가 있다
  const showResize = p.targetIsImage || (p.sourceIsImage && p.target === 'pdf')
  const showQuality = p.target === 'jpeg' || p.target === 'webp'

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

        {showResize && (
          <>
            <Group icon={<AspectRatioRounded />} tooltip="출력 크기(px) — 비우면 원본 유지, 한쪽만 입력하면 비율 유지">
              <BarInput type="number" value={p.resizeW} onChange={p.onResizeW} placeholder="가로 자동" width={86} />
              <Typography sx={{ color: ui.gray[400], fontSize: 13 }}>×</Typography>
              <BarInput type="number" value={p.resizeH} onChange={p.onResizeH} placeholder="세로 자동" width={86} />
            </Group>
            <GDivider />
          </>
        )}

        {showQuality && (
          <>
            <SliderControl
              icon={<HighQualityRounded />}
              tooltip="인코딩 품질 — 낮출수록 파일이 작아집니다"
              value={p.quality}
              min={10}
              max={100}
              step={1}
              format={(v) => `${v}%`}
              onChange={p.onQuality}
            />
            <GDivider />
          </>
        )}

        {p.sourceIsImage && (
          <>
            <TransformControl tf={p.tf} onTf={p.onTf} />
            <ToggleChip
              icon={<FilterBAndWRounded sx={{ fontSize: 18 }} />}
              label="흑백"
              tooltip="변환 결과물을 흑백(그레이스케일)으로"
              on={!!p.tf.grayscale}
              onClick={() => p.onTf({ ...p.tf, grayscale: !p.tf.grayscale })}
            />
            <GDivider />
          </>
        )}

        <ToggleChip
          icon={<CropRounded sx={{ fontSize: 18 }} />}
          label={hasCrop(p.crop) ? `자르기 ${Math.round(p.crop.w * 100)}×${Math.round(p.crop.h * 100)}%` : '자르기'}
          tooltip="미리보기에서 드래그해 남길 영역을 지정합니다 (바깥의 어두운 부분이 잘려나감)"
          on={p.cropMode || hasCrop(p.crop)}
          onClick={() => p.onCropMode(!p.cropMode)}
        />
        {hasCrop(p.crop) && (
          <Tooltip title="자르기 해제">
            <ButtonBase
              onClick={() => {
                p.onCrop(null)
                p.onCropMode(false)
              }}
              sx={{ height: CTL_H, width: CTL_H, borderRadius: 2, border: `1px solid ${ui.gray[300]}`, bgcolor: '#fff', color: ui.gray[600], '&:hover': { bgcolor: ui.gray[50] } }}
            >
              <CloseRounded sx={{ fontSize: 18 }} />
            </ButtonBase>
          </Tooltip>
        )}
        <GDivider />

        <ToggleChip
          icon={<BrandingWatermarkOutlined sx={{ fontSize: 18 }} />}
          label="워터마크"
          tooltip="변환 결과물에 워터마크를 합성합니다 (미리보기에 실시간 표시)"
          on={p.wm.enabled}
          onClick={() => set({ enabled: !p.wm.enabled })}
        />
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
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, px: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', height: 52, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {content}
    </Box>
  )
}
