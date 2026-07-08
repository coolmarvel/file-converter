# CLAUDE.md — 파일 변환기 작업 가이드

이 파일은 **세션이 바뀌어도 맥락을 즉시 복구**하기 위한 진입점이다. Claude Code는 세션 시작 시
이 파일을 자동으로 읽는다. 아래 "부팅 프로토콜"이 나머지 상태 파일까지 로드하도록 지시한다.

## 🟢 세션 시작 부팅 프로토콜 (매 세션 첫 작업 전에 반드시 수행)

새 세션에서 이 프로젝트 작업을 시작하면, **코드를 건드리기 전에** 순서대로:

1. `docs/session-log.md` 읽기 — 마지막으로 무엇을 했고 지금 어디쯤인지 (**진행 이력 SSOT**, git history 대용)
2. `docs/todo.md` 읽기 — 남은 일 (P1~P4)
3. 최근 `docs/plans/*.md` 1개 읽기 — 진행 중 기능의 설계 의도
4. **프로젝트 루트에 `스크린샷 *.png` 가 있는지 확인** — 있으면 그것이 사용자의 **새(미처리) 피드백**이다.
   Read 로 보고 요구사항으로 해석한다. (사용자는 스크린샷을 루트에 복사해 전달) 반영을 끝내면 그 png를
   `docs/feedback-archive/` 로 옮겨 루트를 비운다 → 루트의 png = 항상 "아직 안 본 새 피드백"이 되도록 유지.

이 4단계를 끝내면 이전 세션의 맥락을 완전히 복구한 상태가 된다. 그 다음 작업을 시작한다.

## 🔴 변경 후 자동 규칙 (사용자가 매번 요청하지 않아도 수행)

1. 코드를 바꾸면 **같은 턴에** `docs/session-log.md`(최상단 블록 추가)·`docs/todo.md`(+릴리스급이면 `changelog.md`)를 갱신한다. 문서 작성 규칙은 `docs/writing-guide.md`.
2. `npm run typecheck && npm test && npm run build` 로 깨지지 않았는지 확인한다.
3. **버전을 판단해 올린다**(아래 "버전 정책"). `package.json`의 `version` 수정.
4. **인스톨러를 바로 굽고 바탕화면에 반영**(사용자 지시: "앞으로 인스톨러로 바로 구워"):
   ```bash
   npm run dist:win
   V=$(node -p "require('./package.json').version")
   rm -f /mnt/c/Users/user/Desktop/파일변환기-Setup-*.exe   # 옛 버전 정리
   cp "release/파일변환기-Setup-$V.exe" "/mnt/c/Users/user/Desktop/"
   ```
   (WSL에 wine 있음. 데스크톱 = `/mnt/c/Users/user/Desktop`. 파일명은 version을 따라감. 옛 버전 exe는 데스크톱에서 지워 혼동 방지.)
5. 사용자에게 "vX.Y.Z 인스톨러를 바탕화면에 구웠으니 설치·테스트 후 스크린샷 달라"고 알린다.

## 버전 정책 (semver `MAJOR.MINOR.PATCH`, 매 변경마다 올림)

사용자 요청: `1.0.13`처럼 앞에 메이저(1)를 두고 **뒤 숫자(PATCH)를 매 수정마다 증가**시킨다.

- **PATCH**(1.0.**X**) — **기본값**. 수정/기능 하나 반영할 때마다 +1 (1.0.0 → 1.0.1 → 1.0.2 …).
- **MINOR**(1.**X**.0) — 큰 기능 묶음을 한 번에 낼 때(판단). PATCH는 0으로.
- **MAJOR**(**X**.0.0) — 대규모 재설계/호환 깨짐. 사용자와 상의.
- 현재: **1.0.4** (사용자 확인 완료).
- ~~pdfguru 편집기 전체 구현 로드맵~~ → **2026-07-08 새 프로젝트 `/home/jace/pdf-editor` 로 분리·승계**
  (session-log 세션 5 참조). 이 프로젝트는 변환기로 유지, PDF 편집 요청은 pdf-editor에서 작업.
- 매번 `package.json` version 올리고 → 인스톨러 파일명·changelog·session-log에 반영.

## 이 프로젝트가 뭔가

