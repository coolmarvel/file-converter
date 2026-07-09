---
title: 세션 진행 로그
created: 2026-07-07
updated: 2026-07-09
---

# 세션 진행 로그

> **이 파일이 "무슨 일이 언제 있었나"의 SSOT다** (2026-07-09 git 도입 후에도 유지 — git log는 보조, writing-guide 참고).
> 새 세션은 이 파일부터 읽는다. 세션마다 최상단에 블록을 추가한다. 형식: 날짜 / 한 일 / 현재 상태 / 다음.

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
