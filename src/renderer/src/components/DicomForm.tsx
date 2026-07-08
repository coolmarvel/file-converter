import { DicomMeta } from '../convert/dicom'

export function DicomForm({
  meta,
  onChange
}: {
  meta: DicomMeta
  onChange: (m: DicomMeta) => void
}): JSX.Element {
  const set = (patch: Partial<DicomMeta>) => onChange({ ...meta, ...patch })
  return (
    <div style={{ marginBottom: 12 }}>
      <p className="hint" style={{ marginBottom: 10 }}>
        PACS 등록에 필요한 환자·검사 정보입니다. (생성 후 DICOM 뷰어로 확인 권장)
      </p>
      <label className="field">
        <span>환자 이름 *</span>
        <input value={meta.patientName} onChange={(e) => set({ patientName: e.target.value })} placeholder="홍길동" />
      </label>
      <label className="field">
        <span>환자 ID *</span>
        <input value={meta.patientID} onChange={(e) => set({ patientID: e.target.value })} placeholder="00123456" />
      </label>
      <label className="field">
        <span>생년월일 (YYYYMMDD)</span>
        <input value={meta.patientBirthDate ?? ''} onChange={(e) => set({ patientBirthDate: e.target.value })} placeholder="19900101" />
      </label>
      <label className="field">
        <span>성별</span>
        <select value={meta.patientSex ?? ''} onChange={(e) => set({ patientSex: e.target.value as DicomMeta['patientSex'] })}>
          <option value="">선택 안 함</option>
          <option value="M">남 (M)</option>
          <option value="F">여 (F)</option>
          <option value="O">기타 (O)</option>
        </select>
      </label>
      <label className="field">
        <span>Modality</span>
        <select value={meta.modality ?? 'OT'} onChange={(e) => set({ modality: e.target.value })}>
          <option value="OT">OT (기타)</option>
          <option value="XC">XC (External Camera)</option>
          <option value="SC">SC (Secondary Capture)</option>
        </select>
      </label>
      <label className="field">
        <span>검사 설명</span>
        <input value={meta.studyDescription ?? ''} onChange={(e) => set({ studyDescription: e.target.value })} placeholder="예: 외래 스캔본" />
      </label>
    </div>
  )
}
