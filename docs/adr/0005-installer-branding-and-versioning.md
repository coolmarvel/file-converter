---
title: ADR-0005 설치 화면 브랜딩 · 앱 아이콘 · 버전 정책
created: 2026-07-07
status: accepted
---

# ADR-0005: 설치 화면 브랜딩 · 앱 아이콘 · 버전 정책

## 상태

Accepted

## 맥락

사용자 요구(세션 3-d):
1. 설치할 때 work-report-analyzer처럼 **얼굴·서명·저작권**이 노출되게(단, CM병원 언급 없이 **개인 저작물**로).
2. 설치된 **실행 파일/앱 창 아이콘이 여전히 Electron 기본**이라 얼굴로 바꿔야 함.
3. 버전을 `0.n.0`이 아니라 `1.0.x`처럼 **메이저를 두고 뒤 숫자를 매 수정마다 증가**.

## 결정

### 설치 화면 브랜딩 (NSIS 자동 규약)
electron-builder NSIS는 `build/`의 특정 파일을 자동 사용한다:
- `installerSidebar.bmp`(164×314, **24-bit bottom-up**) — 마법사 좌측 큰 이미지: 얼굴+서명+저작권.
- `uninstallerSidebar.bmp`, `installerHeader.bmp`(150×57) — 헤더.
- `license.txt` — 라이선스 동의 페이지(개인 저작권 전문, `nsis.license`로도 명시).
- `nsis.installerIcon/uninstallerIcon/installerHeaderIcon = build/icon.ico`.
BMP는 jimp가 top-down(음수 높이)로 써서 NSIS에서 뒤집힐 수 있어 **직접 24-bit bottom-up 인코더**로 생성
(`scripts/gen-branding-assets.js`).

### 앱/실행 파일 아이콘
- **핵심 원인**: `win.signAndEditExecutable: false` 가 rcedit의 exe 리소스 편집을 막아 exe 아이콘이
  Electron 기본으로 남았다. → **이 옵션 제거**(기본 true)하여 `build/icon.ico`가 exe에 박히게 함.
- 실행 중 창/작업표시줄 아이콘은 `BrowserWindow({ icon })`로도 지정. 패키지 앱에서 접근하도록
  `extraResources`로 `build/icon.png → resources/icon.png` 복사 후
  `app.isPackaged ? process.resourcesPath/icon.png : build/icon.png` 참조.

### 버전 정책
`MAJOR.MINOR.PATCH`. **기본은 PATCH를 매 변경마다 +1**(1.0.0→1.0.1…). 큰 묶음은 MINOR, 대규모는 MAJOR.
CLAUDE.md "버전 정책"이 SSOT.

## 근거

- 설치 브랜딩은 자매 프로젝트에서 검증된 NSIS 자동 규약을 그대로 이식(파일명만 두면 됨).
- exe 아이콘 문제의 진짜 원인이 `signAndEditExecutable:false`였음 — BrowserWindow.icon만으론 exe 파일
  아이콘이 안 바뀐다. 둘 다 처리.
- BMP는 NSIS 호환(24-bit, bottom-up) 보장을 위해 직접 인코딩.

## 결과

- `build/{icon.ico,icon.png,installerSidebar.bmp,uninstallerSidebar.bmp,installerHeader.bmp,license.txt}` 생성.
- `package.json`: version 1.0.0, extraResources, nsis 아이콘/라이선스, signAndEditExecutable 제거.
- `src/main/index.ts`: BrowserWindow icon.
- 한계: rcedit는 Wine에서 동작 확인(빌드 성공). Wine 미탑재 환경에선 exe 아이콘 편집 실패 가능 → 그땐 재검토.
