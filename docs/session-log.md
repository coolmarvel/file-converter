---
title: 세션 진행 로그
created: 2026-07-07
updated: 2026-07-13
---

# 세션 진행 로그

> **이 파일이 "무슨 일이 언제 있었나"의 SSOT다** (2026-07-09 git 도입 후에도 유지 — git log는 보조, writing-guide 참고).
> 새 세션은 이 파일부터 읽는다. 세션마다 최상단에 블록을 추가한다. 형식: 날짜 / 한 일 / 현재 상태 / 다음.

---

## 2026-07-13 (세션 8-h) — 설치본 난독화 + 전체 기능 회귀 E2E 24종 (v1.3.2)

사용자: "설치 파일에 난독화 기능까지 넣고 한 번 더 전체 기능 테스트. pdf-editor랑 project-seed 참고."

**한 일**
- **난독화 파이프라인 이식** (`~/pdf-editor/scripts/obfuscate.cjs` + `~/project-seed/guides/desktop-packaging.md` §배포 소스 보호):
  - `scripts/obfuscate.cjs` 신설, `javascript-obfuscator` devDep 추가. `npm run build` =
    electron-vite build + 난독화 → 모든 `pack:*`/`dist:*`가 자동 경유.
  - 보수 설정(식별자 hex + 문자열 배열 0.6만 ON, controlFlowFlattening 등 OFF). **bytecodePlugin 금지**
    (pdf-editor v1.4.2 사고 — WSL 빌드 exe가 Windows에서 cachedDataRejected 즉사).
  - **대형 공개 라이브러리 청크는 SKIP**: `pdf.worker`/`pdf-*`/`decode-*`/`bgremove-*`(onnx는 eval/wasm이라
    난독화 시 동작 위험)/`imagetracer*`. 난독화 대상 = main·preload·`index-*`·`pdftools-*` 6개.
  - 규칙은 `docs/guides/packaging.md`에 "배포 소스 보호" 절로 문서화.
