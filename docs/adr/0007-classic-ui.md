---
title: ADR-0007 클래식 UI 로 전환 (sh-messenger · remote-assist · sh-web-editor 계열)
created: 2026-09-21
status: accepted
---

# ADR-0007: 클래식 UI 로 전환

## 상태

Accepted (v1.4.0). v1.1.0 의 TailAdmin 계열 MUI 테마(둥근 모서리·큰 여백·16px)를 대체한다.

## 맥락

사용자(2026-09-21): "지금 UI/UX 가 내가 원하는 방식이 아니다. sh-messenger·remote-assist 처럼 클래식한 UI/UX 를 원한다."
이어서 "sh-web-editor 도 클래식 UI 니 가져올 게 있으면 적극적으로" 지시.
세 자매 프로젝트는 같은 형태 언어를 쓴다 — Upbit 베이스(각지고 촘촘) + Money Forward 베벨 버튼 + Palantir 데스크톱 밀도,
그리고 sh-web-editor 는 DEXT5(한국 그룹웨어 웹에디터) 실측 팔레트·스킨 13종.
밀도는 사용자가 "완전 동일(12px)" 을 골랐다 (v1.3.1 의 "폰트가 작다" 피드백보다 클래식 밀도를 우선 — 사용자 결정).

## 결정

1. **토큰 SSOT = `src/renderer/src/styles/tokens.ts`**. 시작 시 `:root` CSS 변수로 주입, `base.css` 는 var() 만,
   MUI 테마(`theme.ts`)는 같은 객체를 읽는다. 반경 0 · 1px 테두리 · 12px 돋움 · 24px 컨트롤 · 안쪽 1px 점선 포커스 ·
   그림자는 팝오버/대화상자만.
2. **MUI 는 유지하고 재스킨만** (사용자 선택). Select·Slider·Popover·Menu 같은 부품의 접근성·동작을 그대로 쓰고
   E2E 24종의 선택자(role·텍스트·아이콘 testid)를 지킨다.
3. **크롬 색은 sh-web-editor 실측값**(frame `#a1abb9`, 메뉴 바 `#edf2f6→#d9e1ec`, 호버 `#2a8dd4` 1px 테두리,
   눌림 `#d3dbe7`+`#afb6c6`, 회색 상태 줄)이고 **스킨 13종**(`styles/skins.ts`, skins.css 에서 생성)으로 바꿀 수 있다.
   그래서 크롬 색은 리터럴이 아니라 `chrome.*`(CSS 변수)로 참조한다.
4. **창 크롬을 앱이 그린다**: `frame:false` + 28px 타이틀바(`TitleBar`) + 22px 메뉴 바(`MenuBar`) + 22px 상태 줄(`StatusBar`).
   창 버튼은 main 의 `win:*` IPC. 떠 있던 로딩 카드는 상태 줄 진행 막대로 옮겼다.
5. 미리보기 스테이지만 어두운 면(`#1e2025`) — PACS 뷰어·Compositor 처럼 이미지는 어두운 바탕에서 본다.
6. sh-web-editor 에서 가져온 동작: 열린 메뉴에서 옆 제목에 호버하면 전환, 제목 띠로 끄는 대화상자,
   넘치는 툴바 줄의 `»` 펼치기, 15% 검정 덮개, 폰트 스무딩 미적용(비트맵 글꼴 느낌).

## 근거

- CSS Modules 로 전면 이식(sh-messenger 구조)도 검토했지만, 렌더러 6개 컴포넌트 ~1,500줄 재작성 = 회귀 위험·시간이 크고
  겉모습은 재스킨으로 100% 같게 낼 수 있어 기각(사용자 선택과 일치).
- 크롬 색을 변수로 둔 덕에 스킨은 `:root` 변수 14개 교체로 끝난다 — 구조·크기는 스킨과 무관.

## 결과

- 좋은 점: 세 자매 앱과 같은 "설치형 업무 도구" 인상. 기능이 메뉴·단축키로도 닿는다(메뉴 = 단축키 표기와 1:1).
- 나쁜 점: 12px 는 고해상도 모니터에서 작게 느껴질 수 있다 — 피드백이 오면 `font.*`·`size.*` 토큰만 한 단계 올리면 된다.
- MUI 기본 동작 중 클래식과 어긋나는 것(600px 이상 MenuItem minHeight:auto, 투명 백드롭까지 어두워지는 스타일)은
  `theme.ts` 에서 개별 보정했다.
