---
title: 배포 패키징 가이드
created: 2026-07-13
updated: 2026-07-13
domain: packaging
---

# 배포 패키징 가이드

## 개요

Windows/macOS 설치 파일을 만드는 규칙의 SSOT. 자매 프로젝트 `~/pdf-editor`의
`docs/guides/packaging.md`(2026-07-10)를 이 프로젝트에 맞게 이식했다.
**macOS 빌드는 아직 미실행** — 현재 Windows(WSL) 환경이라 빌드 불가, 맥에서 작업할 때 이 문서대로 진행한다.

## 공통 규칙

- 릴리스 전 검증: `npm run typecheck && npm test && npm run build` (+ Playwright 검증 스크립트).
- 릴리스급 변경은 version·session-log·todo·changelog를 같은 턴에 갱신.
- MINOR 승격은 사용자 선언이 있을 때만. 일반 수정은 PATCH.
- `release/`는 git에 올리지 않는다(설치 파일 대용량). 공개 배포가 필요하면 GitHub Release 자산으로.
- **v1.3.0부터 AI 배경 제거 모델(354MB)이 extraResources(`bgrm-data`)로 번들** — 어떤 OS든 설치 파일이
  ~380MB+. 맥 dmg도 동일하게 커진다.

## 배포 소스 보호 (난독화) — v1.3.2~

`npm run build` = `electron-vite build` + `node scripts/obfuscate.cjs`. 모든 `pack:*`/`dist:*`가
이 `build`를 경유하므로 어떤 인스톨러든 자동 적용된다. 규칙의 원본은
`~/project-seed/guides/desktop-packaging.md` §배포 소스 보호, 스크립트 원본은 `~/pdf-editor/scripts/obfuscate.cjs`.

- **⚠ V8 바이트코드(electron-vite `bytecodePlugin`)는 금지** — 컴파일 플랫폼 종속이라 WSL 빌드 →
  Windows 실행 시 `cachedDataRejected` 즉사 (pdf-editor v1.4.2 사고).
- **보수 설정**: `controlFlowFlattening`/`deadCodeInjection`/`selfDefending`/`debugProtection` OFF,
  식별자 hex화 + 문자열 배열(threshold 0.6, rotate/shuffle)만 ON.
- **대형 공개 라이브러리 청크 제외** (보호 가치 없음 + 성능·동작 위험): `pdf.worker`, `pdf-*`(pdf.js·pdf-lib),
  `decode-*`(heic2any·utif2), `bgremove-*`(imgly·onnxruntime — eval/wasm이라 난독화 시 깨질 수 있음),
  `imagetracer*`. 우리 코드는 `index-*`(엔트리+공유 청크)·`pdftools-*`·main·preload에 있고 이들만 난독화.
- 청크 이름이 바뀌면(코드 분할 변경 시) `scripts/obfuscate.cjs`의 `SKIP` 정규식을 함께 손본다.

## Windows (현재 사용 중)

- 명령: `npm run dist:win` (WSL에서 Wine 필요. Wine 없이 확인은 `npm run pack:win`)
- 산출물: `release/파일변환기-Setup-<version>.exe`
- 설정: `package.json`의 `build.win`/`build.nsis`. App ID: `xyz.chungmu.fileconverter`
- 구운 뒤 사용자 데스크톱(`/mnt/c/Users/user/Desktop`)에 복사하고 옛 버전 exe는 지운다 (CLAUDE.md 자동 규칙).

## macOS (준비 문서 — 맥에서 첫 빌드 시 검증할 것)

pdf-editor에서 확립된 규칙. 아키텍처 2종을 각각 굽는다:

- 명령 (pdf-editor 기준 — 이 프로젝트에는 아직 `dist:mac:arm64/x64` 스크립트와 `scripts/dist-mac.cjs`가 없음.
  맥에서 작업할 때 pdf-editor의 `scripts/dist-mac.cjs`를 이식해 추가한다):
  - `npm run dist:mac` — 현재 맥 CPU 기준 기본값
  - `npm run dist:mac:arm64` — Apple Silicon(M1~M4)용
  - `npm run dist:mac:x64` — Intel Mac용 (**`x64` = `x86_64` = `amd64`** — 별도 amd64 파일명을 만들지 않고
    Electron Builder 표준 명칭 `x64`로 통일)
- 산출물: `release/파일변환기-<version>-arm64.dmg` / `release/파일변환기-<version>-x64.dmg`

### ⚠️ 한글 내부 이름 크래시 (pdf-editor 2026-07-09 사고 — 반드시 준수)

macOS 번들의 **내부 이름은 반드시 ASCII**로 유지한다. pdf-editor에서 내부 제품명/실행 파일명/Helper
이름까지 한글로 만들자 시작 즉시 `EXC_BREAKPOINT(SIGTRAP)` / `CrBrowserMain` V8 스택 크래시 발생.
내부 이름을 ASCII로 통일하니 정상. **외부 `.app` 폴더명만 한글인 것은 안전.**

이 프로젝트는 `productName`이 한글 `파일 변환기`이므로 맥 빌드 시 아래처럼 분리해야 한다:

- `CFBundleName` / `CFBundleExecutable` / Helper 이름: `FileConverter` (ASCII)
- `CFBundleDisplayName`(Finder 표시): `파일 변환기`
- 외부 `.app` 폴더명: `파일 변환기.app`

### 서명

Developer ID 인증서가 없으므로 pdf-editor 방식대로 DMG 생성 전 ad-hoc `codesign --sign -`으로
내부 프레임워크 서명을 정리한다(`dist-mac.cjs`가 수행). 정식 배포 전에는 `Developer ID Application`
인증서 + notarization 필요.

### 이 프로젝트 고유 확인 사항 (맥 첫 빌드 때)

- [ ] `bgrm-data`(354MB) extraResources가 dmg에 포함되고 `process.resourcesPath/bgrm-data`에서 읽히는지
- [ ] `bgrm://` 커스텀 프로토콜 + AI 배경 제거가 macOS에서 동작하는지
- [ ] Wine 전용 가정이 없는지 (installerSidebar.bmp 등은 win 전용이라 무관)
- [ ] 한글 내부명 이슈: `scripts/dist-mac.cjs` 이식 + `FileConverter` ASCII 내부명 적용

## GitHub Release 업로드 (필요 시)

pdf-editor의 `scripts/upload-release-win.sh` / `upload-release-mac.sh` 패턴을 따른다
(같은 태그 릴리스가 있으면 자산만 추가, 자산 이름은 ASCII). 이 프로젝트는 아직 공개 배포 계획이
없어 스크립트 미이식 — 필요해지면 pdf-editor 것을 복사해 이름만 바꾼다.

## 관련 코드

- `package.json`: npm scripts, electron-builder 설정(win/nsis/mac/linux, extraResources)
- `build/`: 아이콘·인스톨러 브랜딩 (ADR-0005·0006)
- 참조 원본: `~/pdf-editor/docs/guides/packaging.md`, `~/pdf-editor/scripts/dist-mac.cjs`
