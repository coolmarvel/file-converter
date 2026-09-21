import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import { ANCHORS, Anchor, anchorLabel, CanvasSizeOptions, CanvasSizeMode, canvasTarget, checkLimits, CONTENT_FILL } from '@core/index'
import { BarInput, PaletteControl } from '../bar'
import { ClassicDialog, GroupBox, Row, Note } from './parts'
import { ui } from '../../theme'

const { color, size, space, surface } = ui

const MODES: { key: CanvasSizeMode; label: string; hint: string }[] = [
  { key: 'absolute', label: '크기 지정', hint: '모든 결과를 같은 크기의 종이에 앉힙니다.' },
  { key: 'relative', label: '여백 추가', hint: '각 이미지에 가로·세로 픽셀을 더합니다 (음수면 잘라 냅니다).' },
  { key: 'square', label: '정사각형', hint: '긴 변에 맞춰 정사각형으로 — 썸네일·아이콘용.' }
]

/** 앵커 화살표 — 가운데 기준 방향 */
const ARROW: Record<Anchor, string> = { nw: '↖', n: '↑', ne: '↗', w: '←', c: '●', e: '→', sw: '↙', s: '↓', se: '↘' }

/**
 * 캔버스 크기 대화상자 — Compositor `CanvasSizeSheet` 이식 (+ 여러 파일용 '여백 추가'·'정사각형').
 * 픽셀은 그대로, 종이만 늘이거나 잘라 낸다. 3×3 앵커가 원본이 앉을 자리.
 */
export default function CanvasSizeDialog({
  open,
  frame,
  value,
  onClose,
  onApply
}: {
  open: boolean
  /** 기준 이미지의 현재 크기(리사이즈·회전 반영, 캔버스 적용 전) */
  frame: { width: number; height: number } | null
  value: CanvasSizeOptions | null
  onClose: () => void
  onApply: (v: CanvasSizeOptions | null) => void
}): JSX.Element {
  const base = frame ?? { width: 1, height: 1 }
  const fresh = (): CanvasSizeOptions => value ?? { mode: 'absolute', width: base.width, height: base.height, anchor: 'c', background: '#ffffff' }
  const [o, setO] = useState<CanvasSizeOptions>(fresh)
  useEffect(() => {
    if (open) setO(fresh())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = canvasTarget(base.width, base.height, o)
  const limit = checkLimits(t.width, t.height)
  const apply = (): void => {
    if (!limit) onApply(o)
  }

  const setMode = (mode: CanvasSizeMode): void => {
    if (mode === o.mode) return
    // 모드를 바꾸면 숫자의 뜻이 바뀐다: 크기 지정 = 현재 크기, 여백 추가 = 0
    setO({ ...o, mode, width: mode === 'absolute' ? base.width : 0, height: mode === 'absolute' ? base.height : 0 })
  }

  return (
    <ClassicDialog
      open={open}
      title="캔버스 크기"
      onClose={onClose}
      onEnter={apply}
      width={420}
      actions={
        <>
          {value && (
            <Button variant="outlined" onClick={() => onApply(null)} sx={{ mr: 'auto' }}>
              해제
            </Button>
          )}
          <Button variant="outlined" onClick={onClose}>
            취소
          </Button>
          <Button variant="contained" onClick={apply} disabled={!!limit}>
            확인
          </Button>
        </>
      }
    >
      <Box className="tnum" sx={{ color: color.textSecondary }}>
        현재: {base.width.toLocaleString()} × {base.height.toLocaleString()} 픽셀 (크기·회전 반영)
      </Box>
      <GroupBox title="방식">
        {MODES.map((m) => (
          <Box key={m.key} component="label" sx={{ display: 'flex', alignItems: 'center', gap: `${space.sm}px` }}>
            <input type="radio" name="canvas-mode" checked={o.mode === m.key} onChange={() => setMode(m.key)} style={{ margin: 0, accentColor: color.accent }} />
            <b>{m.label}</b>
            <Box component="span" sx={{ color: color.textSecondary }}>
              — {m.hint}
            </Box>
          </Box>
        ))}
      </GroupBox>

      <Box sx={{ display: 'flex', gap: `${space.base}px` }}>
        <GroupBox title={o.mode === 'relative' ? '더할 픽셀' : '새 크기'} sx={{ flex: 1 }}>
          {(['width', 'height'] as const).map((k) => (
            <Row key={k} label={k === 'width' ? '폭' : '높이'} labelWidth={36}>
              <BarInput
                type="number"
                width={90}
                value={o.mode === 'square' ? String(Math.max(base.width, base.height)) : String(o[k])}
                ariaLabel={`캔버스 ${k === 'width' ? '폭' : '높이'}`}
                onChange={(v) => {
                  const n = Math.round(Number(v))
                  if (Number.isFinite(n) && o.mode !== 'square') setO({ ...o, [k]: n })
                }}
              />
              <Box component="span" sx={{ color: color.textSecondary }}>
                px
              </Box>
            </Row>
          ))}
        </GroupBox>
        <GroupBox title="기준 위치">
          <Box role="radiogroup" aria-label="기준 위치" sx={{ display: 'grid', gridTemplateColumns: `repeat(3, ${size.ctlMd}px)`, gap: '1px' }}>
            {ANCHORS.map((a) => (
              <ButtonBase
                key={a}
                role="radio"
                aria-checked={o.anchor === a}
                aria-label={anchorLabel(a)}
                title={anchorLabel(a)}
                onClick={() => setO({ ...o, anchor: a })}
                sx={{
                  width: size.ctlMd,
                  height: size.ctlMd,
                  border: `1px solid ${color.borderStrong}`,
                  background: o.anchor === a ? color.accent : surface.bevel,
                  color: o.anchor === a ? color.textOnAccent : color.textSecondary,
                  fontSize: 12
                }}
              >
                {ARROW[a]}
              </ButtonBase>
            ))}
          </Box>
        </GroupBox>
      </Box>

      <GroupBox title="여백 채우기">
        {(
          [
            { key: 'color', label: '색', hint: '' },
            { key: 'transparent', label: '투명', hint: 'PNG·WebP·ICO 에서만 유지됩니다.' },
            { key: 'content', label: '내용 인식', hint: '주변 그림으로 자연스럽게 이어 붙입니다 (Compositor Content-Aware Fill). 큰 이미지는 몇 초 걸립니다.' }
          ] as const
        ).map((m) => {
          const current = o.background === null ? 'transparent' : o.background === CONTENT_FILL ? 'content' : 'color'
          return (
            <Box key={m.key} component="label" sx={{ display: 'flex', alignItems: 'center', gap: `${space.sm}px`, minHeight: 24 }}>
              <input
                type="radio"
                name="canvas-fill"
                checked={current === m.key}
                onChange={() => setO({ ...o, background: m.key === 'transparent' ? null : m.key === 'content' ? CONTENT_FILL : '#ffffff' })}
                style={{ margin: 0, accentColor: color.accent }}
              />
              <b>{m.label}</b>
              {m.key === 'color' && current === 'color' && <PaletteControl title="여백 색" value={o.background!} onChange={(c) => setO({ ...o, background: c })} />}
              {m.hint && (
                <Box component="span" sx={{ fontSize: 11, color: color.textSecondary }}>
                  {m.hint}
                </Box>
              )}
            </Box>
          )
        })}
      </GroupBox>

      <Note ok={!limit}>{limit ?? `결과: ${t.width.toLocaleString()} × ${t.height.toLocaleString()} 픽셀`}</Note>
    </ClassicDialog>
  )
}
