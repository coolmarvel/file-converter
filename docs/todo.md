---
title: 미해결 사항 및 향후 작업
created: 2026-07-07
updated: 2026-07-10
---

# 미해결 사항 및 향후 작업

현재 인지하지만 아직 처리하지 않은 것만 담는다. **완료된 작업 이력은 여기 남기지 않고
`docs/session-log.md`에 보존한다**(git 도입 후에도 session-log가 진행 이력 SSOT — writing-guide 참고).

## 우선순위 기준

| 등급 | 의미 | 설명 |
|------|------|------|
| **P1** | 즉시 | 기능이 동작하지 않거나 데이터 손상 |
| **P2** | 높음 | 사용성에 영향, 대안은 있음 |
| **P3** | 보통 | 있으면 좋음 |
| **P4** | 낮음 | 장기 개선 |

---

## ~~P1 — pdfguru 편집기 로드맵~~ → 2026-07-08 새 프로젝트 `~/pdf-editor` 로 이관

pdfguru 파리티 전체가 새 프로젝트로 승계됨 (session-log 세션 5, pdf-editor의 `docs/plans/2026-07-08-pdfguru-parity.md`).
이 프로젝트는 **변환기 기능만 유지·보수**한다.

## P2 — (해결) v1.0.4 사용자 확인 완료 (2026-07-08)

워터마크+페이지 넘김 크래시 수정이 확인됨. 현재 미해결 피드백 없음.
  - 정상이면 루트의 `VPWinGate_Manual.pdf` → `docs/feedback-archive/` 이관.
  - v1.0.1 잔여 확인: exe 아이콘(여전히 Electron이면 **Windows 아이콘 캐시** → 재부팅/캐시 초기화, 그래도면 rcedit 재점검), 편집 텍스트 도구.
- **변환 경로 캔버스 상한 검토(P2~P3)**: 미리보기는 2600px 상한을 넣었지만, 변환(PDF→이미지 3x 등)은 스캔 대형 페이지에서 여전히 거대 캔버스 가능.
- ~~**UI 프레임워크 도입 여부**~~ → **2026-07-10 해결(v1.1.0)**: pdf-editor와 동일하게 MUI 채택, 디자인 시스템 이식 완료 (session-log 세션 7).
- **GUI 자동 검증 상설화**: 이번 세션에서 Playwright(headless chromium + vite dev)로 렌더러 검증이 됨을 확인.
  scratchpad 1회용 스크립트를 `test/e2e/`로 리포에 옮기고 playwright를 devDependency로 넣을지 결정.

## P3 — 개선 후보

- **미리보기에 리사이즈 반영**: 이미지 리사이즈 입력을 미리보기에도 반영(현재 원본 크기로만 표시).
- **편집 텍스트 재편집**: 저장 전 배치한 텍스트/획을 선택·이동·삭제(현재는 실행취소/페이지 지우기만).
- **형광펜 진짜 multiply**: 현재 오버레이 내부 합성(반투명 근사). pdf-lib blendMode로 페이지와 직접 multiply 검토.
- **PDF 문서 정리 UI 연결**: 병합/분할/회전/삭제/순서변경 — 구현은 `src/renderer/src/convert/pdf.ts`에 이미 있고 UI만 없음.

## P4 — 장기

- **DICOM 미리보기**: 현재 미지원(`Preview`에서 dicom은 소스 없음).
- **JPEG 품질 옵션 노출**: `canvasToBytes`의 quality(현재 0.92 고정)를 UI로.
- ~~git 도입 검토~~ → **2026-07-09 도입 완료**(사용자가 직접 커밋·푸시). session-log SSOT는 유지 (세션 6, writing-guide).
