---
title: ADR-0002 미리보기 페이지네이션 & 대상별 옵션 구조
created: 2026-07-07
status: accepted
---

# ADR-0002: 미리보기 페이지네이션 & 대상별 옵션 구조

## 상태

Accepted

## 맥락

요구사항으로 (a) 여러 이미지→PDF 및 PDF 파일의 다중 페이지 미리보기, (b) 대상 포맷에 따라
달라지는 입력 옵션(이미지 대상 시 크기 리사이즈)이 필요했다. 미리보기는 세 상황을 한 UI로
처리해야 한다: 이미지 1장 / 여러 이미지를 PDF로(각 이미지=페이지) / PDF 파일(각 페이지 렌더).

## 결정

1. **미리보기를 `PreviewSource` 유니온 기반 `components/Preview.tsx`로 분리.**
   - `{ type: 'images', urls }`: object URL 배열. **URL 소유권은 App**(파일 카드 썸네일과 공유) —
     Preview는 revoke하지 않는다.
   - `{ type: 'pdf', bytes, scale }`: pdf.js로 페이지 수 조회 후 현재 페이지만 지연 렌더 + 캐시.
     이 렌더 URL은 **Preview가 소유**하여 언마운트/소스 교체 시 revoke.
2. **대상별 옵션은 모달이 아니라 변환 패널 내 인라인.** 대상 선택에 따라 필드가 나타난다
   (이미지 대상 → 가로×세로, PDF→이미지 → 해상도 scale).
3. **리사이즈는 변환 계층 인자로.** `convertImageFormat(..., resize?: {width?,height?})` +
   `ConvertOptions.resize`. 한쪽만 주면 비율 유지, 둘 다 주면 강제, 둘 다 없으면 원본.
   core 레지스트리(`conversions.ts`)는 변경 불필요 — 옵션은 렌더러 변환 계층의 관심사.

## 근거

- URL 소유권을 App/Preview로 분리해야 이미지 썸네일 URL의 조기 revoke나 PDF 렌더 URL 누수를 막는다.
- PDF 전체 페이지를 미리 렌더하면 큰 문서에서 느리고 메모리 과다 → 지연 렌더 채택.
- 리사이즈를 core에 넣으면 "무엇을→무엇으로"만 아는 순수 계층이 오염된다 → 렌더러에 유지.
- 모달보다 인라인이 변환 흐름을 끊지 않음. 옵션이 복잡해지면 모달로 승격 가능.

## 결과

- 신규 `src/renderer/src/components/Preview.tsx`, `App.tsx`가 상태로 `PreviewSource`를 계산.
- `convert/image.ts`에 `targetSize()`·`ResizeOpts` 추가, `convert/index.ts` 디스패처가 `resize` 전달.
- 미리보기는 현재 **원본 크기**로 표시(리사이즈는 결과물에만 적용). 필요 시 미리보기 반영은 후속 과제.
