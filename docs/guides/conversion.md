---
title: 변환 기능 가이드
created: 2026-07-07
updated: 2026-09-21
domain: conversion
---

# 변환 기능 가이드

## 개요

파일을 끌어다 놓으면 매직 바이트로 종류를 감지하고, 같은 종류끼리 모였을 때만 변환 대상을
제시한다. 실제 변환은 브라우저 컨텍스트(canvas/pdf.js)에서 수행되며 원본 바이트는 수정하지 않는다.
DICOM은 v1.1.1(2026-07-13)에서 제거 — 전용 DICOM 변환기 프로젝트로 분리 예정.

## 변환 경로 (SSOT: `src/core/conversions.ts`)

| 원본 | 대상 | 구현 |
|---|---|---|
| PDF | PNG / JPEG / WebP (페이지별) | `convert/pdf.ts` `pdfToImages` |
| 이미지(PNG/JPG/WebP/BMP/GIF/SVG/AVIF/HEIC/TIFF/ICO) | PDF (여러 장 → 1개) | `convert/pdf.ts` `imagesToPdf` |
| 이미지 | PNG / JPEG / WebP / BMP — **같은 포맷도 허용** | `convert/image.ts` `convertImageFormat` |
| 이미지 | ICO (16~256 멀티사이즈) | `convert/image.ts` `convertImageToIco` + `core/ico.ts` |
| 이미지 | SVG (벡터 트레이싱, 로고용) | `convert/image.ts` `convertImageToSvg` (imagetracerjs) |
| PDF | PDF 문서 정리 (병합/분할/회전/삭제/순서) | `convert/pdftools.ts` + OptionsBar PDF 도구 |

- 변환 경로의 진실은 `core/conversions.ts`의 `targetsFor()`다. 새 변환 추가 = 여기 + `convert/index.ts` 디스패처 두 곳.
- **입력 전용 포맷**: GIF/AVIF(브라우저 디코딩만), **HEIC/TIFF는 추가 시점에 PNG로 디코드**(`convert/decode.ts`,
  heic2any·utif2 — `AppFile.srcKind`로 원래 포맷 배지 유지). `IMAGE_OUTPUTS`(png/jpeg/webp/bmp)만 출력 가능.
- **BMP 출력**: canvas.toBlob이 BMP를 지원하지 않아 자체 인코더 `core/bmp.ts` `encodeBmp`(24bit BI_RGB) 사용. 순수 TS라 테스트 있음.
- **같은 포맷 → 같은 포맷**: 크기·품질·회전만 바꿔 재저장하는 용도 (예: JPEG 크기만 줄이기). 레지스트리 라벨 "(크기·품질만 조절)".
- GIF는 첫 프레임만 변환된다(캔버스 드로잉 특성). 애니메이션 보존은 미지원.
- SVG는 문서에 크기 정보(width/height 또는 viewBox)가 있어야 원본 비율이 나온다. 크기 없는 SVG는 브라우저 기본 크기로 래스터화 — 크기(px) 입력으로 보정 가능.

## 옵션 (옵션 바 `components/OptionsBar.tsx` — 대상별 노출, 메뉴·단축키로도 닿는다)

- **PDF → 이미지**: 해상도 `scale`(1.5/2/3x) + 크기(px) + 품질. 스캔 PDF 의 거대 페이지는 한도(`core/limits.ts`) 안으로 자동 축소 렌더.
- **크기(px)**: 이미지 출력 전체 + 이미지→PDF. 한쪽만 입력 = 비율 유지. `App` `resizeW/resizeH` → `targetSize()`.
  **이미지 크기 대화상자(v1.4.0, Ctrl+Alt+I)**: 단위 px/%/인치/cm · 해상도(DPI) · 비율 잠금 · 리샘플 on/off —
  계산은 `core/imagesize.ts`. 결과는 `resizeW/H` + `dpi` 로 들어간다(비율 잠금이면 가로만 → 여러 파일이 각자 비율 유지).
