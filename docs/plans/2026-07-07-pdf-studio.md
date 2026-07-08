---
title: 계획 PDF 스튜디오(편집) + 파일 순서변경
created: 2026-07-07
updated: 2026-07-07
domain: ui
---

# 계획: PDF 편집(스튜디오) + 파일 순서 변경 (2026-07-07)

출처: 사용자 대화 피드백(세션 3).

## 요구사항

1. **파일 순서 변경**: 여러 장 변환 시 목록에서 순서를 바꿀 수 있어야 함(▲▼).
2. **PDF 편집 모드(체크박스로 활성화)**: PDF 위에
   - 펜 그리기 — 종류: **사인펜(felt)·네임펜(marker)·형광펜(highlighter)**, 색상, 굵기, 진하기(투명도) 조절
   - 텍스트 입력(클릭 지점에)
   - 편집 결과를 PDF로 저장
3. **페이지 독립**: 1페이지에 그린 것이 2페이지에 나타나면 안 됨 → 주석은 페이지별로 저장.

## 설계

### 주석 모델 (`annotate/model.ts`)
- 좌표는 **정규화(0..1)** — 미리보기 표시 크기와 내보내기 해상도에 독립.
- `Stroke { tool, color, width(정규화, 페이지폭 대비), opacity, points:[nx,ny][] }`
- `TextItem { x,y(정규화), text, color, size(정규화, 페이지높이 대비) }`
- `PageAnno { strokes, texts }`, 저장은 `Map<pageIndex, PageAnno>` → **페이지별 독립 보장**.
- `drawAnnotations(ctx, anno, W, H)` — 라이브 오버레이와 내보내기 렌더가 **공유**. 형광펜은 multiply.

### 편집 오버레이 (`components/AnnotationLayer.tsx`)
- 미리보기 이미지 위에 정확히 겹치는 `<canvas>`(preview-frame = 이미지 박스, inline-block).
- 포인터로 stroke 수집(정규화 좌표), 텍스트는 클릭 지점 인라인 입력.
- `anno` 받고 `onChange(nextAnno)` 호출. 언두/클리어는 App이 스냅샷으로 관리.

### 미리보기 통합 (`components/Preview.tsx`)
- editing 관련 props 추가. 현재 페이지의 `anno`를 `AnnotationLayer`에 전달, `onPageInfo(page,count)`로 App에 보고.
- 페이지 이동은 유지 → 페이지별로 그린다.

### 내보내기 (`convert/annotate.ts`)
- 베이스 PDF 확보: pdf 소스면 원본 bytes, 이미지들이면 `imagesToPdf`로 먼저 생성(페이지 순서 = 파일 순서).
- `burnAnnotations(pdfBytes, annos)`: 주석 있는 페이지만, 페이지 크기(pt) 기준으로 오버레이 캔버스 렌더 →
  PNG → `page.drawImage(full page)`. 주석 없는 페이지는 원본 그대로.

### App 흐름
- `canEdit` = 미리보기가 PDF거나 (이미지 + 대상 PDF). 체크박스 "PDF 편집 모드".
- 편집 모드면 변환 타깃 대신 편집 툴바 + "편집한 PDF 저장" 노출.
- `annos` 상태는 편집 대상(파일/이미지셋) 바뀌면 리셋. 페이지별 언두 스택(스냅샷) 보관.

## 버전
- 기능 추가 → semver **minor**: `0.1.0 → 0.2.0`. `package.json`·changelog·인스톨러 파일명 반영.

## 손대는 파일
- 신규: `annotate/model.ts`, `components/AnnotationLayer.tsx`, `convert/annotate.ts`
- 수정: `components/Preview.tsx`, `components/FileCard.tsx`(▲▼), `App.tsx`, `styles.css`, `package.json`
