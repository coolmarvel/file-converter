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
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded'
import OpacityRounded from '@mui/icons-material/OpacityRounded'
import HandymanRounded from '@mui/icons-material/HandymanRounded'
import CallMergeRounded from '@mui/icons-material/CallMergeRounded'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { FileKind, ConversionTarget, FORMATS } from '@core/index'
import { Transform, CropRect, hasCrop, supportsAlpha } from '../convert/image'
import { BgOptions } from '../convert'
import { PdfToolRequest } from '../convert/pdftools'
import { WatermarkOpts, WmLayout } from '../watermark/model'
import { Group, GDivider, BarInput, PaletteControl, SliderControl, ToggleChip, IconToggle, CTL_H, selectSx } from './bar'
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
  bg: BgOptions
  onBg: (b: BgOptions) => void
  /** 로드된 PDF 파일 수 (병합 버튼 활성 판단) */
  pdfCount: number
  onPdfTool: (req: PdfToolRequest) => void
  wm: WatermarkOpts
  onWm: (w: WatermarkOpts) => void
}

const WM_LAYOUTS: { key: WmLayout; label: string }[] = [
  { key: 'diagonal', label: '대각선' },
  { key: 'tile', label: '바둑판' },
  { key: 'corner', label: '모서리' }
]

/** 회전(90° 단위)·좌우/상하 반전 묶음 */
function TransformControl({ tf, onTf }: { tf: Transform; onTf: (t: Transform) => void }): JSX.Element {
  const rotate = tf.rotate ?? 0
  const turn = (dir: 1 | -1): void => onTf({ ...tf, rotate: (((rotate + dir * 90) % 360) + 360) % 360 as Transform['rotate'] })
  return (
    <Group icon={<RotateRightRounded />} tooltip="회전·반전 (변환 결과물에 적용)">
      <Tooltip title="왼쪽으로 90° 회전">
        <IconButton size="small" onClick={() => turn(-1)} sx={{ width: CTL_H, height: CTL_H, borderRadius: 2 }}>
          <Rotate90DegreesCcwRounded sx={{ fontSize: 21 }} />
        </IconButton>
      </Tooltip>
      <Typography sx={{ fontSize: 14.5, minWidth: 36, textAlign: 'center', color: rotate ? 'primary.main' : ui.gray[500], fontWeight: rotate ? 600 : 400 }}>
        {rotate}°
      </Typography>
      <Tooltip title="오른쪽으로 90° 회전">
        <IconButton size="small" onClick={() => turn(1)} sx={{ width: CTL_H, height: CTL_H, borderRadius: 2 }}>
          <Rotate90DegreesCwRounded sx={{ fontSize: 21 }} />
        </IconButton>
      </Tooltip>
      <IconToggle icon={<FlipRounded sx={{ fontSize: 21 }} />} tooltip="좌우 반전" on={!!tf.flipH} onClick={() => onTf({ ...tf, flipH: !tf.flipH })} />
      <IconToggle icon={<FlipRounded sx={{ fontSize: 21, transform: 'rotate(90deg)' }} />} tooltip="상하 반전" on={!!tf.flipV} onClick={() => onTf({ ...tf, flipV: !tf.flipV })} />
    </Group>
  )
}

const PDF_OP_HINT: Record<'split' | 'rotate' | 'delete' | 'reorder', { label: string; placeholder: string; hint: string }> = {
  split: { label: '분할', placeholder: '예: 1-3,4-10', hint: '지정한 범위마다 별도 PDF로 저장합니다.' },
  rotate: { label: '회전', placeholder: '비우면 전체 (예: 1,3-5)', hint: '지정 페이지를 시계방향으로 회전합니다.' },
  delete: { label: '페이지 삭제', placeholder: '예: 2,5-7', hint: '지정한 페이지를 제거한 PDF를 저장합니다.' },
  reorder: { label: '순서 변경', placeholder: '예: 3,1,2 (전체 나열)', hint: '모든 페이지의 새 순서를 빠짐없이 적습니다.' }
}