PDF·이미지·DICOM을 **오프라인에서** 상호 변환하는 Electron 데스크톱 앱.
사용자(이성현)가 직접 인스톨러로 설치해서 테스트한다. 상세 스택/구조는 `README.md` 참고.

## 개발자(사용자)와의 작업 방식 — 중요

- 사용자는 **스크린샷을 프로젝트 최상단(루트)에 복사**해서 요구사항/수정사항을 전달한다.
  새 세션에서 루트에 `스크린샷 *.png` 가 있으면 그것을 읽고 피드백으로 해석한다.
- 작업 후 사용자가 요청하면 **인스톨러를 바탕화면에 구워준다**(아래 "빌드" 참고).
  사용자는 그 인스톨러로 직접 설치·실행해서 테스트하고 다시 스크린샷으로 피드백을 준다.
- 그래서 **모든 진행 사항은 `docs/` 에 파일로 기록**한다. 세션이 끊겨도 이어서 작업할 수 있게.

## 문서 인덱스 (docs/)

문서 규약은 자매 프로젝트 `cm_groupware`·`pt_schedule` 표준을 이식한 것(ADR-0001). 작성 전 `writing-guide.md`를 따른다.

| 파일 | 용도 |
|---|---|
| `docs/writing-guide.md` | **문서 지배 규칙** (SSOT·frontmatter·코드 1:1 대조). 문서 쓰기 전 필독 |
| `docs/session-log.md` | 세션별 진행 이력. **"언제 무슨 일" SSOT** (git history 대용, 최신이 위) |
| `docs/todo.md` | 미해결·향후 작업만 (P1~P4). 완료분은 session-log로 |
| `docs/changelog.md` | 인스톨러 릴리스 단위 사람용 요약 |
| `docs/adr/*.md` | 구조적 결정 기록 (`0000-template.md` 형식). 왜 이렇게 했는가 |
| `docs/plans/*.md` | 기능 단위 구현 계획 (`YYYY-MM-DD-*`) |
| `docs/guides/*.md` | 기능별 현재 동작·코드 위치 (`conversion.md`, `watermark.md`) |

**주의**: 이 프로젝트는 git 저장소가 아니다 → 완료 이력의 SSOT는 `session-log.md`. 코드/문서 변경 시 여기 갱신을 빠뜨리지 말 것.

## 자주 쓰는 명령

```bash
npm run dev          # 개발 모드 (HMR)
npm run typecheck    # 타입 검사 (node + web)
npm test             # core 순수 로직 테스트

# 인스톨러 굽기 (WSL에서 윈도우 NSIS 설치기 = Wine 필요)
npm run dist:win     # → release/파일변환기-Setup-<version>.exe
# Wine 없이 확인: npm run pack:win → release/win-unpacked/ 폴더
```

## 코드 지도 (수정 시 어디를 보나)

- 화면 상태·흐름: `src/renderer/src/App.tsx` (편집 툴바 `EditorControls` 포함)
- UI 조각: `src/renderer/src/components/` (DropZone, FileCard=순서변경, DicomForm, Preview, WatermarkOverlay)
- 실제 변환 구현(canvas/pdf.js): `src/renderer/src/convert/` (image, pdf, dicom, index=디스패처)
- ~~PDF 주석 편집~~ → v1.0.5에서 제거, `~/pdf-editor` 프로젝트로 이관
- 워터마크 모델·렌더: `src/renderer/src/watermark/model.ts` (guides/watermark.md). 변환 계층 3경로에 주입.
- 설치 브랜딩/아이콘: `build/{icon.ico,icon.png,installerSidebar.bmp,installerHeader.bmp,uninstallerSidebar.bmp,license.txt}` + `package.json`(nsis, extraResources) + `src/main/index.ts`(BrowserWindow icon). 결정 ADR-0005.
- 변환 가능 경로 레지스트리(순수 TS): `src/core/conversions.ts`
- 형식 감지(매직 바이트): `src/core/fileTypes.ts`
- 제작자 브랜딩 자산: `src/renderer/src/assets/{face.png,sign.png}`, 앱 아이콘: `build/icon.{ico,png}`.
  재생성 스크립트 `scripts/gen-branding-assets.js`(jimp 임시설치, 원본 = `C:\Users\user\Desktop\이성현`). 결정 ADR-0004.

**새 변환 추가** = `core/conversions.ts`의 `targetsFor` + `convert/index.ts` 디스패처, 두 곳만.
