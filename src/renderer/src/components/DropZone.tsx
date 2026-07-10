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
      <Stack spacing={1.2} alignItems="center" sx={{ p: 4, textAlign: 'center' }}>
        <CloudUploadOutlined sx={{ fontSize: 56, color: over ? ui.brand[500] : ui.gray[400] }} />
        <Typography sx={{ fontWeight: 700, fontSize: 17 }}>파일을 여기에 끌어다 놓거나 클릭해서 추가하세요</Typography>
        <Typography variant="caption" color="text.secondary">
          PDF · PNG · JPEG · WebP · DICOM (여러 개 가능)
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 1, borderRadius: 99, px: 3 }}
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
        accept=".pdf,.png,.jpg,.jpeg,.webp,.dcm,.dicom"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </Box>
  )
}
