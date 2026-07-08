# 파일 변환기 (file-converter)

PDF·이미지·DICOM을 오프라인에서 상호 변환하는 데스크톱 앱. 여러 파일을 끌어다 놓으면
종류를 자동 감지하고, 가능한 변환 대상만 보여주며, 미리보기 후 변환·저장한다.

## 스택

- **Electron 33** + **electron-vite** (main / preload / renderer 분리, HMR)
- **React 18 + TypeScript**
- 변환 라이브러리: **pdf.js**(PDF 렌더), **pdf-lib**(PDF 생성/편집), **dcmjs**(DICOM 생성)
- 패키징: **electron-builder** (윈도우 NSIS 설치기)

## v1 기능

| 원본 | 대상 |
|---|---|
| PDF | PNG / JPEG (페이지별, 해상도 선택) |
| 이미지(PNG/JPG/WebP) | PDF(여러 장 합치기), 다른 이미지 포맷, **DICOM(Secondary Capture)** |

- DICOM은 **이미지 → DICOM 생성만** 지원(스캔/사진을 PACS에 넣는 SC 객체). 환자 정보 입력 폼 제공.
  ⚠️ 생성 후 반드시 DICOM 뷰어로 검증할 것.
- "문서 정리"(PDF 병합/분할/회전/삭제/순서변경)는 `src/renderer/src/convert/pdf.ts`에 구현되어 있고,
  UI 연결은 미정. PDF 편집(주석·서명·텍스트)은 자매 프로젝트 `~/pdf-editor`("PDF 편집기") 담당 — 2026-07-08 분리.

## 구조

```
src/
  core/                Electron 무관 순수 TS — 형식 감지 + 변환 경로 레지스트리 (테스트 대상)
    fileTypes.ts       매직 바이트 기반 형식 감지
    conversions.ts     "무엇을 무엇으로" 레지스트리 (확장 지점)
  main/index.ts        BrowserWindow + 파일 저장 IPC
  preload/index.ts     contextBridge로 안전한 파일 API 노출
  renderer/src/
    App.tsx            화면 상태·흐름
    components/         DropZone, FileCard, DicomForm
    convert/           실제 변환 구현 (브라우저 canvas/pdf.js 사용)
```

**확장 방법**: 새 변환 추가 = `core/conversions.ts`의 `targetsFor`에 대상 추가 +
`renderer/src/convert/index.ts` 디스패처에 구현 연결, 두 곳만 수정.

## 개발 / 빌드

```bash
npm install
npm run dev          # 개발 모드 (HMR)
npm run typecheck    # 타입 검사 (node/web 양쪽)
npm test             # core 로직 테스트

npm run pack:win     # 폴더형 빌드 (Wine 불필요) → release/win-unpacked/
npm run dist:win     # 윈도우 NSIS 설치기 → release/파일변환기-Setup-*.exe  (WSL에선 Wine 필요)
```

> WSL에서 `dist:win`은 work-report-analyzer와 동일하게 Wine이 필요하다. Wine 없이 확인하려면
> `pack:win`으로 `win-unpacked` 폴더를 만들어 윈도우에서 실행한다.

## 아이콘

`build/icon.ico`(윈도우), `build/icon.png`(mac/linux)를 넣으면 설치기·바로가기에 반영된다.
없으면 기본 Electron 아이콘으로 빌드된다.
