---
title: 클래식 UI 전환 + Compositor 기능 이식
created: 2026-09-21
updated: 2026-09-21
domain: development
status: done
---

# 클래식 UI 전환 + Compositor 기능 이식 (v1.4.0)

사용자 지시(2026-09-21): ① `~/Compositor`(MIT, Swift/macOS 포토샵 대체 에디터)를 학습해 우리 변환기에
녹여낼 것 ② UI/UX를 `sh-messenger`·`remote-assist` 계열의 **클래식**으로 바꿀 것.

## 결정 (사용자 선택)

| 항목 | 선택 |
|---|---|
| 밀도 | **완전 동일(12px)** — 본문 12px 돋움, 컨트롤 24px, 행 22px, 툴바 30px, 타이틀바 28px |
| 구현 | **토큰 SSOT + MUI 재스킨** — MUI 부품은 유지, 겉모습만 100% 클래식 (E2E 24종 보호) |
| 창 크롬 | **앱이 그리는 타이틀바 + 메뉴 바 + 하단 상태 줄** (전부 클래식) |
| Compositor 이식 | 이미지 크기 대화상자·고품질 축소·JPEG 내보내기 미리보기·보정 도구·안전 한도·자르기 강화 (전부) |

## 디자인 계약

형태 언어는 `~/remote-assist/DESIGN.md`·`~/sh-messenger/DESIGN.md`와 같은 계열:
**Upbit 베이스(각지고 촘촘) + Money Forward 베벨 버튼(흰→회색 세로 그라데이션) + Palantir 데스크톱 밀도**.
반경 0, 1px 테두리, 그림자는 팝오버·대화상자만(2px 2px 4px), 포커스는 안쪽 1px 점선.
색 팔레트는 우리 브랜드 파랑(#3b74f2)을 accent 로 유지. 미리보기 스테이지만 어두운 면(#1e2025) —
PACS 뷰어·Compositor 처럼 이미지는 어두운 바탕에서 본다.

토큰 SSOT = `src/renderer/src/styles/tokens.ts`. 시작 시 `:root` CSS 변수로 주입하고
`base.css`는 var() 만, `theme.ts`(MUI)는 같은 객체를 읽는다 — 값이 한 곳에만 있다.

## 화면 골격

```
[타이틀바 28]  ▣ 파일 변환기                                  ─ □ ✕
[메뉴 바 22]   파일  편집  이미지  도구  보기  도움말
[툴바 30]      열기 붙여넣기 │ 실행취소 다시실행 │ 대상: PNG JPEG WebP … │ [변환 후 저장]
[옵션 바 30]   (대상별 컨텍스트 옵션)
[본문]         파일 목록 220 │ 미리보기(어두운 스테이지)
[상태 줄 22]   파일 3개 · 1920×1080 → 1280×720 · 예상 1.2MB        맞춤 100%
```

## Compositor 에서 가져오는 것 (무엇을·왜)

| 이식 | Compositor 출처 | 우리 구현 |
|---|---|---|
| 이미지 크기 대화상자 | `UI/ImageSizeSheet.swift` | 단위(px/%/인치/cm)·DPI·비율 잠금·리샘플 on/off·결과 줄. `core/imagesize.ts`(순수·테스트) |
| 캔버스 크기 | `UI/CanvasSizeSheet.swift` | 9방향 앵커 + 배경색으로 여백 추가/잘라내기 |
| 고품질 축소 | `Rendering/DownsampleCache.swift` | 2배씩 단계 축소 체인 — canvas 1회 축소는 4×↑에서 흐릿/거침 |
| JPEG 내보내기 미리보기 | `UI/JPEGExportSheet.swift` | 품질 슬라이더 → 실제 인코딩 결과·용량 즉시 표시 + 투명 매트 색 |
| 보정 | `Document/ImageAdjustments.swift`, `Levels/Curves/HueSaturation` | sRGB 선형광 기반 LUT — 노출·레벨(자동)·커브·색조/채도·그레인·반전·그라데이션 맵 |
| 안전 한도 | `IO/ImageExporter.swift` | 30,000px/변 · 100MP 상한 + 한국어 안내 (todo P2 해소) |
| 자르기 강화 | `Crop.swift`/`CropControls.swift` | 비율 프리셋·수치 입력·가장자리 스냅·Alt 대칭 |
| 픽셀 그리드·선명 축소 | `EditorCanvas.swift` | 미리보기 확대 시 픽셀 그리드, 축소 시 단계 축소 |

**가져오지 않는 것**: 레이어·마스크·브러시·선택영역·Metal 파이프라인 — 에디터 전용이며
이 프로젝트는 변환기다(PDF 편집이 `~/pdf-editor`로 분리된 것과 같은 이유).

## 결과 (2026-09-21)

전 단계 완료 → v1.4.0. 진행 중 추가 지시 반영: sh-web-editor(DEXT5 계열) 크롬 팔레트·스킨 13종·끄는 대화상자·`»` 툴바 펼치기,
Compositor GuidedMatte 로 AI 배경 제거 다듬기(모델은 유지 — ADR-0008), A~Z 리팩토링·Prettier(printWidth 200).
결정 기록: ADR-0007(클래식 UI), ADR-0008(Compositor 이식 범위). 현재 계약: `guides/ui.md`, `guides/conversion.md`.

## 단계

1. 토큰·base.css·MUI 재스킨 (A)
2. 창 크롬: 타이틀바·메뉴 바·상태 줄 (B)
3. 이미지/캔버스 크기 + 고품질 축소 + DPI (C1)
4. 내보내기 미리보기 + 매트 (C2)
5. 보정 도구 (C3)
6. 안전 한도 (C4) · 자르기 강화 + 픽셀 그리드 (C5)

각 단계마다 `npm run typecheck && npm test && npm run build`, 마지막에 E2E 전체 회귀.
