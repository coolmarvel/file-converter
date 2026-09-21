---
title: ADR-0008 Compositor(MIT) 기능 이식 범위와 AI 배경 제거 유지
created: 2026-09-21
status: accepted
---

# ADR-0008: Compositor 기능 이식 범위

## 상태

Accepted (v1.4.0)

## 맥락

사용자가 `~/Compositor`(Wonder Assembly LLC, MIT — Swift/macOS 포토샵 대체 에디터, 약 2만 줄)를 학습해
"도메인이 같으니 우리 것에 녹여 달라", 이어서 "저기서 쓰는 거 다 가져와" 라고 지시했다.
또 "AI 배경 제거는 가져온 게 더 좋으면 기존 것을 걷어 내도 된다" 고 했다.

## 결정

**이식한 것** (수식·동작을 TypeScript 로 옮김 — 순수 로직은 `src/core/`, 테스트 21종):

| Compositor | 우리 |
|---|---|
| `ImageSizeSheet` | `core/imagesize.ts` + `ImageSizeDialog` — 단위 4종·DPI·비율 잠금·리샘플 끔(DPI 맞바꿈) |
| `CanvasSizeSheet`/`CanvasResizer` | `core/canvassize.ts` + `CanvasSizeDialog` — 9방향 앵커 (+ 여러 파일용 '여백 추가'·'정사각형') |
| `DownsampleCache` | `convert/image.ts` `stepDown` — 정확히 2배씩 단계 축소 |
| `JPEGExportSheet` | `ExportDialog` — 실제 인코딩 결과·용량·매트 색 |
| `ImageExporter` 한도 | `core/limits.ts` — 30,000px/변·100MP |
| Levels/Auto/Curves/Exposure/HueSat/Grain/Invert/GradientMap | `core/adjust.ts` + `AdjustDialog` |
| `GuidedMatte` + `SubjectRemoval.refined` | `core/matte.ts` + `convert/matte.ts` — 가이드 필터·가장자리 이동·매트 대비 |
| 픽셀 그리드·줌 단계·Photoshop 식 단축키 | `Preview`·`App` 키 처리 |
| PNG/JPEG DPI 기록 | `core/dpi.ts` (pHYs·JFIF) |

**가져오지 않은 것**: 레이어·마스크·브러시·선택 영역·변형·Metal 렌더 — 에디터 전용 기능이고 이 앱은 변환기다
(PDF 편집을 `~/pdf-editor` 로 분리한 것과 같은 이유). 색조/채도의 6색역 밴드도 뺐다(Master 만).

**AI 배경 제거는 기존 @imgly 모델을 유지**하고 Compositor 의 다듬기 단계만 얹었다.

## 근거

- Compositor 의 배경 제거 마스크는 `VNGenerateForegroundInstanceMaskRequest`(Apple Vision, macOS 전용)라
  Windows 설치본에서 쓸 수 없다. 이식 가능한 부분은 마스크 **후처리**(순수 수학)뿐이고, 그게 실제로 머리카락·테두리 품질을 올린다.
- MIT 조건(저작권 표시 유지)은 도움말 → 정보 대화상자와 각 모듈 머리 주석으로 지킨다.

## 2차 이식 (v1.5.0, 2026-09-21)

사용자: "변환기 형태를 해치지 않는 선에서 쓸모 있는 건 다 적용 — 편집기는 따로 만든다".

| Compositor | 우리 |
|---|---|
| `Distort`(네 모서리 자유 변형) | `core/perspective.ts` + `PerspectiveDialog` — 방향을 뒤집어 **비뚤어진 사각형 → 직사각형(문서 펴기)**, 기울기 = 임의 각도 회전. 파일별 소스 전처리(`App.effFiles`) |
| `LayerEffects`(CPU 경로) | `core/effects.ts` + `EffectsDialog` — 외곽선(덱 팽창)·그림자·색 덮기·안쪽 그림자, 여백 자동 확장, 스티커 프리셋 |
| `Filters` + `NoisePixels.c`·`LensPixels.c` | `core/filters.ts` + `FiltersDialog` — 노이즈·렌즈는 수식 그대로, 흐림은 상자 3회(σ 근사) |
| `ContentFill.c` | `core/contentfill.ts` — 캔버스 크기 여백 채우기(큰 캔버스는 1.2MP 축소본에서) |
| Levels/Curves 채널·`LevelsAutomatic` 3모드·스포이트, `HueSaturation` 6색역·Colorize | `core/adjust.ts` 확장 + `AdjustDialog` |
| Copy Merged | `clip:writeImage` IPC — 결과 PNG 를 시스템 클립보드로 |

**여전히 안 가져온 것 (변환기에 안 맞음)**: 여러 프로젝트 탭(파일 목록이 같은 역할), 색역 밴드 핸들 편집,
그리고 레이어·마스크·선택·브러시·복구·도장·문자·도형·리퀴파이 — **별도 포토샵형 편집기 프로젝트**로 옮긴다.

## 결과

- 배경 제거 결과가 원본 경계에 붙어 더 자연스럽다(기본값 다듬기 12px·대비 25% — Compositor 기본값).
  E2E D1 에서 모서리 alpha 0 · 중앙 유지 확인.
- 주의: @imgly/background-removal 은 **AGPL-3.0** 이다(기존부터). 사내 배포만이면 문제가 적지만 외부 배포 전 검토 필요 — todo P3.