- **해상도(DPI, v1.4.0)**: PNG(pHYs)·JPEG(JFIF)에 새긴다(`core/dpi.ts`, canvas 가 DPI 를 안 넣어 줌).
  이미지→PDF 에서는 페이지 크기 = 픽셀 × 72/DPI pt. 원본에 DPI 가 있으면 첫 파일 값을 이어받는다.
- **캔버스 크기(v1.4.0, Ctrl+Alt+C)**: 픽셀은 그대로 종이만 — 크기 지정/여백 추가/정사각형 + 9방향 앵커 + 여백 색(투명 가능). `core/canvassize.ts`.
- **품질(%)**: JPEG/WebP 10~100%(기본 92). **내보내기 미리보기(v1.4.0, Ctrl+Alt+Shift+S)**: 선택 파일을 실제로 인코딩해
  결과·용량을 보여 주고, 투명을 못 담는 포맷은 **매트 색**(투명 자리 채움, 기본 흰색)을 고른다.
- **회전·반전·흑백**: 원본이 이미지일 때.
- **보정(v1.4.0, Ctrl+M)**: 레벨(+자동, Ctrl+Shift+L)·커브·노출(선형광)·색조/채도(Master)·그레인·반전(Ctrl+I)·그라데이션 맵.
  수식 `core/adjust.ts`(Compositor 이식, 테스트). SVG 대상에는 적용 안 함.
- **자르기**: `CropRect`(0~1 정규화, **캔버스 크기까지 반영된 프레임 기준**). 비율 프리셋·수치 입력(px)·
  가장자리/가운데 스냅(자유 비율)·Shift 비율 고정·Alt 가운데 대칭·3분할선. 단축키 C / Esc.
