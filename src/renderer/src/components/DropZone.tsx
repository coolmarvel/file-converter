import { useRef, useState, DragEvent } from 'react'

export function DropZone({ onFiles }: { onFiles: (files: File[]) => void }): JSX.Element {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    onFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <p>
        <strong>파일을 여기에 끌어다 놓거나 클릭</strong>해서 추가하세요
      </p>
      <p style={{ fontSize: 12, margin: 0 }}>PDF · PNG · JPEG · WebP (여러 개 가능)</p>
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
    </div>
  )
}
