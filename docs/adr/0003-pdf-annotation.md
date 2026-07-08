---
title: ADR-0003 PDF 주석(편집)을 래스터 오버레이로 합성
created: 2026-07-07
status: accepted
---

# ADR-0003: PDF 주석(편집)을 래스터 오버레이로 합성

## 상태

Accepted

## 맥락

PDF 위에 펜(사인펜/네임펜/형광펜)·텍스트를 얹어 저장하는 편집 기능이 필요했다. 요구 조건:
한글 텍스트 지원, 형광펜 반투명, **페이지별 독립**(1페이지 편집이 2페이지에 나타나면 안 됨).

pdf-lib로 벡터로 그리는 방법(`drawSvgPath`/`drawText`)은 한글 텍스트에 CJK 폰트 임베드(수 MB 에셋 +
fontkit)가 필요해 무겁고, 자유곡선 펜·형광펜 blend 처리가 번거롭다.

## 결정

주석을 **브라우저 canvas로 렌더한 뒤 페이지별 투명 PNG로 만들어 pdf-lib로 합성**한다.

- 주석 데이터는 정규화 좌표(0..1)로 `Map<pageIndex, PageAnno>`에 저장 → 페이지 인덱스로 격리되어
  **페이지 독립 자동 보장**. (`annotate/model.ts`)
- 라이브 오버레이(`components/AnnotationLayer.tsx`)와 내보내기(`convert/annotate.ts`)가 **동일한
  `drawAnnotations()`** 를 써서 화면과 결과가 일치.
- 내보내기: 주석 있는 페이지만 페이지 크기(pt)×배율로 캔버스 렌더 → `embedPng` → `drawImage(전체 페이지)`.
  주석 없는 페이지는 원본 그대로.
- 펜 종류는 프리셋(굵기/투명도)으로: felt(얇고 진하게)/marker(굵게)/highlighter(아주 굵고 반투명, multiply).

## 근거

| 대안 | 장점 | 단점 | 결론 |
|------|------|------|------|
| pdf-lib 벡터(drawText/drawSvgPath) | 벡터·선택 가능 텍스트, 파일 작음 | 한글=CJK 폰트 임베드 필요, 펜/형광펜 처리 번거로움 | 기각 |
| **canvas 래스터 오버레이 → PNG 합성** | 한글·펜·형광펜 브라우저가 처리, 화면=결과 일치, 페이지 독립 쉬움 | 텍스트가 래스터(선택 불가), 페이지 용량 증가 | **채택** |

마크업/주석 용도에선 텍스트 선택 가능성보다 "보이는 대로 저장"과 한글 지원이 중요하다.

## 결과

- 신규: `annotate/model.ts`, `components/AnnotationLayer.tsx`, `convert/annotate.ts`.
- `Preview`가 편집 오버레이를 통합하고 현재 페이지를 App에 보고(`onPageInfo`). App이 주석·페이지별 언두 스택 소유.
- 편집 출력은 항상 PDF. 이미지들이 대상이면 `imagesToPdf`로 베이스 PDF 생성 후 주석 합성.
- 한계: 텍스트 비선택(래스터), 형광펜은 오버레이 내부 합성이라 페이지 내용과의 진짜 multiply는 아님(반투명으로 근사).
