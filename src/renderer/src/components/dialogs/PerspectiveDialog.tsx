import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Slider from '@mui/material/Slider'
import { Quad, IDENTITY_QUAD, isIdentityQuad, rotateQuad, quadOutputSize, warpQuad } from '@core/index'
import { loadImageFromUrl } from '../../convert/image'
import { ClassicDialog, Row, Note } from './parts'
import { dims } from '../../util/format'
import { ui } from '../../theme'

const { color, space, font } = ui

/** 편집 화면 크기 */
const VIEW = 440
/** 결과 미리보기 계산 해상도 (긴 변) */
const THUMB = 360

/**
 * 원근 보정(문서 펴기) — 파일마다. Compositor `Distort`(네 모서리 자유 변형)를 변환기 쓰임으로 뒤집은 것:
 * 사진 속 비뚤어진 문서·영수증·칠판의 네 모서리를 찍으면 반듯한 직사각형으로 편다.
 * 기울기 슬라이더는 네 모서리를 한꺼번에 돌린다(살짝 기운 스캔 바로잡기 = 임의 각도 회전).
 * 계산은 core/perspective.ts (호모그래피, 테스트됨).
 */
export default function PerspectiveDialog({
  url,
  fileName,
  value,
  onClose,
  onApply
}: {
  /** 원본 이미지 URL (펴기 전) */
  url: string
  fileName: string
  value: Quad | null
  onClose: () => void
  onApply: (q: Quad | null) => void
}): JSX.Element {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [quad, setQuad] = useState<Quad>(value ?? IDENTITY_QUAD)
  const [angle, setAngle] = useState(0) // 슬라이더 기준 — 적용할 때 quad 에 녹아 들어간다
  const [thumb, setThumb] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)

  useEffect(() => {
    loadImageFromUrl(url)
      .then(setImg)
      .catch(() => setImg(null))
  }, [url])

  const W = img?.naturalWidth ?? 1
  const H = img?.naturalHeight ?? 1
  const k = Math.min(VIEW / W, VIEW / H)
  const vw = Math.round(W * k)
  const vh = Math.round(H * k)
  const effective = useMemo(() => (angle ? rotateQuad(quad, angle, W / H) : quad), [quad, angle, W, H])
  const out = quadOutputSize(effective, W, H)

  // 결과 미리보기 — 축소본에서 편다 (150ms 디바운스)
  const small = useMemo(() => {
    if (!img) return null
    const s = Math.min(1, THUMB / Math.max(W, H))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(W * s))
    c.height = Math.max(1, Math.round(H * s))
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.drawImage(img, 0, 0, c.width, c.height)
    return { data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
  }, [img, W, H])
  useEffect(() => {
    if (!small) return
    const t = setTimeout(() => {
      const o = quadOutputSize(effective, small.w, small.h)
      const px = warpQuad(small.data, small.w, small.h, effective, o.width, o.height)
      const c = document.createElement('canvas')
      c.width = o.width
      c.height = o.height
      const im = c.getContext('2d')!.createImageData(o.width, o.height)
      im.data.set(px)
      c.getContext('2d')!.putImageData(im, 0, 0)
      setThumb(c.toDataURL('image/png'))
    }, 150)
    return () => clearTimeout(t)
  }, [small, effective])

  const norm = (e: React.PointerEvent): { x: number; y: number } => {
    const r = boxRef.current!.getBoundingClientRect()
    // 이미지 밖으로 조금 나가도 된다 (모서리가 사진 밖에 있을 때) — 0.25 여유
    return { x: Math.min(1.25, Math.max(-0.25, (e.clientX - r.left) / r.width)), y: Math.min(1.25, Math.max(-0.25, (e.clientY - r.top) / r.height)) }
  }
  const apply = (): void => onApply(isIdentityQuad(effective) ? null : effective)
  const pts = effective.map((p) => `${p.x * vw},${p.y * vh}`).join(' ')

  return (
    <ClassicDialog
      open
      title={`원근 보정 · 기울기 — ${fileName}`}
      onClose={onClose}
      onEnter={apply}
      width={860}
      actions={
        <>
          <Button
            variant="outlined"
            sx={{ mr: 'auto' }}
            onClick={() => {
              setQuad(IDENTITY_QUAD)
              setAngle(0)
            }}
          >
            초기화
          </Button>
          <Button variant="outlined" onClick={onClose}>
            취소
          </Button>
          <Button variant="contained" onClick={apply} disabled={!img}>
            확인
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', gap: `${space.lg}px` }}>
        <Box sx={{ width: VIEW + 60, height: VIEW + 60, bgcolor: color.viewer, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Box ref={boxRef} sx={{ position: 'relative', width: vw, height: vh, touchAction: 'none' }}>
            {img && <Box component="img" src={url} alt="원본" draggable={false} sx={{ width: vw, height: vh, display: 'block', opacity: 0.85 }} />}
            <Box component="svg" sx={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} width={vw} height={vh}>
              <polygon points={pts} fill="rgba(59,116,242,0.12)" stroke={color.accent} strokeWidth={1.5} />
            </Box>
            {effective.map((p, i) => (
              <Box
                key={i}
                role="slider"
                aria-label={['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래'][i] + ' 모서리'}
                onPointerDown={(e) => {
                  // 기울기가 걸려 있으면 먼저 모서리에 녹여 넣고 끈다
                  if (angle) {
                    setQuad(effective)
                    setAngle(0)
                  }
                  drag.current = i
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  if (drag.current !== i) return
                  const n = norm(e)
                  setQuad((q) => q.map((qp, j) => (j === i ? n : qp)) as Quad)
                }}
                onPointerUp={() => {
                  drag.current = null
                }}
                sx={{
                  position: 'absolute',
                  left: p.x * vw - 6,
                  top: p.y * vh - 6,
                  width: 12,
                  height: 12,
                  bgcolor: color.canvas,
                  border: `2px solid ${color.accent}`,
                  cursor: 'move',
                  touchAction: 'none'
                }}
              />
            ))}
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: `${space.base}px` }}>
          <Box sx={{ fontWeight: font.bold }}>결과 미리보기</Box>
          <Box sx={{ flex: 1, minHeight: 240, bgcolor: color.viewer, display: 'flex', alignItems: 'center', justifyContent: 'center', p: `${space.sm}px` }}>
            {thumb && <Box component="img" src={thumb} alt="펴진 결과" sx={{ maxWidth: '100%', maxHeight: 320, display: 'block' }} />}
          </Box>
          <Row label="기울기" labelWidth={48}>
            <Slider value={angle} min={-45} max={45} step={0.1} onChange={(_, v) => setAngle(v as number)} aria-label="기울기" sx={{ flex: 1 }} />
            <Box className="tnum" sx={{ width: 44, textAlign: 'right' }}>
              {angle.toFixed(1)}°
            </Box>
          </Row>
          <Box sx={{ fontSize: font.xs, color: color.textSecondary, lineHeight: font.lhNormal }}>
            파란 네 모서리를 문서의 네 귀퉁이에 맞추세요. 사진 밖으로 조금 나가도 됩니다(빈 곳은 투명). 기울기는 살짝 비뚤어진 스캔을 바로잡을 때.
          </Box>
          <Note>결과: {dims(out.width, out.height)}픽셀 (마주 보는 변 길이의 평균)</Note>
        </Box>
      </Box>
    </ClassicDialog>
  )
}
