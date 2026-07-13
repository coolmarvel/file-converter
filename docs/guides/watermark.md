---
title: 워터마크 가이드
created: 2026-07-07
updated: 2026-07-08
domain: conversion
---

# 워터마크 가이드

## 개요

변환 출력물(이미지·PDF)에 텍스트 또는 서명 워터마크를 합성한다.
변환 패널의 "💧 워터마크 넣기"를 켜면 옵션이 나타나고, **미리보기에 실시간 표시**된 뒤 변환 시 결과물에 찍힌다.

### 미리보기 오버레이 (`components/WatermarkOverlay.tsx`)

- 미리보기 이미지 위에 비대화형 캔버스(z-1, `pointer-events:none`)로 같은 `drawWatermark`를 그려 결과를 예고한다.
  원본 파일은 건드리지 않는다(`App.tsx`의 `watermark` prop 조건).
- **백킹 해상도 상한 `MAX_SIDE=2000px`**: 캔버스를 프레임 CSS 크기 × dpr로 만들면 고배율(400%)+고DPI(150%)에서
  수백 MB가 되어 페이지 넘김마다 재생성 시 렌더러가 죽는다(v1.0.3 크래시 원인). 상한 후 CSS로 늘려 표시.
- 부모 크기가 같으면 재할당/재그리기를 생략한다(`setBox` dedupe).

## 옵션 (SSOT: `src/renderer/src/watermark/model.ts` `WatermarkOpts`)

| 옵션 | 값 |
|---|---|
| type | `text`(문구) / `signature`(내 서명 이미지 `assets/sign.png`) |
| layout | `diagonal`(대각선 1개) / `tile`(바둑판 반복) / `corner`(우하단) |
| text | 문구(텍스트 타입) |
| color | 색(텍스트 타입) |
| opacity | 0~1 진하기 |
| sizePct | 페이지 대비 상대 크기 |
| rotationDeg | 기울기(대각선/바둑판) |

## 적용 지점 (변환 계층에 파라미터로 주입)

`ConvertOptions.watermark` → `runConversion`(`convert/index.ts`)가 서명 타입이면 `sign.png`를 1회 로드해
아래로 전달:
- 이미지→이미지: `convert/image.ts` `convertImageFormat(...)` — drawImage 후 `drawWatermark`.
- 이미지→PDF: `convert/pdf.ts` `imagesToPdf(...)` — 워터마크 있으면 캔버스에 원본+워터마크 그려 PNG 임베드.
- PDF→이미지: `convert/pdf.ts` `pdfToImages(...)` — 페이지 렌더 후 `drawWatermark`.

렌더는 라이브/내보내기 공통 `drawWatermark(ctx, W, H, opts, sig)`(`watermark/model.ts`).

## 계약

- 워터마크는 출력물에 그리고, 미리보기에는 **오버레이로만** 겹쳐 보여준다. 원본 파일은 건드리지 않는다.
- 좌표/크기는 페이지 픽셀 기준으로 매번 계산 → 해상도에 무관하게 비슷한 비율로 찍힌다.
