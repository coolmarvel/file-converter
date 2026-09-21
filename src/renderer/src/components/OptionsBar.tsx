import { useLayoutEffect, useRef, useState } from 'react'
import ButtonBase from '@mui/material/ButtonBase'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Rotate90DegreesCwRounded from '@mui/icons-material/Rotate90DegreesCwRounded'
import Rotate90DegreesCcwRounded from '@mui/icons-material/Rotate90DegreesCcwRounded'
import FlipRounded from '@mui/icons-material/FlipRounded'
import FilterBAndWRounded from '@mui/icons-material/FilterBAndWRounded'
import CropRounded from '@mui/icons-material/CropRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import BrandingWatermarkOutlined from '@mui/icons-material/BrandingWatermarkOutlined'
import TuneRounded from '@mui/icons-material/TuneRounded'
import AspectRatioRounded from '@mui/icons-material/AspectRatioRounded'
import CropFreeRounded from '@mui/icons-material/CropFreeRounded'
import CallMergeRounded from '@mui/icons-material/CallMergeRounded'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import BlurOnRounded from '@mui/icons-material/BlurOnRounded'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import DocumentScannerOutlined from '@mui/icons-material/DocumentScannerOutlined'
import { FileKind, ConversionTarget, FORMATS, hasAdjust, Adjustments, CanvasSizeOptions, Filters, hasFilters, LayerEffects, hasEffects } from '@core/index'
import { Transform, CropRect, hasCrop, supportsAlpha } from '../convert/image'
import { BgOptions } from '../convert'
import { PdfToolRequest } from '../convert/pdftools'
import { WatermarkOpts, WmLayout } from '../watermark/model'
import { Group, GDivider, BarInput, PaletteControl, SliderControl, ToggleChip, IconToggle, IconBevel, Hint, selectSx } from './bar'
import { ui } from '../theme'

const { color, chrome, size, space, font, surface } = ui

/** 자르기 비율 프리셋 (값 = 가로/세로, null = 자유, 'orig' = 현재 프레임 비율) */
export const CROP_ASPECTS: { key: string; label: string; value: number | 'orig' | null }[] = [
  { key: 'free', label: '자유', value: null },
  { key: 'orig', label: '원본 비율', value: 'orig' },
  { key: '1:1', label: '1:1 정사각', value: 1 },
  { key: '4:3', label: '4:3', value: 4 / 3 },
  { key: '3:2', label: '3:2', value: 3 / 2 },
  { key: '16:9', label: '16:9', value: 16 / 9 },
  { key: '3:4', label: '3:4 세로', value: 3 / 4 },
  { key: '9:16', label: '9:16 세로', value: 9 / 16 }
]

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
  /** 인쇄 해상도 (null = 지정 안 함) */
  dpi: number | null
  onOpenImageSize: () => void
  canvasSize: CanvasSizeOptions | null
  onOpenCanvasSize: () => void
  /** jpeg/webp 인코딩 품질(%) */
  quality: number
  onQuality: (q: number) => void
  onOpenExport: () => void
  tf: Transform
  onTf: (t: Transform) => void
  adjust: Adjustments
  onOpenAdjust: () => void
  filters: Filters
  onOpenFilters: () => void
  effects: LayerEffects
  onOpenEffects: () => void
  /** 선택 파일에 원근 보정(펴기)이 걸려 있는가 */
  warped: boolean
  onOpenPerspective: () => void
  crop: CropRect | null
  cropMode: boolean
  cropAspect: string
  onCrop: (c: CropRect | null) => void
  onCropMode: (on: boolean) => void
  onCropAspect: (key: string) => void
  /** 현재 미리보기 프레임의 출력 픽셀 크기 (자르기 수치 입력용) */
  frameSize: { w: number; h: number } | null
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
  const turn = (dir: 1 | -1): void => onTf({ ...tf, rotate: ((((rotate + dir * 90) % 360) + 360) % 360) as Transform['rotate'] })
  return (
    <Group label="회전" tooltip="회전·반전 (변환 결과물에 적용)">
      <IconBevel icon={<Rotate90DegreesCcwRounded />} tooltip="왼쪽으로 90° 회전" onClick={() => turn(-1)} />
      <Box
        component="span"
        className="tnum"
        sx={{ fontSize: font.md, minWidth: 30, textAlign: 'center', color: rotate ? color.accent : color.textSecondary, fontWeight: rotate ? font.bold : font.regular }}
      >
        {rotate}°
      </Box>
      <IconBevel icon={<Rotate90DegreesCwRounded />} tooltip="오른쪽으로 90° 회전" onClick={() => turn(1)} />
      <IconToggle icon={<FlipRounded />} tooltip="좌우 반전" on={!!tf.flipH} onClick={() => onTf({ ...tf, flipH: !tf.flipH })} />
      <IconToggle icon={<FlipRounded sx={{ transform: 'rotate(90deg)' }} />} tooltip="상하 반전" on={!!tf.flipV} onClick={() => onTf({ ...tf, flipV: !tf.flipV })} />
    </Group>
  )
}

