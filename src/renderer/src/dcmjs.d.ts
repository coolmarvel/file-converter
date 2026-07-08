// dcmjs는 완전한 타입 정의를 제공하지 않으므로 사용하는 표면만 최소 선언한다.
declare module 'dcmjs' {
  interface DicomMetaDictionaryStatic {
    uid(): string
    denaturalizeDataset(dataset: Record<string, unknown>): Record<string, unknown>
    naturalizeDataset(dict: Record<string, unknown>): Record<string, unknown>
  }
  class DicomDict {
    constructor(meta: Record<string, unknown>)
    dict: Record<string, unknown>
    meta: Record<string, unknown>
    write(): ArrayBuffer
  }
  const dcmjs: {
    data: {
      DicomMetaDictionary: DicomMetaDictionaryStatic
      DicomDict: typeof DicomDict
    }
  }
  export default dcmjs
}
