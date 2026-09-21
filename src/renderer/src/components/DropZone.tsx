import { useRef, useState, DragEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import { ACCEPT_ATTR } from '../util/accept'
import { ui } from '../theme'

const { color, space, font } = ui

/** 파일이 없을 때 본문을 차지하는 드롭존 — 클래식 빈 상태: 점선 1px 틀 + 아이콘 + 한 줄 안내 + 버튼 하나 */
export function DropZone({ onFiles }: { onFiles: (files: File[]) => void }): JSX.Element {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    e.stopPropagation() // 본문 전체 드롭 핸들러(App)로 전파되면 같은 파일이 두 번 추가된다
    setOver(false)
    onFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <Box
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      sx={{
        flex: 1,
        m: `${space.lg}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${space.base}px`,
        textAlign: 'center',
        border: `1px dashed ${over ? color.accent : color.borderStrong}`,
        bgcolor: over ? color.accentSubtle : color.canvas
      }}
    >
      <UploadFileOutlined sx={{ fontSize: 32, color: over ? color.accent : color.textMuted }} />
      <Box sx={{ fontSize: font.lg, fontWeight: font.bold }}>파일을 여기에 끌어다 놓거나 클릭해서 추가하세요</Box>
      <Box sx={{ color: color.textSecondary, lineHeight: font.lhNormal }}>
        PDF · PNG · JPEG · WebP · BMP · GIF · SVG · AVIF · HEIC · TIFF · ICO
        <br />
        여러 개 가능 · <b>Ctrl+V</b> 로 클립보드 이미지 붙여넣기 · <b>Ctrl+O</b> 파일 열기
      </Box>
      <Button
        variant="outlined"
        startIcon={<UploadFileOutlined />}
        onClick={(e) => {
          e.stopPropagation()
          inputRef.current?.click()
        }}
      >
        파일 선택…
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </Box>
  )
}