const PDF_OP_HINT: Record<'split' | 'rotate' | 'delete' | 'reorder', { label: string; placeholder: string; hint: string }> = {
  split: { label: '분할', placeholder: '예: 1-3,4-10', hint: '지정한 범위마다 별도 PDF로 저장합니다.' },
  rotate: { label: '회전', placeholder: '비우면 전체 (예: 1,3-5)', hint: '지정 페이지를 시계방향으로 회전합니다.' },
  delete: { label: '페이지 삭제', placeholder: '예: 2,5-7', hint: '지정한 페이지를 제거한 PDF를 저장합니다.' },
  reorder: { label: '순서 변경', placeholder: '예: 3,1,2 (전체 나열)', hint: '모든 페이지의 새 순서를 빠짐없이 적습니다.' }
}

/** 팝오버 안쪽 공통 틀 — 클래식 그룹 박스 */
function PopBox({ title, children, width = 300 }: { title: string; children: React.ReactNode; width?: number }): JSX.Element {
  return (
    <Box sx={{ width }}>
      <Box sx={{ px: `${space.base}px`, height: size.row, display: 'flex', alignItems: 'center', background: surface.chrome, borderBottom: `1px solid ${chrome.frame}`, fontWeight: font.bold }}>
        {title}
      </Box>
      <Box sx={{ p: `${space.base}px`, display: 'flex', flexDirection: 'column', gap: `${space.md}px` }}>{children}</Box>
    </Box>
  )
}

/** PDF 문서 정리 — [전체 병합] + [페이지 도구] 팝오버 (분할/회전/삭제/순서) */
function PdfToolsControl({ pdfCount, onRun }: { pdfCount: number; onRun: (req: PdfToolRequest) => void }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [op, setOp] = useState<'split' | 'rotate' | 'delete' | 'reorder'>('split')
  const [pages, setPages] = useState('')
  const [angle, setAngle] = useState<90 | 180 | 270>(90)
  const info = PDF_OP_HINT[op]
  return (
    <Group label="PDF" tooltip="PDF 문서 정리 (변환과 별개로 바로 저장)">
      <Button
        variant="outlined"
        startIcon={<CallMergeRounded />}
        disabled={pdfCount < 2}
        onClick={() => onRun({ op: 'merge' })}
        title={pdfCount < 2 ? 'PDF를 2개 이상 추가하면 병합할 수 있습니다' : '목록 순서대로 하나의 PDF로 병합해 저장'}
      >
        전체 병합
      </Button>
      <Button variant="outlined" onClick={(e) => setAnchor(e.currentTarget)}>
        페이지 도구
      </Button>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <PopBox title="페이지 도구">
          <Select value={op} onChange={(e) => setOp(e.target.value as typeof op)} sx={selectSx}>
            {(Object.keys(PDF_OP_HINT) as (keyof typeof PDF_OP_HINT)[]).map((k) => (
              <MenuItem key={k} value={k}>
                {PDF_OP_HINT[k].label}
              </MenuItem>
            ))}
          </Select>
          <BarInput value={pages} onChange={setPages} placeholder={info.placeholder} width={284} />
          {op === 'rotate' && (
            <Select value={angle} onChange={(e) => setAngle(Number(e.target.value) as typeof angle)} sx={selectSx}>
              <MenuItem value={90}>90° (시계방향)</MenuItem>
              <MenuItem value={180}>180°</MenuItem>
              <MenuItem value={270}>270°</MenuItem>
            </Select>
          )}
          <Box sx={{ fontSize: font.xs, color: color.textSecondary }}>{info.hint} 현재 선택된 파일에 적용됩니다.</Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => {
                setAnchor(null)
                onRun(op === 'rotate' ? { op, pages, angle } : { op, pages })
              }}
            >
              적용 후 저장
            </Button>
          </Box>
        </PopBox>
      </Popover>
    </Group>
  )
}

