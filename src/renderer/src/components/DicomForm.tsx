import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { DicomMeta } from '../convert/dicom'

/** 환자·검사 정보 폼 — 컨텍스트 툴바의 [환자 정보] 팝오버 안에서 쓴다 */
export function DicomForm({
  meta,
  onChange
}: {
  meta: DicomMeta
  onChange: (m: DicomMeta) => void
}): JSX.Element {
  const set = (patch: Partial<DicomMeta>) => onChange({ ...meta, ...patch })
  return (
    <Stack spacing={1.4} sx={{ p: 2, width: 300 }}>
      <Typography variant="caption" color="text.secondary">
        PACS 등록에 필요한 환자·검사 정보입니다. (생성 후 DICOM 뷰어로 확인 권장)
      </Typography>
      <TextField
        size="small"
        label="환자 이름 *"
        value={meta.patientName}
        onChange={(e) => set({ patientName: e.target.value })}
        placeholder="홍길동"
        error={!meta.patientName.trim()}
      />
      <TextField
        size="small"
        label="환자 ID *"
        value={meta.patientID}
        onChange={(e) => set({ patientID: e.target.value })}
        placeholder="00123456"
        error={!meta.patientID.trim()}
      />
      <TextField
        size="small"
        label="생년월일 (YYYYMMDD)"
        value={meta.patientBirthDate ?? ''}
        onChange={(e) => set({ patientBirthDate: e.target.value })}
        placeholder="19900101"
      />
      <TextField
        size="small"
        select
        label="성별"
        value={meta.patientSex ?? ''}
        onChange={(e) => set({ patientSex: e.target.value as DicomMeta['patientSex'] })}
      >
        <MenuItem value="">선택 안 함</MenuItem>
        <MenuItem value="M">남 (M)</MenuItem>
        <MenuItem value="F">여 (F)</MenuItem>
        <MenuItem value="O">기타 (O)</MenuItem>
      </TextField>
      <TextField size="small" select label="Modality" value={meta.modality ?? 'OT'} onChange={(e) => set({ modality: e.target.value })}>
        <MenuItem value="OT">OT (기타)</MenuItem>
        <MenuItem value="XC">XC (External Camera)</MenuItem>
        <MenuItem value="SC">SC (Secondary Capture)</MenuItem>
      </TextField>
      <TextField
        size="small"
        label="검사 설명"
        value={meta.studyDescription ?? ''}
        onChange={(e) => set({ studyDescription: e.target.value })}
        placeholder="예: 외래 스캔본"
      />
    </Stack>
  )
}