/** PDF 문서 정리 — [전체 병합] + [페이지 도구] 팝오버 (분할/회전/삭제/순서) */
function PdfToolsControl({ pdfCount, onRun }: { pdfCount: number; onRun: (req: PdfToolRequest) => void }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [op, setOp] = useState<'split' | 'rotate' | 'delete' | 'reorder'>('split')
  const [pages, setPages] = useState('')
  const [angle, setAngle] = useState<90 | 180 | 270>(90)
  const info = PDF_OP_HINT[op]
  return (
    <Group icon={<HandymanRounded />} tooltip="PDF 문서 정리 (변환과 별개로 바로 저장)">
      <Tooltip title={pdfCount < 2 ? 'PDF를 2개 이상 추가하면 병합할 수 있어요' : '목록 순서대로 하나의 PDF로 병합해 저장'}>
        <span>
          <Button variant="outlined" size="small" color="inherit" startIcon={<CallMergeRounded />} disabled={pdfCount < 2} onClick={() => onRun({ op: 'merge' })} sx={{ height: CTL_H, whiteSpace: 'nowrap' }}>
            전체 병합
          </Button>
        </span>
      </Tooltip>
      <Button variant="outlined" size="small" color="inherit" onClick={(e) => setAnchor(e.currentTarget)} sx={{ height: CTL_H, whiteSpace: 'nowrap' }}>
        페이지 도구
      </Button>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Stack spacing={1.2} sx={{ p: 2, width: 320 }}>
          <Select size="small" value={op} onChange={(e) => setOp(e.target.value as typeof op)} sx={selectSx}>
            {(Object.keys(PDF_OP_HINT) as (keyof typeof PDF_OP_HINT)[]).map((k) => (
              <MenuItem key={k} value={k}>
                {PDF_OP_HINT[k].label}
              </MenuItem>
            ))}
          </Select>
          <BarInput value={pages} onChange={setPages} placeholder={info.placeholder} width={286} />
          {op === 'rotate' && (
            <Select size="small" value={angle} onChange={(e) => setAngle(Number(e.target.value) as typeof angle)} sx={selectSx}>
              <MenuItem value={90}>90° (시계방향)</MenuItem>
              <MenuItem value={180}>180°</MenuItem>
              <MenuItem value={270}>270°</MenuItem>
            </Select>
          )}
          <Typography variant="caption" color="text.secondary">
            {info.hint} 현재 선택된 파일에 적용됩니다.
          </Typography>
          <Button
            variant="contained"
            onClick={() => {
              setAnchor(null)
              onRun(op === 'rotate' ? { op, pages, angle } : { op, pages })
            }}
          >
            적용 후 저장
          </Button>
        </Stack>
      </Popover>
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
            <PdfToolsControl pdfCount={p.pdfCount} onRun={p.onPdfTool} />
            <GDivider />
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
              icon={<FilterBAndWRounded sx={{ fontSize: 20 }} />}
              label="흑백"
              tooltip="변환 결과물을 흑백(그레이스케일)으로"
              on={!!p.tf.grayscale}
              onClick={() => p.onTf({ ...p.tf, grayscale: !p.tf.grayscale })}
            />
            <GDivider />
          </>
        )}

        {(() => {
          const alphaTarget = !!p.target && supportsAlpha(p.target)
          const canWhite = alphaTarget // 흰색→투명은 투명도를 담을 수 있는 출력만
          const canAi = p.sourceIsImage // AI 배경 제거는 이미지 원본만 (jpeg 대상이면 흰 배경으로 합쳐짐)
          if (!canWhite && !canAi) return null
          return (
            <>
              <Group icon={<AutoFixHighRounded />} tooltip="배경 처리 — 미리보기에 즉시 반영">
                <Select
                  size="small"
                  value={p.bg.mode}
                  onChange={(e) => p.onBg({ ...p.bg, mode: e.target.value as BgOptions['mode'] })}
                  sx={{ ...selectSx, minWidth: 132 }}
                >
                  <MenuItem value="none">원본 배경</MenuItem>
                  <MenuItem value="white" disabled={!canWhite}>
                    흰색 → 투명{canWhite ? '' : ' (PNG·WebP 등 전용)'}
                  </MenuItem>
                  <MenuItem value="ai" disabled={!canAi}>
                    AI 배경 제거
                  </MenuItem>
                </Select>
              </Group>
              {p.bg.mode === 'white' && canWhite && (
                <SliderControl
                  icon={<OpacityRounded />}
                  tooltip="허용 오차 — 흰색에서 얼마나 먼 색까지 지울지"
                  value={p.bg.tolerance}
                  min={1}
                  max={60}
                  format={(v) => `${v}%`}
                  onChange={(tolerance) => p.onBg({ ...p.bg, tolerance })}
                />
              )}
              <GDivider />
            </>
          )
        })()}

        <ToggleChip
          icon={<CropRounded sx={{ fontSize: 20 }} />}
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
              <CloseRounded sx={{ fontSize: 20 }} />
            </ButtonBase>
          </Tooltip>
        )}
        <GDivider />

        {p.target === 'svg' && hint('SVG 벡터화에는 워터마크가 적용되지 않습니다.')}
        {p.target !== 'svg' && (
          <ToggleChip
            icon={<BrandingWatermarkOutlined sx={{ fontSize: 20 }} />}
            label="워터마크"
            tooltip="변환 결과물에 워터마크를 합성합니다 (미리보기에 실시간 표시)"
            on={p.wm.enabled}
            onClick={() => set({ enabled: !p.wm.enabled })}
          />
        )}
        {p.target !== 'svg' && p.wm.enabled && (
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, px: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', height: 58, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {content}
    </Box>
  )
}
