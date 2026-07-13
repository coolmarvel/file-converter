---
title: 변환 기능 가이드
created: 2026-07-07
updated: 2026-07-13
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
| 이미지(PNG/JPG/WebP/BMP/GIF/SVG/AVIF) | PDF (여러 장 → 1개) | `convert/pdf.ts` `imagesToPdf` |
| 이미지 | PNG / JPEG / WebP / BMP — **같은 포맷도 허용** | `convert/image.ts` `convertImageFormat` |

- 변환 경로의 진실은 `core/conversions.ts`의 `targetsFor()`다. 새 변환 추가 = 여기 + `convert/index.ts` 디스패처 두 곳.
- **입력 전용 포맷**: GIF/SVG/AVIF — 브라우저가 디코딩만 지원(canvas 인코딩 불가). `IMAGE_OUTPUTS`(png/jpeg/webp/bmp)만 출력 가능.
- **BMP 출력**: canvas.toBlob이 BMP를 지원하지 않아 자체 인코더 `core/bmp.ts` `encodeBmp`(24bit BI_RGB) 사용. 순수 TS라 테스트 있음.
- **같은 포맷 → 같은 포맷**: 크기·품질·회전만 바꿔 재저장하는 용도 (예: JPEG 크기만 줄이기). 레지스트리 라벨 "(크기·품질만 조절)".
- GIF는 첫 프레임만 변환된다(캔버스 드로잉 특성). 애니메이션 보존은 미지원.
- SVG는 문서에 크기 정보(width/height 또는 viewBox)가 있어야 원본 비율이 나온다. 크기 없는 SVG는 브라우저 기본 크기로 래스터화 — 크기(px) 입력으로 보정 가능.

## 옵션 (컨텍스트 툴바 `components/OptionsBar.tsx` — 대상별 노출)

- **PDF → 이미지**: 해상도 `scale`(1.5/2/3x) + 크기(px) + 품질. `App.tsx` `scale` → `pdfToImages`.
  크기 지정 시 scale 해상도로 렌더한 뒤 축소한다(품질 확보).
- **크기(px)**: 이미지 출력 전체 + 이미지→PDF(임베드 전 리사이즈). 한쪽만 입력 시 비율 유지, 둘 다 비우면 원본.
  `App.tsx` `resizeW/resizeH` → `ConvertOptions.resize` → `convert/image.ts` `targetSize()`.
- **품질(%)**: 대상이 JPEG/WebP일 때 10~100% (기본 92). `quality` → `encodeCanvas`.
- **회전·반전·흑백**: 원본이 이미지일 때. 90° 단위 회전 + 좌우/상하 반전 + 그레이스케일.
  `App.tsx` `tf`(Transform) → `convertImageFormat`. 처리 순서: 리사이즈 → 변형 → 워터마크(항상 정방향) → 인코딩.
- **자르기(v1.2.0)**: 모든 소스. `CropRect`(0~1 정규화, **미리보기 화면 기준**) → `applyCrop`.
  파이프라인 순서: 리사이즈 → 회전/반전/흑백 → **자르기** → 워터마크(잘린 결과 기준). Preview `CropLayer`로 편집.
- **워터마크**: 모든 대상. `guides/watermark.md`.
- **undo/redo(v1.2.0)**: `App.tsx`의 Snapshot 이력(400ms 디바운스, 최대 100칸). Ctrl+Z/Ctrl+Y + 툴바 버튼.
  파일 삭제 복원 때문에 removeFile은 previewUrl을 revoke하지 않는다.

## 미리보기 (SSOT: `src/renderer/src/components/Preview.tsx`)

`App.tsx`가 상태로 `PreviewSource`를 계산해 `Preview`에 넘긴다.

| 상황 | 소스 | 페이지 |
|---|---|---|
| 이미지들 + 대상 PDF | `{type:'images', urls}` | 각 이미지 = 페이지 (‹ 1/N ›) |
| 활성 파일이 이미지 | `{type:'images', urls:[1개]}` | 1장 |
| 활성 파일이 PDF | `{type:'pdf', bytes, scale:2}` | pdf.js 지연 렌더, 페이지 넘김 |

미리보기는 확대/축소(0.4~4배)와 스크롤을 지원한다(`Preview`의 `zoom`·`stage`·`nat`).
**100% = "화면에 맞춤"(contain)** — 이미지/페이지 전체가 스크롤 없이 스테이지 안에 들어오는 배율
(`min(stageW/natW, stageH/natH)`, pdf-editor 레이아웃 메뉴와 동일 — v1.1.2, 사용자 피드백).
화면보다 작으면 정중앙 정렬(flex+`m:'auto'`), "맞춤" 버튼 = 100% 리셋. 원본 크기는 `<img>` onLoad에서
수집하고, 측정 전에는 CSS contain 폴백. 배율은 표시 전용 — 변환 결과엔 영향 없다.
**변환 옵션도 실시간 반영(v1.1.3)**: `Preview`가 `transform`/`resize` props를 받아 회전(프레임 스왑+CSS rotate)·
반전(scale ±1)·흑백(filter)·리사이즈 비율을 표시하고, 워터마크는 오버레이 캔버스로 합성 — 미리보기 = 결과물.

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
