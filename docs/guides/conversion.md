---
title: 변환 기능 가이드
created: 2026-07-07
updated: 2026-07-07
domain: conversion
---

# 변환 기능 가이드

## 개요

파일을 끌어다 놓으면 매직 바이트로 종류를 감지하고, 같은 종류끼리 모였을 때만 변환 대상을
제시한다. 실제 변환은 브라우저 컨텍스트(canvas/pdf.js)에서 수행되며 원본 바이트는 수정하지 않는다.

## 변환 경로 (SSOT: `src/core/conversions.ts`)

| 원본 | 대상 | 구현 |
|---|---|---|
| PDF | PNG / JPEG (페이지별) | `convert/pdf.ts` `pdfToImages` |
| 이미지(PNG/JPG/WebP) | PDF (여러 장 → 1개) | `convert/pdf.ts` `imagesToPdf` |
| 이미지 | 다른 이미지 포맷 (+ 크기 리사이즈) | `convert/image.ts` `convertImageFormat` |
| 이미지 | DICOM (Secondary Capture) | `convert/dicom.ts` `imageToDicom` |

- 변환 경로의 진실은 `core/conversions.ts`의 `targetsFor()`다. 새 변환 추가 = 여기 + `convert/index.ts` 디스패처 두 곳.
- DICOM은 **이미지 → DICOM 생성만** 지원. 생성 후 반드시 DICOM 뷰어로 검증할 것.

## 옵션 (대상별)

- **PDF → 이미지**: 해상도 `scale`(1.5/2/3x). `App.tsx` `scale` 상태 → `pdfToImages`.
- **→ 이미지**: 가로×세로 px 리사이즈. 한쪽만 입력 시 비율 유지, 둘 다 비우면 원본.
  `App.tsx` `resizeW/resizeH` → `ConvertOptions.resize` → `convert/image.ts` `targetSize()`.
- **→ DICOM**: 환자 정보 폼(`components/DicomForm.tsx`), 이름·ID 필수.

## 미리보기 (SSOT: `src/renderer/src/components/Preview.tsx`)

`App.tsx`가 상태로 `PreviewSource`를 계산해 `Preview`에 넘긴다.

| 상황 | 소스 | 페이지 |
|---|---|---|
| 이미지들 + 대상 PDF | `{type:'images', urls}` | 각 이미지 = 페이지 (‹ 1/N ›) |
| 활성 파일이 이미지 | `{type:'images', urls:[1개]}` | 1장 |
| 활성 파일이 PDF | `{type:'pdf', bytes, scale:2}` | pdf.js 지연 렌더, 페이지 넘김 |

미리보기는 확대/축소(0.4~4배, "맞춤"=너비맞춤)와 세로 스크롤을 지원한다(`Preview`의 `zoom`·`stageW`). 배율은 표시 전용 — 변환 결과엔 영향 없다.

**계약(중요)**: `images` 소스의 URL은 App이 소유하므로 Preview는 revoke하지 않는다.
`pdf` 소스가 렌더한 URL만 Preview가 소유·해제한다. (조기 revoke/누수 방지 — ADR-0002)

## 저장 흐름

- 결과 1개 → `window.api.saveBuffer`(다이얼로그) 후 탐색기에 표시.
- 결과 여러 개(PDF→이미지 등) → `window.api.pickSaveDir` 후 디렉터리에 일괄 저장.
- 관련: `src/main/index.ts`(IPC 핸들러), `src/preload/index.ts`(API 노출).

## 관련 코드

- 형식 감지: `src/core/fileTypes.ts` `detectFileKind`
- 변환 디스패처: `src/renderer/src/convert/index.ts` `runConversion`
- 화면 상태·흐름: `src/renderer/src/App.tsx`
