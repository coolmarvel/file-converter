# 파일 변환기 (file-converter)

PDF·이미지를 오프라인에서 상호 변환하는 데스크톱 앱. 여러 파일을 끌어다 놓으면
종류를 자동 감지하고, 가능한 변환 대상만 보여주며, 미리보기 후 변환·저장한다.
(DICOM 변환은 2026-07-13 제거 — 전용 DICOM 변환기 프로젝트로 분리 예정)

## 스택

- **Electron 33** + **electron-vite** (main / preload / renderer 분리, HMR)
- **React 18 + TypeScript**
- 변환 라이브러리: **pdf.js**(PDF 렌더), **pdf-lib**(PDF 생성/편집), BMP는 자체 인코더(`core/bmp.ts`)
- 패키징: **electron-builder** (윈도우 NSIS 설치기)

## v1 기능

| 원본 | 대상 |
|---|---|
| PDF | PNG / JPEG / WebP (페이지별, 해상도·크기·품질 선택) |
| 이미지(PNG/JPG/WebP/BMP/GIF/SVG/AVIF) | PDF(여러 장 합치기), PNG/JPEG/WebP/BMP — **같은 포맷도 허용**(크기·품질만 조절해 재저장) |

- GIF/SVG/AVIF는 **입력 전용**(브라우저 canvas가 인코딩을 지원하지 않음). BMP 출력은 자체 인코더.
- 이미지 공통 옵션: 크기(px), 품질(jpeg/webp), 회전(90°)·좌우/상하 반전·흑백, 워터마크.
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
    components/         TopBar, ConvertToolbar, OptionsBar, FileSidebar, DropZone, Preview
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
