import { useRef, useState, DragEvent } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import { ui } from '../theme'

/** 파일이 없을 때 본문 전체를 차지하는 랜딩형 드롭존 (pdf-editor Landing 톤) */
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
        m: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        border: `2px dashed ${over ? ui.brand[500] : ui.gray[300]}`,
        bgcolor: over ? ui.brand[50] : '#fff',
        cursor: 'pointer',
        transition: 'background-color .15s, border-color .15s'
      }}
    >
      <Stack spacing={1.4} alignItems="center" sx={{ p: 4, textAlign: 'center' }}>
        {/* TailAdmin 빈 상태 문법: 브랜드 틴트 원형 아이콘 배지 */}
        <Box
          sx={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            bgcolor: over ? ui.brand[100] : ui.brand[50],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color .15s'
          }}
        >
          <CloudUploadOutlined sx={{ fontSize: 44, color: ui.brand[500] }} />
        </Box>
        <Typography sx={{ fontWeight: 700, fontSize: 19 }}>파일을 여기에 끌어다 놓거나 클릭해서 추가하세요</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 14.5, maxWidth: 560 }}>
          PDF · PNG · JPEG · WebP · BMP · GIF · SVG · AVIF · HEIC · TIFF · ICO
          <br />
          여러 개 가능 · <b>Ctrl+V</b> 로 클립보드 이미지 붙여넣기
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 1, borderRadius: 99, px: 3.2, py: 1, fontSize: 15.5 }}
          onClick={(e) => {
            e.stopPropagation()
            inputRef.current?.click()
          }}
        >
          파일 선택
        </Button>
      </Stack>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif,.svg,.avif,.heic,.heif,.tif,.tiff,.ico"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </Box>
  )
}