- **난독화 빌드 전체 기능 회귀 E2E** — 이전 세션 스크립트가 scratchpad라 소실 → Playwright `_electron`
  스크립트 새로 작성해 **`test/e2e/full-regression.mjs`로 상설화**(todo P2 "GUI 자동 검증 상설화" 해소.
  playwright는 devDep 아님 — `npm i --no-save playwright`로 실행 시 임시 설치).
  픽스처는 자체 PNG 인코더 + pdf-lib PDF + utif2 TIFF로 생성, main 프로세스 dialog는 스텁.
  **24/24 PASS**: 이미지→JPEG/WebP/BMP/ICO/SVG, 리사이즈·회전(크기 스왑 검증)·undo/redo·흑백(픽셀)·
  흰색→투명(픽셀 alpha)·워터마크·자르기 드래그·다중→PDF / PDF→PNG 페이지별·분할·회전·삭제·순서·병합
  (페이지 수 검증) / TIFF·SVG·ICO 입력 / **AI 배경 제거 실추론**(bgrm:// 서빙, 모서리 alpha=0 확인).
  HEIC 입력만 미검증(오프라인에서 픽스처 생성 불가 — v1.3.0에서 사용자 실기기 확인 예정 항목 유지).
- 검증: typecheck ✅ / core 테스트 9 ✅ / build(난독화 포함) ✅ / E2E 24/24 ✅. 테스트 프로세스 종료 확인.
- v1.3.1 → **v1.3.2**. 인스톨러 구움.

**현재 상태**: 전 기능 동작(난독화 빌드 기준 검증). 설치본 소스 보호 적용.
**다음**: 사용자 설치 테스트 (난독화로 인한 체감 차이는 없어야 정상).

---

## 2026-07-13 (세션 8-g) — UI/UX 확대·폴리시 + 번들 최적화 + 데드코드 정리 (v1.3.1)

사용자: v1.3.0 확인(AI 배경 제거 "감탄"). 지시: TailAdmin 폴더(임시 업로드)에서 UI 컴포넌트를
학습해 UI/UX 업그레이드, 폰트 전반 확대, 코드 공통화·모듈화로 최적화, 불필요 기능 제거.
기존 기능은 깨지면 안 됨. 학습 후 tailadmin* 폴더 삭제(git 미포함).

**TailAdmin 학습 결과**: 우리 theme.ts가 이미 TailAdmin 계열(pdf-editor 경유 — 회색 스케일·섀도 동일)임을
확인. 가져온 것: 크기 체계(버튼 px-5/py-3.5·rounded-lg), 포커스 링 규약, 빈 상태(empty state)의
브랜드 틴트 원형 아이콘 배지, 카드 라운드 문법.

**한 일**
- **크기 전반 확대** (사용자 "폰트가 작다"): 기본 폰트 15→16, caption 13→13.5, MenuItem/Select 14.5→15.5,
  Tooltip 12.5→13.5, 컨트롤 높이 CTL_H 36→40, ToolBtn 76×48→84×54(아이콘 26px), 옵션바 52→58,
  TopBar 타이틀 19px·변환 버튼 확대, 사이드바 296→312(카드 글자·배지·썸네일 확대), 미리보기 줌 표기 확대.
- **폴리시**: 버튼·칩에 키보드 포커스 링(`Mui-focusVisible`), DropZone을 TailAdmin 빈 상태 문법
  (브랜드 원형 아이콘 배지 88px + 큰 타이포)으로.
- **공통화/모듈화**: `bar.tsx`에 `ToggleChip`/`IconToggle` 공용 부품 신설(OptionsBar 로컬 구현 제거),
  App 저장 흐름 3중복 → `saveResults()` 하나로.
- **번들 최적화**: pdf.js+pdf-lib(1,318KB)를 **지연 로딩 청크로 분리** — Preview는 PDF 소스일 때만,
  convert/index는 PDF 분기에서만, pdftools는 실행 시에만 import (타입은 `import type`).
  **시작 청크 2,389KB → 941KB.** heic2any/utif2/imagetracer/bgremove는 이미 지연 로딩.
- **데드코드 제거**: core `PDF_OPS`/`PdfOpInfo`(UI가 붙으며 무용), convert/index의 supportsAlpha 재수출.
- 검증: typecheck ✅ / test 9 ✅ / build ✅ + **전체 회귀 Playwright 35/35**
  (fit 7·wm 4·drop 3·crop 9·v13 12 — 기존 스크립트 전부 재실행) + **Electron AI 5/5** 재확인.
- v1.3.0 → **v1.3.1**. tailadmin-nextjs-pro-225 폴더 학습 후 삭제.
- (후속) **`docs/guides/packaging.md` 신설**: pdf-editor의 맥(Intel x64/Apple Silicon arm64) 빌드
  가이드 이식 — 한글 내부명 크래시 사고·ad-hoc 서명·dist-mac.cjs 이식 필요 등. 맥 빌드는 환경상 미실행(todo P4).

**현재 상태**: v1.3.0 기능 전부 동작(회귀 검증), UI 확대·경량 시작. 인스톨러 구움.
**다음**: 사용자 설치 테스트.

---

## 2026-07-13 (세션 8-f) — 대규모 기능 확장: 배경 제거·HEIC/TIFF·ICO/SVG·PDF 도구·로딩바 (v1.3.0)

사용자: 기능 추천 논의 후 "1~3차 전부 + HEIC/TIFF + ICO + 로딩바까지 한 번에. 인스톨러 크기 무관".

**한 일**
- **배경 처리** (OptionsBar [배경] select — 미리보기 즉시 반영, 체커보드로 투명 표시):
  - **흰색 → 투명**: `image.ts removeWhiteBg`(허용 오차 1~60% + feather). 투명도 가능한 출력
    (png/webp/ico/svg = `supportsAlpha`)에서만 활성. PDF→이미지에도 적용. 미리보기는 Preview에서
    같은 픽셀 연산을 디바운스 적용(2000px 상한 축소본).
  - **AI 배경 제거**: `@imgly/background-removal` **1.4.5** (⚠️ 모델 npm 패키지
    `@imgly/background-removal-data`가 1.4.5까지만 배포 — 라이브러리를 데이터와 같은 버전으로 고정.
    최신 1.7은 자사 CDN 전용이라 오프라인 불가). 모델·wasm 354MB를 **extraResources → resources/bgrm-data**로
    번들하고 main의 **bgrm:// 커스텀 프로토콜**(standard+supportFetchAPI+CORS 응답)로 서빙 → 완전 오프라인.
    렌더러 CSP에 `connect-src bgrm:` + `script-src 'unsafe-eval' 'wasm-unsafe-eval'` 필요(onnxruntime-web).
    BMP 등 imgly 미지원 입력은 PNG로 정규화 후 투입. 결과는 `aiCache`(fileId→PNG)에 캐시 —
    미리보기(App aiUrls)와 변환이 공유, 이력(undo) 대상 아님.
- **입력 확장**: **HEIC/HEIF**(heic2any=libheif 내장)·**TIFF**(utif2) — 추가 시점에 PNG로 디코드
  (`convert/decode.ts`), 원래 포맷은 `AppFile.srcKind`로 배지에만. ICO도 입력 허용(브라우저 네이티브 디코드).
- **출력 확장**: **ICO**(core/ico.ts — PNG 임베드 멀티사이즈 16~256, 정사각 contain, 테스트 포함),
  **SVG 벡터화**(imagetracerjs, 16색, 긴 변 1200px 상한 — 로고용. 워터마크 비적용·UI 안내).
- **PDF 문서 정리 UI**: OptionsBar [전체 병합](2개↑) + [페이지 도구] 팝오버(분할/회전/삭제/순서변경,
  "1,3-5" 파싱 = `convert/pdftools.ts`, 구현은 기존 pdf.ts 함수) — todo P3 해소.
- **Ctrl+V 붙여넣기**: 클립보드 이미지(스크린샷)를 파일로 추가.
- **로딩바**: `progress` 상태 → 하단 중앙 Paper(CircularProgress+LinearProgress).
  AI 모델 로드/추론, 파일 n/m 변환, HEIC/TIFF 디코드, PDF 도구에 연결(`ConvertOptions.onProgress`).
- 검증: typecheck ✅ / core 테스트 9종 ✅ / build ✅ + **Playwright 렌더러 12/12**(흰색→투명 픽셀·
  ICO/SVG 출력·TIFF 입력·Ctrl+V·PDF 병합/회전/분할) + **Playwright _electron 5/5**(실제 앱에서
  bgrm:// 매니페스트 서빙, 로딩바 표시, AI 추론 후 미리보기 교체, 모서리 투명/중앙 유지 픽셀 검사).
- v1.2.0 → **v1.3.0**. 인스톨러가 모델 포함으로 **수백 MB로 커짐** — 사용자 승인("얼마나 커지든 상관 없어").

**현재 상태**: 전 기능 동작. 인스톨러 굽는 중.
**다음**: 사용자 설치 테스트(특히 AI 배경 제거 실사진, HEIC 아이폰 사진). SVG 벡터화는 사진에 부적합함을 안내함.

---

## 2026-07-13 (세션 8-e) — 자르기 + undo/redo (v1.2.0, 사용자가 1.2.0 선언)

사용자 확인: v1.1.4 기능 이상 없음. 새 요청: "그림판 자르기처럼 특정 부분만 도려내고,
어디까지 잘리는지 미리보기로 보여줘. undo/redo도 Ctrl+Z 키보드 포함해서."

**한 일**
- **자르기(crop)**:
  - 모델: `CropRect`(0~1 정규화) — **리사이즈·회전이 반영된 미리보기 화면 기준 좌표**.
    파이프라인 순서 리사이즈→회전→**자르기**→워터마크(`convert/image.ts` `applyCrop`, pdfToImages 동일)라
    미리보기에 보이는 그대로 잘린다. 워터마크는 잘린 결과물 기준 배치(미리보기도 crop 영역 안에 오버레이).
  - UI: OptionsBar [자르기] 토글 칩(영역 있으면 `50×50%`식 크기 표시 + × 해제 버튼).
    Preview `CropLayer` — 드래그로 새 영역, 안쪽 드래그 = 이동, 모서리 핸들 4개 = 크기 조절,
    바깥은 box-shadow dim(잘려나갈 부분). 포인터 캡처 + 프레임 정규화 좌표라 줌 배율 무관.
  - 적용 범위: 이미지 소스(이미지→이미지/PDF) + PDF→이미지(전 페이지 동일 영역).
- **undo/redo**:
  - `Snapshot`(files·activeId·target·scale·resize·quality·tf·crop·wm) 단위 이력, 최대 100칸.
    상태 변경을 400ms 디바운스로 커밋 → 슬라이더 드래그·자르기 드래그·연속 타이핑이 이력 1칸.
  - undo/redo 시 `restoring` ref로 재기록 방지. 파일 삭제 복원을 위해 removeFile의
    previewUrl revoke 제거(URL은 앱 종료 시 해제 — undo로 살릴 때 필요).
  - 트리거: ConvertToolbar [실행취소]/[다시실행] 버튼(비활성 상태 반영) + **Ctrl+Z / Ctrl+Y(또는 Ctrl+Shift+Z)**.
    입력창 포커스 중엔 네이티브 undo에 양보.
- 검증: typecheck ✅ / test 7/7 ✅ / build ✅ + Playwright 9/9
  (드래그로 50×50% 선택→칩 표시·점선+dim, 변환 결과 실제 1200×200, Ctrl+Z/Y로 자르기 취소·복원,
  회전 undo, 파일 삭제 undo 복원). 프로세스 정리 확인.
- v1.1.4 → **v1.2.0** (사용자 지시).

**현재 상태**: 자르기·undo/redo 동작. 인스톨러 구움.
**다음**: 사용자 설치 테스트.

---

## 2026-07-13 (세션 8-d) — 드래그&드롭 파일 중복 추가 수정 (v1.1.4)

사용자 피드백: "탐색기(파일 선택)로는 1장 추가되는데, 끌어다 놓으면 2장이 추가된다."

**원인**: 파일이 없을 때 랜딩 `DropZone`이 본문 안에 렌더되는데, App의 본문 Box에도
"어디에나 끌어다 놓으면 추가" 핸들러가 있다. DropZone의 onDrop이 `stopPropagation()`을
안 해서 이벤트가 App 핸들러로 버블링 → `addFiles`가 두 번 실행돼 같은 파일이 2장 추가.
(v1.1.0에서 본문 전체 드롭을 도입할 때 생긴 버그. input[type=file] 경로는 핸들러가 하나라 정상.)

**수정**: `DropZone.tsx` handleDrop에 `e.stopPropagation()` 한 줄.
검증: typecheck ✅ / test 7/7 ✅ / build ✅ + Playwright 3/3 (DataTransfer로 실제 drop 이벤트
디스패치 — 랜딩 드롭존 1장, 파일 있는 상태 본문 드롭 1장, 배지 합계 2). v1.1.3 → **v1.1.4**.

참고(작업 방식): 이전 정리 실패 원인 규명 — `pkill -f "<경로>"` 패턴이 pkill을 실행하는 셸
자신의 커맨드라인과 매치돼 셸이 먼저 죽고(exit 144) 후속 정리가 안 돌았음. 이후 브래킷 트릭
(`pkill -f "[e]lectron/dist/electron"`)으로 정리하고 잔여 0개 확인을 규칙화(메모리에도 기록).

**현재 상태**: 드롭 추가 정상(1장씩). 인스톨러 구움.
**다음**: 사용자 설치 테스트 (v1.1.1~1.1.4 누적: DICOM 제거, 포맷·옵션 확장, 화면맞춤, WYSIWYG 미리보기, 드롭 수정).

---

## 2026-07-13 (세션 8-c) — 변환 옵션 전부 미리보기 실시간 반영 + 워터마크 기본 진하기 (v1.1.3)

사용자 피드백(v1.1.2 설치 후, 채팅): "워터마크 적용해서 변환 저장했는데 적용이 안 된 것 같다.
미리보기에서 확인하고 싶다. pdf 편집기처럼 미리 보여줘."

**진단**: 워터마크 오버레이·결과물 합성은 정상 동작 중이었음(Playwright 픽셀 검증으로 확인 —
오버레이 canvas painted, PNG 출력에 워터마크 픽셀 존재). 실제 원인 두 가지:
① 기본 진하기 0.22 + 회색이 **사진 위에서 사실상 안 보임** → "적용 안 됨"으로 오인.
② 회전·반전·흑백·크기 옵션은 미리보기에 미반영(P3) → 적용 여부를 확인할 방법이 없었음.

**한 일**
- `DEFAULT_WATERMARK.opacity` 0.22 → **0.35** (pdf-editor `watermarkStyle` 기본과 동일).
- **미리보기에 변환 옵션 실시간 반영** (`Preview.tsx` — todo P3 해소):
  - props에 `transform`/`resize` 추가. App이 변환과 **같은 상태값**을 넘긴다(리사이즈 계산도 공용화).
  - 리사이즈(비율 강제 포함) → `targetSize`로 유효 크기 계산 후 화면맞춤 배율 산정.
  - 회전 90°단위 = 프레임 가로/세로 스왑 + img CSS `rotate`, 반전 = `scale(±1)`, 흑백 = `filter: grayscale(1)`.
  - 이미지는 프레임 정중앙 absolute 배치(translate(-50%,-50%) 후 회전) — 워터마크 오버레이는
    회전된 프레임 위에 정방향으로, 변환 처리 순서(변형→워터마크)와 동일.
  - transform은 원본이 이미지일 때만(변환 동작과 일치), resize는 PDF→이미지 미리보기에도 비율 반영.
- 검증: typecheck ✅ / test 7/7 ✅ / build ✅ + Playwright 10/10
  (오버레이 픽셀·회전 프레임 스왑·grayscale filter·**결과물 JPEG가 실제 1500×300 회전+무채색**·
  이미지→PDF 워터마크 저장·워터마크 PNG 빨간 픽셀 합성). 프로세스 정리 확인.
- v1.1.2 → **v1.1.3**.

**현재 상태**: 미리보기 = 결과물(WYSIWYG). 보이는 그대로 저장된다. 인스톨러 구움.
**다음**: 사용자 설치 테스트. 남은 P3: PDF 문서정리 UI, 형광펜 multiply 등(변화 없음).

---

## 2026-07-13 (세션 8-b) — 미리보기 100% = "화면에 맞춤"(contain)으로 정정 (v1.1.2)

사용자 피드백(스크린샷 4장): v1.1.1의 "100% = 폭맞춤"은 의도와 다름. 세로로 긴 이미지가 화면 밖으로
넘쳐 40%까지 직접 줄여야 했음. 원하는 것 = **pdf-editor의 레이아웃 → "화면에 맞춤"과 동일하게,
100%에서 이미지/페이지 전체가 스크롤 없이 미리보기 안에 들어오는 것**.

**한 일** (`Preview.tsx`)
- 스테이지 **높이까지 측정**(`stage {w,h}`), 이미지 원본 크기(`nat`)를 `<img>` onLoad에서 수집.
- 100% 배율 = `min(stageW/natW, stageH/natH)` (**contain**) — 가로·세로 중 넘치는 쪽 기준. zoom은 그 배수.
- 스테이지를 flex로 바꾸고 프레임에 `m:'auto'` → 화면보다 작으면 **가로·세로 정중앙**, 크면(확대) 스크롤.
- 원본 크기 측정 전 폴백: CSS `maxWidth/maxHeight` contain (원본 픽셀로 새는 순간이 없음).
- "맞춤" 버튼 = 100% 리셋(툴팁 "화면에 맞춤 (100%)"), nat은 소스 변경 시에만 리셋(페이지 넘김엔 유지).
- 검증: typecheck ✅ / test 7/7 ✅ / build ✅ + Playwright 7/7 (세로 300×1500·가로 2400×400 BMP로
  contain·정중앙·확대 시 스크롤·맞춤 복귀 측정. dev 서버·Electron 프로세스는 검증 후 종료 확인 —
  세션 8에서 Electron이 살아남아 사용자가 지적, 이후 정리 확인을 규칙화).
- v1.1.1 → **v1.1.2**. 스크린샷 4장 feedback-archive로 이관.

**현재 상태**: 100% = 화면에 맞춤. 인스톨러 구움(v1.1.1은 사용자 설치 전이었으므로 v1.1.2가 첫 확인 대상).
**다음**: 사용자 설치 테스트 → 스크린샷 피드백.

---

## 2026-07-13 (세션 8) — DICOM 제거 + 포맷·옵션 확장 + 미리보기 폭맞춤 (v1.1.1)

사용자 지시(채팅+스크린샷 1장): ① DICOM 변환은 별도 전용 앱으로 특화 개발할 것이니 관련 기능 전부 제거.
② 같은 포맷→같은 포맷(예: JPEG→JPEG 크기만 조절) 허용 + 지원 확장자가 너무 적음(pdf/png/webp뿐) + 크기 조절 안 됨.
③ 컨텍스트 툴바에 워터마크 말고 기능 더 넣을 것. ④ 미리보기 100%는 무조건 미리보기 폭에 딱 맞게.

**한 일**
- **DICOM 전면 제거**: `convert/dicom.ts`·`DicomForm.tsx`·`dcmjs.d.ts` 삭제, `dcmjs` 의존성 제거,
  FileKind에서 'dicom' 삭제(감지 시 unknown), `ConversionTarget.needs` 필드 자체 제거(용도가 dicomMeta뿐이었음),
  App의 환자정보 상태·검사, TopBar/DropZone/Preview 문구 정리. `.dcm`은 이제 "알 수 없음" 처리.
- **포맷 확장** (`core/fileTypes.ts` + `core/conversions.ts`):
  - 입력: **BMP·GIF·SVG·AVIF** 추가 (매직 바이트 감지, SVG만 텍스트 "<svg" 마커 — detectFileKind header를 512B로).
  - 출력 레지스트리 `IMAGE_OUTPUTS` = png/jpeg/webp/bmp (canvas 인코딩 가능 집합 + BMP 자체 인코더).
    GIF/SVG/AVIF는 **입력 전용**. PDF→이미지에 WebP 추가.
  - **같은 포맷 대상 허용**: 라벨 "(크기·품질만 조절)". `extFor()` 헬퍼 신설(jpeg→"jpg").
  - **`core/bmp.ts` 신설**: 24bit BI_RGB BMP 인코더(순수 TS, bottom-up·행 패딩) — canvas.toBlob이 BMP 미지원이라 직접 작성. 테스트 포함.
- **변환 옵션 확장**: `ConvertOptions`에 `quality`(0~1)·`transform`(rotate 90°단위/flipH/flipV/grayscale) 추가.
  - `convertImageFormat` 시그니처를 옵션 객체로 변경. 처리 순서: 리사이즈 → 회전/반전/흑백 → 워터마크(정방향) → 인코딩.
  - `pdfToImages`도 옵션 객체화(+resize·quality): 크기 지정 시 scale 해상도로 렌더 후 축소.
  - 이미지→PDF: transform/resize 있으면 PNG로 선처리 후 임베드(워터마크는 기존대로 페이지별 합성).
  - OptionsBar: **품질 슬라이더**(jpeg/webp 대상, 10~100%, 기본 92 — todo P4 "JPEG 품질 옵션" 해소),
    **회전 ↺↻/좌우·상하 반전/흑백 토글**(원본이 이미지일 때), 크기(px)는 이미지→PDF에도 노출.
    WmToggle을 공용 `ToggleChip`으로 일반화.
- **미리보기 100% = 폭맞춤 고정**(`Preview.tsx`): `frameW` 폴백을 원본 크기 → `'100%'`로.
  스테이지 폭 측정 전(또는 실패 시)에도 원본 픽셀 크기로 새지 않는다. zoom≤1이면 maxWidth 100% 겸용.
- 검증: typecheck ✅ / test 7/7 ✅(BMP 인코더·새 포맷 감지·같은포맷 경로 추가) / build ✅ +
  **Playwright 실 렌더러 검증 15/15** (vite dev + chromium, window.api 스텁으로 저장 바이트의 매직 바이트까지 확인:
  JPEG→JPEG(크기·회전·흑백)/JPEG→BMP/GIF→PNG/SVG→WebP, DICOM 부재, 폭맞춤 측정. 스크립트는 scratchpad 1회용).
- v1.1.0 → **v1.1.1**. 스크린샷 1장 feedback-archive로 이관.

**현재 상태**: DICOM 없는 순수 PDF·이미지 변환기. 인스톨러 구움. 커밋/푸시는 사용자가 직접.
**다음**: 사용자 설치 테스트 → 스크린샷 피드백. 미리보기에 리사이즈/회전/흑백 실시간 반영(P3)은 미착수.
DICOM 전용 변환기 프로젝트는 사용자가 시작 시점 결정.

---

## 2026-07-10 (세션 7) — UI 전면 개편: pdf-editor 디자인 시스템 이식 (v1.1.0)

사용자 지시: "파일변환기 UI가 구리다. pdf-editor처럼 하고 싶다. UI만 긁어와서 기존 기능에
충돌 안 나게. 옵션은 우측 사이드바가 아니라 툴바/컨텍스트 툴바로. 버전은 1.1.x로."
(참고: 이 레포는 이번 세션에 GitHub `coolmarvel/file-converter` 에서 `~/file-converter` 로 재클론됨.)

**한 일**
- **MUI 도입**: `@mui/material` + `@mui/icons-material` + emotion (pdf-editor와 동일 v6 계열).
  `theme.ts`를 pdf-editor에서 이식하되 **브랜드 색만 기존 파랑 #3b74f2 스케일로 교체**
  (그레이·섀도·라운드·컴포넌트 오버라이드는 두 앱 공통 규칙). `styles.css` 삭제 — 스타일은 테마+sx 일원화.
- **레이아웃 재구성** (pdf-editor Editor 셸 문법: 상단 3단 바 + 본문):
  - `TopBar.tsx` — 앱 아이덴티티 + 우측 [N개 변환 후 저장] 알약 버튼(+진행 스피너).
  - `ConvertToolbar.tsx` — 76×48 ToolBtn 규격. 파일 목록 토글·파일 추가 + **변환 대상 선택**("PNG →" 라벨 뒤 대상들).
  - `OptionsBar.tsx` — **컨텍스트 툴바(52px 고정)**. 대상에 따라 해상도(PDF)/출력 크기(이미지)/
    환자 정보 팝오버(DICOM, 필수 누락 시 error 톤)/워터마크(토글 칩 → 종류·문구·팔레트·배치·크기·진하기·간격·기울기) 노출.
    공용 부품은 `bar.tsx` (Group/GDivider/BarInput/PaletteControl/SliderControl — SubToolbar 규약 이식).
  - `FileSidebar.tsx` — 파일 목록을 좌측 사이드바(296px)로 이동. 구 `FileCard.tsx` 삭제(내부로 흡수).
  - `DropZone.tsx` — 파일 없을 때 본문 전체 랜딩형으로 개편. 본문 어디든 드래그&드롭 가능(App에서 처리).
  - `Preview.tsx` — **로직 무수정**(렌더 세대·PDF 캐시·URL 소유권 규칙 그대로), 표현만 MUI로.
    `WatermarkOverlay`는 className→인라인 스타일만 변경.
  - 상태 메시지는 `.status` div → **Snackbar/Alert** (err는 수동 닫기, 나머지 5초 자동).
- **불변 경계 준수**: `core/`, `convert/`, `watermark/model.ts`, main/preload IPC, `runConversion` 시그니처,
  App의 상태·핸들러(addFiles/removeFile/moveFile/handleConvert/previewSource) 전부 무수정.
- 검증: typecheck ✅ / test 6/6 ✅ / build ✅ + **Playwright 실 Electron 시각 검증**
  (랜딩/이미지 로드/워터마크 전개/DICOM 팝오버 4장 — pdf-editor의 playwright-core 차용, 스크립트는 scratchpad 1회용).
- v1.0.6 → **v1.1.0** (사용자가 1.1.x 선언).

**현재 상태**: 새 UI 동작 확인 완료, 인스톨러 굽는 중. 커밋/푸시는 사용자가 직접.
**다음**: 사용자 설치 테스트 → 스크린샷 피드백. 기능 확장 후보(사용자 논의): 이미지 압축(품질 옵션) → 배경 제거 → DICOM 익명화.

---

## 2026-07-09 (세션 6) — 개인 사진 전면 제거, 중립 아이콘 교체 (v1.0.6)

사용자 지시: "인스톨러·실행기에서 내 사진 다 지우고 부드러운 아이콘으로 교체.
**앞으로 인스톨러/실행기에 내 사진 쓰지 말 것**" → 정책화 (ADR-0006, ADR-0004 supersede).

**한 일**
- `scripts/gen-branding-assets.js` 전면 재작성: 사진 원본 의존 제거. 코드로 그린 SVG
  (파란 그라데이션 라운드 사각형 + 문서 + 순환 화살표)를 `@resvg/resvg-js`로 렌더.
  ICO는 크기별(16~256) 개별 렌더 → 소형에서도 선명. 임시 의존성 `npm i --no-save @resvg/resvg-js png-to-ico jimp@0.22`
  (**jimp v1은 구 API 비호환** — 반드시 0.22).
- 재생성: `build/{icon.ico,icon.png,installerSidebar/Header,uninstallerSidebar}.bmp` — 인스톨러 화면은
  아이콘+서명+크레딧만(사진 없음). 새 자산 `assets/app-icon.png`(앱 헤더 로고).
- `App.tsx`: 헤더 로고 face→app-icon, 푸터 얼굴 아바타 제거(이름·서명·© 유지). `face.png` 삭제,
  `styles.css`에서 `.cred-face`·로고 원형 클립 제거. sign.png(서명 워터마크 기능)는 불변.
- 검증: typecheck ✅ / test ✅ / build ✅ → **v1.0.6 인스톨러 바탕화면 교체**.
- **git 운영 시작**: 사용자가 직접 커밋·푸시하기로 함(Claude는 요청 없이 커밋 안 함). `.gitignore`에
  `*.tsbuildinfo` 추가 + 기존 `tsconfig.web.tsbuildinfo` untrack(`git rm --cached`). "git 저장소 아님"
  전제의 문서들(CLAUDE.md·writing-guide·todo·ADR-0001·이 파일 헤더) 일괄 갱신 — **session-log SSOT는 유지**.

**현재 상태**: 앱·인스톨러 어디에도 얼굴 사진 없음. 사용자 설치·확인 대기. v1.0.6 커밋/푸시는 사용자가 진행 예정.

---

## 2026-07-08 (세션 5-b) — PDF 편집 기능 제거 (v1.0.5)

사용자 지시: "단순 파일 변환만 냅두고 pdf 수정 기능은 다 지워줘" (편집은 pdf-editor 프로젝트가 전담).

**한 일**
- 삭제: `annotate/model.ts`, `convert/annotate.ts`, `components/AnnotationLayer.tsx`, `guides/pdf-editing.md`
- `App.tsx`: 편집 모드 상태·EditorControls 툴바·handleSaveEdited 제거. 워터마크는 유지(사용자 요청).
- `Preview.tsx`: edit/onPageInfo props 제거 (순수 미리보기 + 워터마크 오버레이만).
- CLAUDE.md 코드 지도·문서 인덱스에서 편집 항목 정리.
- 검증: typecheck ✅ / test 6/6 ✅ → v1.0.5 인스톨러 바탕화면 교체.

**현재 상태**: 이 앱 = 변환기(+워터마크) 전용. PDF 편집 요청은 `~/pdf-editor` 에서.

---

## 2026-07-08 (세션 5) — 방향 전환: PDF 편집은 새 프로젝트 `~/pdf-editor` 로 분리

사용자 결정: pdfguru.com 을 벤치마킹한 **PDF 편집 전용 앱을 새 프로젝트로 신설**.
- 새 프로젝트: `/home/jace/pdf-editor` (Electron+React+MUI, 동일한 문서 하네스, 버전 1.x.x, v1.0.0 릴리스).
- 루트에 있던 pdfguru 벤치마크 스크린샷 26장은 `pdf-editor/docs/feedback-archive/2026-07-08-pdfguru-benchmark/` 로 이관.
- **이 프로젝트(file-converter)는 변환기로 유지** — PDF 편집 기능 확장 로드맵
  (`plans/2026-07-07-pdfguru-parity-and-fixes.md`)은 pdf-editor 로 승계되어 여기서는 중단.
- v1.0.4 까지 사용자 확인 완료.

---

## 2026-07-08 (세션 4-c) — 워터마크+페이지 넘김 크래시 수정 (v1.0.4)

출처: 사용자 대화 피드백("지금도 워터마크 체크한 상태로 다음 페이지 넘기면 pdf가 꺼진다" — v1.0.3에서도 재발).

**한 일**
- **원인**: `WatermarkOverlay` 캔버스 백킹이 **프레임 CSS 크기 × devicePixelRatio, 상한 없음** —
  확대 400% + 윈도우 배율 150%면 4320×5760px(≈100MB)이고, 페이지 넘김마다 프레임이 unmount/재mount되며
  이 캔버스를 통째로 재생성. 윈도우(GPU 캔버스)에서 메모리/GPU 폭증 → 렌더러 사망.
  리눅스 재현이 안 됐던 이유: dpr 1 + 140% 확대만 테스트(9MB 수준) + WSLg는 소프트웨어 렌더링.
  사용자의 "pdf가 꺼짐" = 크래시 후 자동복구(reload)로 파일 목록이 조용히 리셋된 것.
- **수정**:
  - `WatermarkOverlay.tsx`: 백킹 해상도 상한 `MAX_SIDE=2000px`(CSS로 늘려 표시, 시각 차이 없음),
    같은 크기면 재할당 생략(`setBox` dedupe), dpr transform 제거하고 캔버스 픽셀 공간에 직접 렌더.
  - `Preview.tsx`: 페이지 넘김 중 **이전 페이지를 유지**하고 `preview-loading-badge`만 표시 —
    프레임(img+워터마크 캔버스)을 매번 부수고 재생성하지 않음. 깜빡임도 제거.
  - `main/index.ts` + `preload` + `App.tsx`: 자동복구 후 `app:recovered` IPC → 화면에
    "자동 복구했습니다. 파일을 다시 추가해 주세요" 상태 표시(조용한 리셋 = 꺼짐으로 오해 방지).
- **검증(실 Electron, `--force-device-scale-factor=1.5` + 실파일 VPWinGate)**: 400% 확대 시 오버레이 캔버스
  1500×2000으로 상한 확인(수정 전이라면 4320×5760), 연타 15회 RSS 259→403MB 완만·크래시 없음·16/30 정상 표시.
- typecheck·test·build 통과. **1.0.4 인스톨러 바탕화면 반영**.

**현재 상태**: v1.0.4 배포. 워터마크+고배율+고DPI+연타 조합까지 실앱 검증 완료. 사용자 설치 테스트 대기.

**다음 세션에서**
- 사용자 피드백: v1.0.4에서 워터마크 켠 채 페이지 넘김 정상인지. 또 죽으면 "자동 복구" 안내가 떴는지 확인 요청
  (떴다 = 크래시 여전, 원인 더 추적 / 안 떴다 = 다른 문제).
- 정상 확인되면 `VPWinGate_Manual.pdf` → `docs/feedback-archive/` 이관.

---

## 2026-07-08 (세션 4-b) — 대용량 PDF 페이지 넘김 크래시 수정 (v1.0.3)

출처: 사용자 대화 피드백(v1.0.2 테스트: "30페이지 매뉴얼 PDF에서 다음 페이지 누르니 불러오다가 앱이 꺼짐").

**한 일**
- **재현**: Playwright로 노이즈 스캔 흉내 30페이지 PDF(129MB) 생성 → **실제 Electron 앱**(`_electron.launch`, WSLg)에
  업로드·확대·워터마크·페이지 넘김. 넘김 1회 ~1초, **"다음" 연타 시 렌더러 RSS 574MB → 1.4GB 폭증** 확인.
  램 여유 적은 윈도우에서 이 스파이크가 렌더러 OOM → 사용자가 본 "꺼짐"의 원인.
- **원인**: `Preview`가 페이지를 넘길 때마다 `pdfToImages()`로 **전체 바이트 복사(`bytes.slice()`) + 워커 재파싱**.
  연타하면 이전 작업이 취소되지 않고 겹겹이 쌓임.
- **수정**:
  - `convert/pdf.ts`: `openPdf()` 신설 — 문서를 한 번 열고 `renderPagePng(pageIndex, scale)`로 페이지만 렌더.
    미리보기 캔버스 긴 변 상한 `PREVIEW_MAX_SIDE=2600px`(스캔 PDF 캔버스 폭주 방지). 미사용이 된 `pdfPageCount` 삭제.
  - `Preview.tsx`: 문서 핸들을 ref로 보관(소스 바뀌면 destroy), 렌더 세대 번호(`renderGen`)로 연타 시 낡은 결과 폐기.
  - `main/index.ts`: `render-process-gone` → 창 자동 reload 안전망(10초 1회 제한). CDP `Page.crash` 강제 크래시로 복구 동작 확인.
- **수정 후 같은 시나리오**: 연타 스파이크 1.4GB → **0.9GB 이내**, 이후 0.78GB 안정. typecheck·test·build 통과.
- **1.0.3 인스톨러 바탕화면 반영**.
- **실파일 검증(사용자가 루트에 복사한 `VPWinGate_Manual.pdf`, 2MB·30p·PPT2007 산)**: 새 코드 기준
  헤드리스 + 실제 Electron 양쪽에서 전 30페이지 순회(페이지당 31~178ms) + 연타에도 RSS ~520MB 안정, 크래시 없음.
  파일 내부는 저해상도 이미지(수십 KB)뿐 — 거대 스캔이 아니라, v1.0.2 크래시는 페이지 넘김마다
  새 워커 + 전체 재파싱이 겹치던 구조적 문제(윈도우 메모리 압박)로 판단.
- **워크플로 메모**: 사용자는 스크린샷뿐 아니라 문제 파일(PDF 등)도 **프로젝트 루트에 복사**해 전달함 — 세션 시작 시 루트의 비프로젝트 파일 확인.

**현재 상태**: v1.0.3 배포. 사용자의 실제 매뉴얼 PDF로 전 페이지 검증 완료. 사용자 설치 테스트 대기.

**다음 세션에서**
- 사용자 피드백: 윈도우 설치본(v1.0.3)에서 vpwingate 매뉴얼 페이지 넘김 정상인지. 확인되면 `VPWinGate_Manual.pdf`를 `docs/feedback-archive/`로 이관해 루트 비우기.
- 그래도 죽으면: 윈도우 특이 요인(GPU/폰트) — 자동복구가 동작하는지(창이 다시 뜨는지)부터 확인.
- 변환(PDF→이미지) 경로도 같은 대용량 스캔에서 캔버스 폭주 가능 — 상한 필요한지 검토(현재는 미리보기만 상한).

---

## 2026-07-08 (세션 4) — 확대 폭주·워터마크 미리보기 근본 수정, Playwright 검증 도입 (v1.0.2)

출처: 사용자 대화 피드백("확대하면 말도 안 되게 커지고 축소 안 됨", "워터마크 미리보기 적용 안 됨" — v1.0.1 설치 테스트 결과).

**한 일**
- **Playwright로 실제 재현**(사용자 요청 "playwright 켜서 확인하고 테스트해"): scratchpad에 playwright 설치,
  `npm run dev`(vite :5173)에 headless chromium 접속 → 이미지 업로드 → 확대 클릭 → **폭 폭주 재현**
  (952px → 400ms마다 ×1.4, 2,400만px까지). 축소(100%)는 폭주 크기에서 고정점이라 안 줄어듦.
- **근본 원인**: `Preview`가 `frame 폭 = stageW×zoom`으로 키우면 `.main`의 `1fr` 그리드 컬럼(min-width:auto)이
  내용을 따라 넓어지고 → ResizeObserver가 커진 stageW를 재측정 → 다시 확대 → **무한 되먹임**.
  v1.0.1의 "콜백 ref 수정"은 측정 시점만 고쳤고 이 루프는 남아 있었음.
- **수정**(`styles.css`): `.main` `grid-template-columns: minmax(0,1fr) 340px` + `.left/.right { min-width:0 }`
  (컬럼이 내용 폭에 끌려가지 못하게) + `.preview-stage { scrollbar-gutter: stable }`(스크롤바로 인한 측정 흔들림 방지).
- **워터마크 미리보기 미표시도 같은 버그가 원인**: 오버레이 캔버스가 2,400만×3,000만px가 되어 메모리 초과로
  그리기 실패. 레이아웃 수정만으로 해결 — 코드(`WatermarkOverlay`)는 정상이었음.
- **수정 후 Playwright 재검증**: 140% 확대 = 937→1312px(정확 ×1.4, stage 고정), 축소 = 937 복귀,
  200%+바둑판 = 캔버스가 프레임과 1:1(1874px)·30만px 렌더, 40% 축소 = 375px. 스크린샷으로 대각선 워터마크 표시 확인.
- typecheck·test 통과, **1.0.2 인스톨러 바탕화면 반영**. 모델을 Fable 5로 전환(사용자 /model).

**현재 상태**: v1.0.2 배포. 확대/축소·워터마크 미리보기는 이번엔 실브라우저 자동 테스트로 검증됨. 사용자 설치 테스트 대기.

**다음 세션에서**
- 사용자 피드백: 확대/축소·워터마크가 설치본에서도 정상인지 (렌더러 로직은 동일하므로 정상일 것).
- v1.0.1 잔여 확인 항목: exe 아이콘·텍스트 도구.
- 검증 스크립트를 리포에 상설화할지 검토(`test/e2e/` + playwright devDependency — 현재는 scratchpad 1회용).
- pdfguru 로드맵 P1(도형·스탬프·이미지) 착수 여부.

---

## 2026-07-07 (세션 3-e) — 버그수정 · 워터마크 개선 · UI 리프레시 · pdfguru 로드맵 (v1.0.1)

출처: 사용자 스크린샷 23장(설치/앱 버그 4 + pdfguru 편집기 19) + 대화. (계획 `plans/2026-07-07-pdfguru-parity-and-fixes.md`)

**한 일**
- 버그: 미리보기 확대/축소 먹통(콜백 ref로 stageW 측정), 텍스트 도구(가드제거+focus+user-select), 크기 `×` 정렬,
  설치 헤더 글씨 겹침(한 줄), exe 아이콘(png-to-ico로 rcedit 호환 ICO), 헤더 이모지→얼굴 로고.
- 워터마크: 바둑판 간격 슬라이더(`gapPct`), **미리보기에 실시간 표시**(`WatermarkOverlay`).
- UI: CSS 디자인 리프레시(그림자/그라데이션 버튼/hover/라운드/focus ring). 프레임워크 도입은 보류.
- **pdfguru 전체 편집기는 로드맵으로 문서화**(plan B: 도형·스탬프·이미지·서명배치·페이지관리·자르기·주석·링크·인쇄·검색·텍스트편집). 단계 구현 예정.
- typecheck·test·build 통과. **1.0.1 인스톨러 바탕화면 반영**. 스크린샷 23장 `docs/feedback-archive/`로 이관.

**현재 상태**: v1.0.1 배포. 앱 GUI 미검증(빌드/타입만). 사용자 설치 테스트 대기.

**다음 세션에서**
- exe 아이콘이 여전히 Electron이면 → **Windows 아이콘 캐시** 문제일 가능성(안내: `ie4uinit.exe -show` 또는 재부팅). 그래도 안 되면 rcedit 로그 확인.
- 텍스트 도구/확대 실제 동작 확인. 이상 시 재수정.
- pdfguru 로드맵 P1(도형·스탬프·이미지)부터 착수 여부 사용자 확인.
- UI 프레임워크(Tailwind 등) 도입할지 결정.

---

## 2026-07-07 (세션 3-d) — 설치 브랜딩 · 앱 아이콘 · 사이드바 스크롤 · 워터마크 (v1.0.0)

출처: 사용자 스크린샷(`152314/152606`) + 대화.

**한 일** (결정 ADR-0005, 가이드 `guides/watermark.md`)
- **버전 정책 변경**: `0.n.0` → `MAJOR.MINOR.PATCH`, 기본 PATCH 증가. 이번에 **0.3.0 → 1.0.0** 정식화.
- **앱/실행 파일 아이콘**: 원인은 `win.signAndEditExecutable:false`(rcedit 차단). 제거 → exe에 얼굴 아이콘 박힘.
  추가로 `BrowserWindow({icon})` + `extraResources`(icon.png → resources)로 창/작업표시줄 아이콘도 얼굴.
- **설치 화면 브랜딩**: `build/{installerSidebar,uninstallerSidebar,installerHeader}.bmp`(24-bit bottom-up 직접 인코딩)
  + `license.txt`(개인 저작권, CM병원 언급 없음). NSIS가 자동 노출. 얼굴+서명+저작권.
- **오른쪽 사이드바 스크롤**: `.right overflow-y:auto`, 패널 자연높이, 파일목록 max-height. 기능 늘어도 스크롤.
- **워터마크**: 텍스트/서명, 대각선·바둑판·모서리, 색·진하기·크기·기울기. 변환 출력에만 합성(DICOM 제외).
  신규 `watermark/model.ts`, 변환 계층 3경로에 주입(`convert/{image,pdf,index}.ts`).
- 자산 생성 스크립트 확장(`scripts/gen-branding-assets.js`: BMP·license 포함). typecheck·test·build 통과.
- **1.0.0 인스톨러 바탕화면 반영**(rcedit 에러 없음): `/mnt/c/Users/user/Desktop/파일변환기-Setup-1.0.0.exe`.

**현재 상태**: v1.0.0 배포. 앱 GUI/설치화면은 빌드만 통과(미실행 검증) — 사용자 설치 테스트로 확인.

**다음 세션에서**
- 루트 새 스크린샷 → 아이콘/설치화면/워터마크/사이드바 피드백 반영
- 확인 요청: exe 아이콘이 실제로 바뀌었는지, 설치 마법사에 사이드바/라이선스 뜨는지

---

## 2026-07-07 (세션 3-c) — 미리보기 확대/스크롤 · 지우개 · 얼굴 브랜딩/아이콘 (v0.3.0)

출처: 사용자 스크린샷(`스크린샷 2026-07-07 152314/152606.png`) + 대화.

**한 일**
- **미리보기 확대/축소 + 세로 스크롤**: 긴 PDF 아래쪽 편집 가능. `Preview`에 `zoom`·`stageW`·툴바(±/맞춤),
  스테이지 `overflow:auto`. PDF 프리뷰 렌더 scale 1.5→2(선명도).
- **지우개**: 굵기만 조절, `destination-out`으로 주석만 지움(원본 불변). `annotate/model.ts`.
- **제작자 브랜딩**: 앱 하단 푸터에 얼굴 아바타 + "제작 · 이성현 · © 2026" + 서명(`src/renderer/src/assets/`).
- **얼굴 원형 아이콘(누끼)**: 반명함 배경을 테두리 flood fill로 제거(흰 깃 보존) → 파란 원형 디스크 합성 →
  `build/icon.{ico,png}`. 생성 스크립트 `scripts/gen-branding-assets.js`(jimp) 리포에 보존. 결정 ADR-0004.
- 버전 **0.2.0 → 0.3.0**(기능 추가). typecheck·build 통과. **0.3.0 인스톨러 바탕화면 반영**(옛 버전 제거).

**현재 상태**: v0.3.0 배포. 앱 GUI는 미검증(빌드/타입만 통과) — 사용자 설치 테스트로 확인 예정.

**다음 세션에서**
- 루트 새 스크린샷 → 확대/지우개/아이콘/브랜딩 피드백 반영
- 후보: 편집 텍스트 재선택/이동, 형광펜 진짜 multiply(todo P3)

---

## 2026-07-07 (세션 3-b) — PDF 편집(스튜디오) + 파일 순서변경 (v0.2.0)

**한 일** (계획 `plans/2026-07-07-pdf-studio.md`, 결정 ADR-0003, 가이드 `guides/pdf-editing.md`)
- **파일 순서 변경**: FileCard에 ▲▼ + 순번. `App.moveFile`.
- **PDF 편집 모드**: 사인펜/네임펜/형광펜(색·굵기·진하기) + 텍스트 입력. 페이지별 독립 저장.
  - 신규 `annotate/model.ts`(정규화 좌표·`drawAnnotations`), `components/AnnotationLayer.tsx`(오버레이),
    `convert/annotate.ts`(`burnAnnotations`=페이지별 PNG 합성).
  - `Preview`에 편집 통합 + `onPageInfo`. App이 `annos` Map + 페이지별 언두 스택 소유. 편집 출력은 항상 PDF.
- **버전 정책 수립**(CLAUDE.md): patch/minor/major. 이번은 기능추가 → **0.1.0 → 0.2.0**.
- typecheck·test(6/6)·build 통과. **0.2.0 인스톨러 굽고 바탕화면 반영**(옛 0.1.0 제거):
  `/mnt/c/Users/user/Desktop/파일변환기-Setup-0.2.0.exe`.

**현재 상태**: v0.2.0 배포됨. 사용자 설치 테스트 대기.

**다음 세션에서**
- 루트 새 스크린샷 확인 → 순서변경·편집 UX 피드백 반영
- 후보: 편집 텍스트 재선택/이동, 형광펜 진짜 multiply, 미리보기 리사이즈 반영(todo P3)

---

## 2026-07-07 (세션 3) — 문서 표준 이식 (하네스 엔지니어링)

**한 일**
- 자매 프로젝트 `cm_groupware`·`pt_schedule`의 문서 규약을 파악해 이식(ADR-0001):
  - `docs/writing-guide.md` 신설 — 문서 지배 규칙(SSOT, frontmatter, 코드 1:1 대조 등)
  - `adr/0000-template.md`, `adr/0001-harness-engineering.md` 추가, 기존 미리보기 ADR을 표준형 `0002-preview-and-options.md`로 이관
  - `todo.md`(P1~P4)·`session-log.md`·`changelog.md` 소문자 kebab + frontmatter로 재정비
  - `guides/conversion.md` 신설 — 현재 변환 능력·코드 위치
  - `CLAUDE.md`에 문서 인덱스 + writing-guide 링크 반영
- **핵심 적응**: file-converter는 git 저장소가 아니라 완료 이력을 이 `session-log.md`가 담당(cm_groupware의 git history 역할).

**현재 상태**: 문서 구조가 자매 프로젝트 표준과 정합. 코드 변경 없음(문서만). 인스톨러 재빌드 불필요.

**다음 세션에서**
- 루트 새 스크린샷 확인 → UI 개편 피드백 반영
- `todo.md` P3(미리보기 리사이즈 반영, 버전 관리, PDF 문서정리 UI) 중 사용자 우선순위 따라 착수

---

## 2026-07-07 (세션 2) — UI 개편 + 인스톨러 자동화

**한 일**
- UI 3종 개편(계획 `plans/2026-07-07-ui-revamp.md`, 결정 ADR-0002):
  1. 레이아웃 스왑 — 왼쪽 드롭존+미리보기(큰 영역), 오른쪽 파일목록+변환옵션
  2. 이미지 대상 변환 시 가로×세로 리사이즈 옵션 (`convert/image.ts` `targetSize`, `App.tsx`)
  3. 다중 페이지 미리보기 — 여러 이미지→PDF·PDF파일 페이지 넘김 (신규 `components/Preview.tsx`)
- 문서 체계 1차 구축(CLAUDE.md 부팅 프로토콜 + 변경 후 자동 규칙: typecheck·test·build → 인스톨러 굽기)
- typecheck·test(6/6)·build 통과. **인스톨러 굽고 바탕화면 복사**: `/mnt/c/Users/user/Desktop/파일변환기-Setup-0.1.0.exe`

**현재 상태**: 코드·문서 정합, 인스톨러 배포됨. 사용자 설치 테스트 대기.

---

## 2026-07-07 (세션 1) — 초기 빌드
- 앱 최초 구현, jpg→pdf 변환 사용자 테스트 성공. 첫 인스톨러 0.1.0 배포.
