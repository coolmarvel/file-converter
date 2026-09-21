---
title: 클래식 UI 가이드 (디자인 계약)
created: 2026-09-21
updated: 2026-09-21
domain: ui
---

# 클래식 UI 가이드

v1.4.0 부터 화면은 자매 프로젝트 `~/sh-messenger`·`~/remote-assist`·`~/sh-web-editor` 와 같은 **클래식** 문법이다.
결정 배경은 ADR-0007. 이 문서는 현재 계약과 코드 위치.

## 토큰 (SSOT: `src/renderer/src/styles/tokens.ts`)

| 묶음 | 핵심 값 |
|---|---|
| 글꼴 | 돋움 12px 본문 · 11px 보조 · 13/14px 제목 (`font.*`). 폰트 스무딩 건드리지 않음 |
| 크기 | 컨트롤 24 · 작은 버튼 22 · 타이틀바 28 · 메뉴 바 22 · 툴바 30 · 옵션 바 34 · 상태 줄 22 · 목록 행 22 · 파일 행 34 · 사이드바 220 |
| 간격 | 2·4·6·8·12·16 (`space.*`) |
| 모양 | 반경 0 · 1px 테두리 · 그림자는 팝오버(2px 2px 4px)·대화상자(3px 3px 6px)만 |
| 강조 | `color.accent #3b74f2` = 주 버튼(변환 후 저장)·선택 행·포커스 입력. 한 화면에 주 버튼 하나 |
| 크롬 | `chrome.*` = CSS 변수(스킨이 교체). 호버 = `#2a8dd4` 1px 테두리 + 흰 면, 눌림 = pressed 면 + edge 테두리 |
| 포커스 | 안쪽 1px 점선 (`base.css :focus-visible`, MUI `Mui-focusVisible`) |

- `applyTokens()`(main.tsx)가 `--c-*`·`--size-*`·`--k-*`(크롬 스킨) 변수를 `:root` 에 쓴다.
- MUI 재스킨: `theme.ts`. 컴포넌트 sx 에 색·크기 리터럴 금지 — 토큰만.

## 스킨 (`styles/skins.ts`)

sh-web-editor `src/styles/skins.css`(DEXT5 3.5 배포본 13개 스킨 실측)에서 생성한 표. 보기 → 스킨. 선택은 localStorage(`fc.skin`).
값을 손으로 고치지 말고 skins.css 에서 다시 생성한다(생성 스크립트는 session-log 2026-09-21 참고).

## 화면 골격 (`App.tsx`)

```
TitleBar(28)   앱 마크 · 제목 — 파일명          ─ □ ✕      components/chrome/TitleBar.tsx (frame:false + win:* IPC)
MenuBar(22)    파일 편집 이미지 도구 보기 도움말            components/chrome/MenuBar.tsx (App 의 menus 배열)
ConvertToolbar(30)  목록·열기 │ 실행취소 │ 대상 버튼 │ [변환 후 저장]
OptionsBar(34) 대상별 옵션 — 넘치면 오른쪽 » 로 펼침
[FileSidebar 220 │ Preview(뷰어 툴바 + 어두운 스테이지)]
StatusBar(22)  메시지·진행 막대 │ 파일 수 │ 원본→출력 크기 │ dpi │ 쪽 │ 배율 │ 제작 크레딧
```

## 부품 (`components/bar.tsx`, `components/dialogs/parts.tsx`)

- `ToolButton`(평면 툴바 버튼), `ToggleChip`/`IconToggle`(베벨 토글, 켜지면 눌린 면), `IconBevel`, `SliderControl`(값 버튼 → 슬라이더 팝오버),
  `PaletteControl`(정사각 10×2 팔레트 + 다른 색), `BarInput`, `Group`(글자 라벨), `GDivider`(음각 구분선), `Hint`.
- 대화상자: `ClassicDialog`(제목 띠 끌어 옮기기 · Enter 확인 · Esc 취소), `GroupBox`(fieldset/legend), `Row`, `Check`, `SliderRow`, `Note`.
- 대화상자 8종(이미지·캔버스 크기, 내보내기, 보정, 필터, 효과, 원근 보정, 정보)은 `React.lazy` — 열 때만 로드·마운트. 탭은 `dialogs/tabs.tsx` `ClassicTabs`.

## 메뉴 = 단축키 (App `menus` 와 `keyRef` 가 1:1)

| 키 | 동작 |
|---|---|
| Ctrl+O / Ctrl+V / Ctrl+S | 열기 / 붙여넣기 / 변환 후 저장 |
| Ctrl+Z / Ctrl+Y | 실행취소 / 다시실행 |
| Ctrl+Alt+I / Ctrl+Alt+C | 이미지 크기 / 캔버스 크기 |
| Ctrl+M / Ctrl+Shift+L / Ctrl+I | 보정 / 자동 레벨 / 반전 |
| Ctrl+Alt+Shift+S | 내보내기 미리보기 (JPEG·WebP) |
| Ctrl+Shift+P / Ctrl+Shift+F / Ctrl+Shift+E | 원근 보정·기울기 / 필터 / 효과 |
| Ctrl+Shift+C | 결과를 클립보드로 복사 |
| C · Esc | 자르기 켜기/끄기 (드래그 중 Shift 비율 고정 · Alt 가운데 대칭) |
| Ctrl+= / Ctrl+− / Ctrl+0 / Ctrl+1 · Ctrl+휠 | 확대 / 축소 / 맞춤 / 실제 크기 |
| Ctrl+B · Del · Alt | 파일 목록 / 선택 파일 제거 / 메뉴 열기 |

입력칸에 포커스가 있으면 Ctrl+O·Ctrl+S 외의 앱 단축키는 양보한다(`isTyping`).

## 하지 말 것

- 라운드·큰 그림자·큰 여백·아이콘만 있는 모호한 버튼(툴바 버튼은 툴팁 필수).
- 새 색 hex 를 컴포넌트에 직접. 크롬 색은 `chrome.*`, 나머지는 `color.*`.
- MUI Select 의 `aria-label` 은 콤보박스에 안 붙는다 — `SelectDisplayProps={{ 'aria-label': … }}` 를 쓴다(E2E·스크린리더).
