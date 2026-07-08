/**
 * 이미지 → DICOM Secondary Capture (SC) 생성.
 *
 * 스캔본/사진을 PACS에 넣기 위한 SC Image Storage 객체를 만든다.
 * PACS가 받아들이려면 환자/검사 식별 태그가 반드시 필요하므로 metadata 를 입력받는다.
 *
 * ⚠️ 실사용 전 반드시 DICOM 뷰어로 열어 검증할 것. (병원 PACS 규칙에 따라 필수 태그가 더 있을 수 있음)
 */
import dcmjs from 'dcmjs'
import { imageToRgb, mimeFor } from './image'
import { FileKind } from '@core/index'

const { DicomMetaDictionary, DicomDict } = dcmjs.data

export interface DicomMeta {
  patientName: string // "홍길동" (DICOM은 "성^이름" 권장이나 단순 문자열 허용)
  patientID: string
  patientBirthDate?: string // YYYYMMDD
  patientSex?: 'M' | 'F' | 'O' | ''
  modality?: string // 기본 'OT' (Other) — 사진/스캔이면 'XC'도 가능
  studyDescription?: string
  seriesDescription?: string
}

function nowDicomDate(): { date: string; time: string } {
  const d = new Date()
  const p = (n: number, len = 2) => String(n).padStart(len, '0')
  return {
    date: `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`,
    time: `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  }
}

/** 짝수 길이로 패딩(DICOM 값은 짝수 바이트) + 독립 ArrayBuffer로 복사 */
function padEven(buf: Uint8Array): ArrayBuffer {
  const len = buf.length + (buf.length % 2)
  const out = new Uint8Array(len)
  out.set(buf)
  return out.buffer
}

export async function imageToDicom(
  imageBytes: Uint8Array,
  imageKind: FileKind,
  meta: DicomMeta
): Promise<Uint8Array> {
  const { width, height, rgb } = await imageToRgb(imageBytes, mimeFor(imageKind))
  const { date, time } = nowDicomDate()

  const studyUID = DicomMetaDictionary.uid()
  const seriesUID = DicomMetaDictionary.uid()
  const sopInstanceUID = DicomMetaDictionary.uid()
  const SC_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.7' // Secondary Capture Image Storage

  const dataset: Record<string, unknown> = {
    SpecificCharacterSet: 'ISO_IR 192', // UTF-8 (한글 이름 대비)
    ImageType: ['DERIVED', 'SECONDARY'],
    SOPClassUID: SC_SOP_CLASS,
    SOPInstanceUID: sopInstanceUID,
    StudyDate: date,
    StudyTime: time,
    Modality: meta.modality || 'OT',
    ConversionType: 'WSD', // Workstation
    PatientName: meta.patientName || 'ANONYMOUS',
    PatientID: meta.patientID || 'UNKNOWN',
    PatientBirthDate: meta.patientBirthDate || '',
    PatientSex: meta.patientSex || '',
    StudyInstanceUID: studyUID,
    SeriesInstanceUID: seriesUID,
    StudyID: '1',
    SeriesNumber: '1',
    InstanceNumber: '1',
    StudyDescription: meta.studyDescription || '',
    SeriesDescription: meta.seriesDescription || '',
    // 픽셀 관련 (8bit RGB interleaved)
    SamplesPerPixel: 3,
    PhotometricInterpretation: 'RGB',
    PlanarConfiguration: 0,
    Rows: height,
    Columns: width,
    BitsAllocated: 8,
    BitsStored: 8,
    HighBit: 7,
    PixelRepresentation: 0,
    PixelData: [padEven(rgb)]
  }

  const meta0 = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: SC_SOP_CLASS,
    MediaStorageSOPInstanceUID: sopInstanceUID,
    TransferSyntaxUID: '1.2.840.10008.1.2.1', // Explicit VR Little Endian
    ImplementationClassUID: DicomMetaDictionary.uid()
  }

  const dicomDict = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta0))
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset)
  const buffer: ArrayBuffer = dicomDict.write()
  return new Uint8Array(buffer)
}