- **배경**: 흰색→투명 / **AI 배경 제거**(@imgly 1.4.5 고정, 모델 354MB 번들 + bgrm:// 서빙) +
  **가장자리 다듬기(v1.4.0)** — 다듬기(가이드 필터 px)·이동(±px)·대비(%) (`core/matte.ts`, Compositor GuidedMatte).
  미리보기는 선택 파일만 1024px 로 다듬고, 변환은 4096px 로.
- **원근 보정·기울기(v1.5.0, Ctrl+Shift+P)**: 파일마다 네 모서리(`App.warps`) → 펴진 PNG 를 캐시(`warpCache`)해
  그 파일의 **소스 자체를 바꿔 끼운다**(`App.effFiles`, `AppFile.cacheKey`) — 이후 모든 옵션이 펴진 이미지에 적용. `core/perspective.ts`.
- **필터(v1.5.0, Ctrl+Shift+F)**: 가우시안·모션 블러·노이즈·렌즈 보정 (`core/filters.ts`). 불투명 사진은 가장자리를 늘려 흐리고,
  투명 누끼는 흐림이 번질 여백만큼 캔버스가 넓어진다(Compositor 와 같음).
- **효과(v1.5.0, Ctrl+Shift+E)**: 외곽선·그림자·색 덮기·안쪽 그림자 (`core/effects.ts`) — 효과 여백만큼 넓어진다. 스티커 프리셋.
- **캔버스 여백 내용 인식 채우기(v1.5.0)**: `background: 'content'` → `core/contentfill.ts`.
- **클립보드로 복사(v1.5.0, Ctrl+Shift+C)**: 선택 파일 하나를 모든 옵션 반영 PNG 로 → main `clip:writeImage`.
- **워터마크**: SVG 대상 제외 전부. `guides/watermark.md`.
- **진행 표시**: `ConvertOptions.onProgress` → App `progress` → **상태 줄** 진행 막대(v1.4.0, 떠 있는 카드 대체).
- **undo/redo**: `hooks/useHistory.ts`(v1.4.0 App 에서 분리 — 400ms 디바운스, 최대 100칸). 작업 상태 전부(보정·캔버스·DPI·매트 포함).

### 렌더 파이프라인 순서 (SSOT: `convert/image.ts` `renderToCanvas` + `finishCanvas`)

```
(파일별: 원근 보정 → AI 배경 제거·다듬기) → 리사이즈(2배씩 단계 축소) → 회전/반전/흑백 → 보정 → 필터 → 흰색제거 → 효과 → 캔버스 크기(+내용 인식) → 자르기 → 워터마크 → (불투명 출력이면) 매트 → 인코딩(+DPI)
```

- PDF→이미지도 렌더 후 같은 `finishCanvas` 를 쓴다.
- 보정·흰색제거는 **픽셀별 연산이라 기하와 순서를 바꿔도 같다** → 미리보기는 원본 단계에서 픽셀 패스를 돌리고 기하는 CSS 로 보인다.
- **한도**: 모든 캔버스 생성 전에 `assertCanvasSize`(30,000px/변·100MP) — 넘으면 이유를 말하는 오류.

## 미리보기 (SSOT: `src/renderer/src/components/Preview.tsx`)

`App.tsx`가 상태로 `PreviewSource`를 계산해 `Preview`에 넘긴다.

| 상황 | 소스 | 페이지 |
|---|---|---|
| 이미지들 + 대상 PDF | `{type:'images', urls}` | 각 이미지 = 페이지 (‹ 1/N ›) |
| 활성 파일이 이미지 | `{type:'images', urls:[1개]}` | 1장 |
| 활성 파일이 PDF | `{type:'pdf', bytes, scale:2}` | pdf.js 지연 렌더, 페이지 넘김 |

**배율(v1.4.0)**: 출력 1px 당 화면 px(2%~3200%, Photoshop 식 고정 단계). 처음은 "맞춤", 100% = 실제 크기.
Ctrl+휠·Ctrl+=/−/0/1. 800% 이상에서 픽셀 그리드, 400% 이상에서 `image-rendering: pixelated`.
**종이 = 출력 프레임**: 원본 → 리사이즈 → 회전 → 캔버스 크기(앵커 위치에 이미지 박스, 여백은 색/체커) — 자르기 레이어는 종이 전체 위.
**픽셀 패스**: 보정·흰색제거는 원본 축소본(1600px)의 ImageData 를 url 당 한 번만 디코드해 두고, 슬라이더마다 복사본에만 적용(90ms 디바운스).
프레임 크기·배율·페이지는 `onFrame` 으로 App 에 보고 → 상태 줄 · 자르기 수치 입력.
**렌더 미리보기(v1.5.0)**: 필터·효과·내용 인식 채우기는 CSS 로 흉내 낼 수 없어, 켜지면 App 이 실제 파이프라인을 긴 변 1400px 배율로
돌린 결과(자르기·워터마크 제외)를 소스로 넘긴다(`natOverride` = 출력 픽셀 크기). px 단위 옵션은 같은 배율로 줄여 계산(`scaleFilters`·`scaleEffects`).

**계약(중요)**: `images` 소스의 URL은 App이 소유하므로 Preview는 revoke하지 않는다.
`pdf` 소스가 렌더한 URL만 Preview가 소유·해제한다. (조기 revoke/누수 방지 — ADR-0002)

## 저장 흐름

- 결과 1개 → `window.api.saveBuffer`(다이얼로그) 후 탐색기에 표시.
- 결과 여러 개(PDF→이미지 등) → `window.api.pickSaveDir` 후 디렉터리에 일괄 저장.
- 관련: `src/main/index.ts`(IPC 핸들러), `src/preload/index.ts`(API 노출).

## 관련 코드

- 형식 감지: `src/core/fileTypes.ts` `detectFileKind` (SVG만 텍스트 마커, 나머지 매직 바이트)
- BMP 인코더: `src/core/bmp.ts` `encodeBmp`
- 변환 디스패처: `src/renderer/src/convert/index.ts` `runConversion`
- 화면 상태·흐름: `src/renderer/src/App.tsx`
