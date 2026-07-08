---
title: 계획 pdfguru 벤치마킹 · 버그수정 · UI 개선
created: 2026-07-07
updated: 2026-07-07
domain: ui
---

# 계획: pdfguru 벤치마킹 + 버그수정 + UI 개선 (2026-07-07, 세션 3-e)

출처: 사용자 스크린샷 23장(설치/앱 버그 4장 + pdfguru 편집기 19장) + 대화.

## A. 이번 턴에 반영 (v1.0.1)

### 버그 수정 (v1.0.1 완료)
- [x] **미리보기 확대/축소 먹통**: stageW 측정을 콜백 ref로 이동(`Preview.setStage`) → 스테이지 뒤늦게 마운트돼도 측정.
- [x] **텍스트 도구**: `box.w===0` 가드 제거, 좌표 `getBoundingClientRect` 실시간, 강제 focus, `user-select:text`.
- [x] **`×` 정렬**: `.size-x` align-self flex-end + 고정 높이.
- [x] **설치 헤더 겹침**: header BMP 한 줄("File Converter", FONT_SANS_10)로.
- [x] **exe 아이콘**: png-to-ico로 rcedit 호환 ICO 재생성. (안 바뀌면 Windows 아이콘 캐시 문제 — 사용자 안내)
- [x] **헤더 로고**: 📁 이모지 → 얼굴 로고(`brand-logo`).

### 워터마크 (v1.0.1 완료)
- [x] **바둑판 간격**: `gapPct` 필드 + 간격 슬라이더. 기본 45%.
- [x] **미리보기 실시간 표시**: `WatermarkOverlay`(비대화형 캔버스, z-1) — 배치/색/크기 변경이 바로 보임.

### UI 개선 (v1.0.1 완료)
- [x] CSS 디자인 리프레시: 디자인 토큰(그림자/그라데이션), 버튼/타깃/툴버튼 hover·라운드, 패널 그림자, 입력 focus ring, 드롭존.
  (프레임워크 도입은 용량↑라 보류 — 아래 C 참고.)

### 모듈화
- [x] 계층 확인: core/convert/annotate/watermark/components 이미 분리·재사용 가능. 공격적 리팩터는 위험 대비 이득 적어 보류.

## B. 로드맵 — pdfguru 편집기 전체 (다음 세션들, 단계적)

pdfguru = 완전한 PDF 편집기. 기존 주석 인프라(`annotate/`, burn-to-PDF)를 확장해 단계 구현.

| 단계 | 기능 | 난이도 | 기존 재사용 |
|---|---|---|---|
| P1 | 도형: 사각형·타원·선·화살표 (색/굵기/채움) | 중 | 주석 stroke 모델 확장 |
| P1 | 스탬프: 십자(X)·체크(✓)·날짜/텍스트 스탬프 | 중 | 주석에 shape/text 추가 |
| P1 | 이미지 삽입(도장/로고) | 중 | canvas composite |
| P2 | 서명 배치(그리기/이미지/타자 → 페이지에 배치) | 중 | 이미지 삽입 + 서명 자산 |
| P2 | 페이지 관리: 회전·삭제·순서변경·추가(빈/이미지) | 중 | `convert/pdf.ts`에 rotate/delete/reorder 이미 있음 |
| P2 | 문서 자르기(현재/전체 페이지) | 중 | pdf-lib cropBox |
| P3 | 주석: 메모(sticky)·아이콘 스탬프 팔레트 | 중 | |
| P3 | 링크 추가 | 중 | pdf-lib annotations |
| P3 | 인쇄 / 검색 | 중~상 | 검색=텍스트 레이어 |
| P4 | **텍스트 편집(기존 PDF 글자 수정)** | 상(매우 어려움) | 텍스트 추출+재배치 필요, 후순위 |

편집 요소는 공통 모델(`EditItem` 유니온: stroke/text/shape/stamp/image)로 통일 → 페이지별 저장 →
저장 시 pdf-lib로 굽기(벡터 도형은 drawSvgPath/drawRectangle, 텍스트/이미지는 래스터 or 벡터).

## C. UI 프레임워크 (사용자 "템플릿" 요구) — 결정 필요
- 옵션1: 현행 CSS를 디자인 시스템으로 다듬기(경량, 용량 유지) ← 이번 턴 채택
- 옵션2: Tailwind 도입(경량, 유틸리티) — 빌드만 커지고 런타임 영향 적음
- 옵션3: 컴포넌트 라이브러리(MUI/Mantine) — 예쁨↑ 용량↑ (사용자 "크기 줄여줘"와 상충)
→ 사용자와 상의 후 옵션2 검토.