/** 자르기 수치 입력 팝오버 — 출력 픽셀 좌표 ↔ 정규화 좌표 */
function CropNumbers({ crop, frame, onCrop }: { crop: CropRect | null; frame: { w: number; h: number }; onCrop: (c: CropRect) => void }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const px = { x: Math.round(c.x * frame.w), y: Math.round(c.y * frame.h), w: Math.round(c.w * frame.w), h: Math.round(c.h * frame.h) }
  const set = (k: keyof typeof px, v: string): void => {
    const n = Math.max(0, Math.round(Number(v)))
    if (!Number.isFinite(n)) return
    const next = { ...px, [k]: n }
    next.w = Math.max(1, Math.min(frame.w, next.w))
    next.h = Math.max(1, Math.min(frame.h, next.h))
    next.x = Math.min(frame.w - next.w, next.x)
    next.y = Math.min(frame.h - next.h, next.y)
    onCrop({ x: next.x / frame.w, y: next.y / frame.h, w: next.w / frame.w, h: next.h / frame.h })
  }
  const field = (k: keyof typeof px, label: string): JSX.Element => (
    <Group label={label}>
      <BarInput type="number" value={String(px[k])} onChange={(v) => set(k, v)} width={80} ariaLabel={`자르기 ${label}`} />
    </Group>
  )
  return (
    <>
      <Button variant="outlined" onClick={(e) => setAnchor(e.currentTarget)} title="자르기 영역을 픽셀로 지정">
        수치…
      </Button>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <PopBox title={`자르기 영역 (프레임 ${frame.w}×${frame.h}px)`} width={260}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${space.md}px` }}>
            {field('x', 'X')}
            {field('y', 'Y')}
            {field('w', '폭')}
            {field('h', '높이')}
          </Box>
        </PopBox>
      </Popover>
    </>
  )
}

/**
 * 컨텍스트 툴바 (30px) — 선택된 변환 대상에 따라 옵션이 바뀐다.
 * 높이 고정: 대상마다 내용이 달라져도 본문이 세로로 튀지 않는다. 넘치면 가로 스크롤.
 */
export default function OptionsBar(p: OptionsBarProps): JSX.Element {
  const set = (patch: Partial<WatermarkOpts>): void => p.onWm({ ...p.wm, ...patch })

  // 크기 입력: 이미지 출력(px 지정) + 이미지→PDF(임베드 전 리사이즈) 모두 의미가 있다
  const showResize = p.targetIsImage || (p.sourceIsImage && p.target === 'pdf')
  const showQuality = p.target === 'jpeg' || p.target === 'webp'
  const imageOut = p.target !== 'svg'

  let content: JSX.Element
  if (p.commonKind === null) content = <Hint>파일을 추가하면 변환 옵션이 나타납니다.</Hint>
  else if (p.commonKind === 'mixed') content = <Hint>같은 종류의 파일끼리만 함께 변환할 수 있습니다.</Hint>
  else if (p.targets.length === 0) content = <Hint>{FORMATS[p.commonKind].label} 은(는) 현재 버전에서 변환 대상이 없습니다.</Hint>
  else if (!p.target) content = <Hint>위 툴바에서 변환 대상을 선택하세요.</Hint>
  else {
    const alphaTarget = supportsAlpha(p.target)
    const canWhite = alphaTarget // 흰색→투명은 투명도를 담을 수 있는 출력만
    const canAi = p.sourceIsImage // AI 배경 제거는 이미지 원본만 (jpeg 대상이면 매트 색으로 합쳐짐)
    content = (
      <>
        {p.commonKind === 'pdf' && (
          <>
            <PdfToolsControl pdfCount={p.pdfCount} onRun={p.onPdfTool} />
            <GDivider />
            <Group label="해상도" tooltip="PDF 페이지 렌더링 배율">
              <Select value={p.scale} onChange={(e) => p.onScale(Number(e.target.value))} sx={{ ...selectSx, minWidth: 104 }}>
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
            <Group label="크기" tooltip="출력 크기(px) — 비우면 원본 유지, 한쪽만 입력하면 비율 유지">
              <BarInput type="number" value={p.resizeW} onChange={p.onResizeW} placeholder="가로 자동" width={74} ariaLabel="출력 가로(px)" />
              <Box component="span" sx={{ color: color.textMuted }}>
                ×
              </Box>
              <BarInput type="number" value={p.resizeH} onChange={p.onResizeH} placeholder="세로 자동" width={74} ariaLabel="출력 세로(px)" />
              <IconBevel icon={<AspectRatioRounded />} tooltip="이미지 크기… (단위·해상도·비율 잠금) Ctrl+Alt+I" onClick={p.onOpenImageSize} />
              {p.dpi && (
                <Box component="span" className="tnum" sx={{ fontSize: font.xs, color: color.textSecondary }}>
                  {Math.round(p.dpi)}dpi
                </Box>
              )}
            </Group>
            <ToggleChip
              icon={<CropFreeRounded />}
              label="캔버스"
              tooltip="캔버스 크기… — 여백 추가·정사각 만들기 (Ctrl+Alt+C)"
              on={!!p.canvasSize}
              onClick={p.onOpenCanvasSize}
              disabled={!p.sourceIsImage && p.commonKind !== 'pdf'}
            />
            <GDivider />
          </>
        )}

        {showQuality && (
          <>
            <SliderControl label="품질" tooltip="인코딩 품질 — 낮출수록 파일이 작아집니다" value={p.quality} min={10} max={100} step={1} format={(v) => `${v}%`} onChange={p.onQuality} />
            <IconBevel icon={<VisibilityOutlined />} tooltip="내보내기 미리보기… — 실제 인코딩 결과와 용량 확인" onClick={p.onOpenExport} />
            <GDivider />
          </>
        )}

        {p.sourceIsImage && (
          <>
            <TransformControl tf={p.tf} onTf={p.onTf} />
            <ToggleChip
              icon={<FilterBAndWRounded />}
              label="흑백"
              tooltip="변환 결과물을 흑백(그레이스케일)으로"
              on={!!p.tf.grayscale}
              onClick={() => p.onTf({ ...p.tf, grayscale: !p.tf.grayscale })}
            />
            <GDivider />
          </>
        )}

        {p.sourceIsImage && (
          <ToggleChip
            icon={<DocumentScannerOutlined />}
            label="펴기"
            tooltip="원근 보정·기울기… — 비뚤게 찍은 문서·영수증을 반듯하게 (선택 파일마다, Ctrl+Shift+P)"
            on={p.warped}
            onClick={p.onOpenPerspective}
          />
        )}
        {imageOut && <ToggleChip icon={<TuneRounded />} label="보정" tooltip="보정… — 레벨·커브·노출·색조/채도·그레인·반전 (Ctrl+M)" on={hasAdjust(p.adjust)} onClick={p.onOpenAdjust} />}
        {imageOut && <ToggleChip icon={<BlurOnRounded />} label="필터" tooltip="필터… — 가우시안·모션 블러·노이즈·렌즈 보정 (Ctrl+Shift+F)" on={hasFilters(p.filters)} onClick={p.onOpenFilters} />}
        {imageOut && (
          <ToggleChip icon={<AutoAwesomeOutlined />} label="효과" tooltip="효과… — 외곽선·그림자·색 덮기 (스티커 만들기, Ctrl+Shift+E)" on={hasEffects(p.effects)} onClick={p.onOpenEffects} />
        )}
        {imageOut && <GDivider />}

        {(canWhite || canAi) && (
          <>
            <Group label="배경" tooltip="배경 처리 — 미리보기에 즉시 반영">
              <Select value={p.bg.mode} onChange={(e) => p.onBg({ ...p.bg, mode: e.target.value as BgOptions['mode'] })} sx={{ ...selectSx, minWidth: 110 }}>
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
                label="허용 오차"
                tooltip="흰색에서 얼마나 먼 색까지 지울지"
                value={p.bg.tolerance}
                min={1}
                max={60}
                format={(v) => `${v}%`}
                onChange={(tolerance) => p.onBg({ ...p.bg, tolerance })}
              />
            )}
            {p.bg.mode === 'ai' && canAi && (
              <>
                <SliderControl
                  label="다듬기"
                  tooltip="가장자리 다듬기 — 원본 경계에 마스크를 끌어붙여 머리카락·털을 살립니다 (0 = 끔)"
                  value={p.bg.matte.refine}
                  min={0}
                  max={40}
                  format={(v) => `${v}px`}
                  onChange={(refine) => p.onBg({ ...p.bg, matte: { ...p.bg.matte, refine } })}
                />
                <SliderControl
                  label="이동"
                  tooltip="가장자리 이동 — 음수면 안쪽으로 줄여 배경색 테두리를 없앱니다"
                  value={p.bg.matte.shift}
                  min={-20}
                  max={20}
                  format={(v) => `${v > 0 ? '+' : ''}${v}px`}
                  onChange={(shift) => p.onBg({ ...p.bg, matte: { ...p.bg.matte, shift } })}
                />
                <SliderControl
                  label="대비"
                  tooltip="매트 대비 — 반투명 뿌연 기운을 걷어 냅니다"
                  value={p.bg.matte.contrast}
                  min={0}
                  max={100}
                  format={(v) => `${v}%`}
                  onChange={(contrast) => p.onBg({ ...p.bg, matte: { ...p.bg.matte, contrast } })}
                />
              </>
            )}
            <GDivider />
          </>
        )}

        <ToggleChip
          icon={<CropRounded />}
          label={hasCrop(p.crop) ? `자르기 ${Math.round(p.crop.w * 100)}×${Math.round(p.crop.h * 100)}%` : '자르기'}
          tooltip="미리보기에서 드래그해 남길 영역을 지정 (Shift = 비율 고정, Alt = 가운데 기준 대칭) · C"
          on={p.cropMode || hasCrop(p.crop)}
          onClick={() => p.onCropMode(!p.cropMode)}
        />
        {p.cropMode && (
          <>
            <Select
              value={p.cropAspect}
              onChange={(e) => p.onCropAspect(e.target.value)}
              sx={{ ...selectSx, minWidth: 96 }}
              SelectDisplayProps={{ 'aria-label': '자르기 비율' } as React.HTMLAttributes<HTMLDivElement>}
            >
              {CROP_ASPECTS.map((a) => (
                <MenuItem key={a.key} value={a.key}>
                  {a.label}
                </MenuItem>
              ))}
            </Select>
            {p.frameSize && <CropNumbers crop={p.crop} frame={p.frameSize} onCrop={p.onCrop} />}
          </>
        )}
        {hasCrop(p.crop) && (
          <IconBevel
            icon={<CloseRounded />}
            tooltip="자르기 해제"
            onClick={() => {
              p.onCrop(null)
              p.onCropMode(false)
            }}
          />
        )}
        <GDivider />

        {p.target === 'svg' && <Hint>SVG 벡터화에는 워터마크·보정이 적용되지 않습니다.</Hint>}
        {imageOut && (
          <ToggleChip
            icon={<BrandingWatermarkOutlined />}
            label="워터마크"
            tooltip="변환 결과물에 워터마크를 합성합니다 (미리보기에 실시간 표시)"
            on={p.wm.enabled}
            onClick={() => set({ enabled: !p.wm.enabled })}
          />
        )}
        {imageOut && p.wm.enabled && (
          <>
            <Select
              value={p.wm.type}
              onChange={(e) => set({ type: e.target.value as WatermarkOpts['type'] })}
              sx={{ ...selectSx, minWidth: 80 }}
              SelectDisplayProps={{ 'aria-label': '워터마크 종류' } as React.HTMLAttributes<HTMLDivElement>}
            >
              <MenuItem value="text">텍스트</MenuItem>
              <MenuItem value="signature">내 서명</MenuItem>
            </Select>
            {p.wm.type === 'text' && (
              <>
                <BarInput value={p.wm.text} onChange={(text) => set({ text })} placeholder="예: 이성현 · 대외비" width={130} ariaLabel="워터마크 문구" />
                <PaletteControl title="워터마크 색상" value={p.wm.color} onChange={(c) => set({ color: c })} />
              </>
            )}
            <Select
              value={p.wm.layout}
              onChange={(e) => set({ layout: e.target.value as WmLayout })}
              sx={{ ...selectSx, minWidth: 80 }}
              SelectDisplayProps={{ 'aria-label': '워터마크 배치' } as React.HTMLAttributes<HTMLDivElement>}
            >
              {WM_LAYOUTS.map((l) => (
                <MenuItem key={l.key} value={l.key}>
                  {l.label}
                </MenuItem>
              ))}
            </Select>
            <SliderControl label="크기" tooltip="워터마크 크기" value={p.wm.sizePct} min={5} max={60} format={(v) => `${v}%`} onChange={(sizePct) => set({ sizePct })} />
            <SliderControl
              label="진하기"
              tooltip="워터마크 진하기"
              value={Math.round(p.wm.opacity * 100)}
              min={5}
              max={100}
              step={5}
              format={(v) => `${v}%`}
              onChange={(v) => set({ opacity: v / 100 })}
            />
            {p.wm.layout === 'tile' && (
              <SliderControl label="간격" tooltip="바둑판 간격" value={p.wm.gapPct} min={5} max={120} step={5} format={(v) => `${v}%`} onChange={(gapPct) => set({ gapPct })} />
            )}
            {p.wm.layout !== 'corner' && (
              <SliderControl label="기울기" tooltip="워터마크 기울기" value={p.wm.rotationDeg} min={-90} max={90} step={5} format={(v) => `${v}°`} onChange={(rotationDeg) => set({ rotationDeg })} />
            )}
          </>
        )}
      </>
    )
  }

  return <OverflowBar>{content}</OverflowBar>
}

/**
 * 넘치는 툴바 — 줄이 넘치면 오른쪽 끝에 `»` 가 생기고, 누르면 그 줄이 줄바꿈으로 펼쳐진다
 * (sh-web-editor 툴바 규약. 가로 스크롤보다 한눈에 보인다).
 */
function OverflowBar({ children }: { children: React.ReactNode }): JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useLayoutEffect(() => {
    const el = rowRef.current
    if (!el) return
    const check = (): void => setOverflow(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  })
  return (
    <Box
      sx={{ display: 'flex', alignItems: expanded ? 'flex-start' : 'center', flexShrink: 0, background: surface.toolbar2, borderBottom: `1px solid ${chrome.frame}`, minHeight: size.optionBar + 4 }}
    >
      <Box
        ref={rowRef}
        role="toolbar"
        aria-label="변환 옵션"
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: `${space.sm}px`,
          px: `${space.base}px`,
          py: expanded ? '3px' : 0,
          rowGap: `${space.sm}px`,
          height: expanded ? 'auto' : size.optionBar + 4,
          flexWrap: expanded ? 'wrap' : 'nowrap',
          overflow: 'hidden',
          '& > *': { flexShrink: 0 }
        }}
      >
        {children}
      </Box>
      {(overflow || expanded) && (
        <ButtonBase
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? '옵션 줄 접기' : '넘친 옵션 펼치기'}
          title={expanded ? '접기' : '넘친 옵션 펼치기'}
          sx={{
            width: 18,
            alignSelf: 'stretch',
            flexShrink: 0,
            borderLeft: `1px solid ${chrome.separator}`,
            fontSize: font.md,
            color: color.textSecondary,
            '&:hover': { bgcolor: color.canvas, color: color.text }
          }}
        >
          {expanded ? '«' : '»'}
        </ButtonBase>
      )}
    </Box>
  )
}
