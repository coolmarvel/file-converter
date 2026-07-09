---
title: 문서 작성 가이드
created: 2026-07-07
updated: 2026-07-07
domain: development
---

# 문서 작성 가이드

`docs/` 문서를 작성·관리하는 기준. 신규 문서를 만들거나 기존 문서를 갱신할 때 이 규칙을 따른다.
이 규약은 자매 프로젝트 `cm_groupware`·`pt_schedule`의 문서 표준(하네스 엔지니어링)을 이식한 것이다.

이 프로젝트의 문서는 **사람과 AI 에이전트(Claude Code)가 동시에 사용**한다는 전제로 쓴다.
받는 사람(또는 AI)의 사전 지식을 가정하지 말고, 누가 받아도 바로 작업 가능한 형태를 목표로 한다.

## ⚠️ 이 프로젝트의 이력 관리: session-log가 SSOT

원래 git 저장소가 아니어서 `docs/session-log.md`가 git history를 대신했다.
**2026-07-09부터 git 저장소가 됐지만**(커밋·푸시는 사용자가 직접), session-log의 SSOT 역할은 유지한다 —
커밋은 사용자 재량 단위라 세션 서사(무엇을 왜, 어디까지)를 담보하지 못하고, CLAUDE.md 부팅 프로토콜이 이 파일을 전제한다.

- **"무슨 일이 언제 있었나"의 SSOT = `docs/session-log.md`**. git log는 보조.
- `todo.md`는 cm_groupware와 동일하게 **미해결·향후 작업만** 담는다.
- 세션이 끝날 때 반드시 `session-log.md` 최상단에 그 세션 블록을 추가한다.

## 폴더 구조

```
docs/
├── writing-guide.md      # 이 파일 (문서 작성 규칙)
├── session-log.md        # 세션별 진행 이력 (최신이 맨 위) — 진행상태 SSOT
├── todo.md               # 미해결·향후 작업 (P1~P4)
├── changelog.md          # 배포/버전 단위 사람용 요약 (인스톨러 릴리스 노트)
├── adr/                  # 아키텍처 결정 기록
│   ├── 0000-template.md
│   └── NNNN-*.md
├── plans/                # 기능 단위 구현 계획 (착수 전/중)
│   └── YYYY-MM-DD-*.md
└── guides/               # 기능별 동작·구현 가이드 (현재 코드 기준)
    └── *.md
```

| 위치 | 용도 |
|---|---|
| `docs/` 루트 | 진행 이력·할 일·릴리스·작성 규칙 등 프로젝트 전반 |
| `docs/adr/` | "왜 이렇게 했는가"를 영구 보존하는 결정 기록 |
| `docs/plans/` | 착수 전/중인 기능의 설계 의도 (완료되면 요지는 ADR·guide로, 계획서는 남겨둠) |
| `docs/guides/` | 특정 기능의 현재 동작·구현·코드 위치 |

## 파일명 규칙

- **영어 kebab-case**: `conversion.md`, `session-log.md`
- ADR은 `NNNN-kebab-title.md` (4자리 + kebab). 계획은 `YYYY-MM-DD-kebab.md`
- 접두/접미어 금지 (`_v2`, `_final`, `GUIDE_` 등)

## 문서 템플릿 (guides)

```markdown
---
title: 문서 제목
created: YYYY-MM-DD
updated: YYYY-MM-DD
domain: <아래 표에서>
---

# 문서 제목

## 개요
무엇을, 어떤 문제를 해결하는지 1~3문단.

## 동작 방식
현재 구현된 동작. 필요 시 데이터 흐름.

## 사용 방법
사용자 관점 설명(해당 시).

## 관련 코드
주요 파일 경로를 1:1 대조 가능하게 (`src/renderer/src/convert/pdf.ts:42`).
```

`domain` 값:

| 값 | 대상 |
|---|---|
| `core` | 형식 감지·변환 레지스트리 (`src/core/`) |
| `conversion` | 실제 변환 구현 (`src/renderer/src/convert/`) |
| `ui` | 화면·컴포넌트 (`App.tsx`, `components/`) |
| `packaging` | 빌드·인스톨러·electron 메인/프리로드 |
| `development` | 문서·도구 등 도메인 무관 |

ADR은 `domain` 대신 `status`(`proposed`/`accepted`/`deprecated`/`superseded`)를 쓴다. `adr/0000-template.md` 참고.

## 작성 원칙

1. **현재 코드 기준으로만** — 구현된 것만 적는다. 향후 계획은 `todo.md`나 ADR로. 코드가 바뀌면 문서와 `updated`도 갱신. 코드와 어긋난 문서는 없느니만 못하다.
2. **SSOT 명시** — 같은 사실을 두 곳에 적지 않는다. 한쪽이 권위를 갖고 나머진 링크. (예: 변환 경로 진실은 `core/conversions.ts`, CLAUDE.md는 요약만)
3. **파일 경로·식별자를 풍부하게** — `src/renderer/src/convert/image.ts:71` 형태로. AI가 grep·Read로 바로 찾게.
4. **불변·계약을 명문화** — "이미지 URL 소유권은 App, Preview는 revoke 금지" 같은 조건은 분명히. 부수효과(파일 저장, URL 생성/해제)를 빠뜨리지 않는다.
5. **함정·과거 사고는 1줄로 보존** — 룰의 근거가 된 사고는 한 줄로. 다음 사람/AI가 룰을 함부로 깨지 않게.
6. **충실하되 군더더기 없이** — 반복 금지. 코드는 핵심만 발췌. ❌금지/✅권장 표 선호.
7. **튜토리얼 톤 배제** — 사실·계약·경로 위주.

## 포함하지 않는 것

- AI와의 대화 로그, 구현 완료 보고서 서술(→ `session-log.md` 한 블록으로 압축)
- 해결된 트러블슈팅 장문 기록(근거만 1줄로 ADR/가이드에)
- 테스트 출력·스크린샷 원본

## 언어

- 본문 한국어. 코드·명령어·기술용어·고유명사·파일명·URL은 영어 원문 유지.

## 문서 추가·갱신 절차

1. 알맞은 위치(`docs/` 루트 / `guides/` / `adr/` / `plans/`)에 파일 생성
2. 템플릿·원칙에 맞춰 작성
3. `created`(신규)/`updated`(수정) 날짜 갱신
4. 코드와 1:1 대조 — 언급한 파일·함수·경로가 실제 존재하는지 확인
5. `CLAUDE.md`의 문서 인덱스에 누락 없는지 확인

## 루트에 남기는 파일

- `README.md` — 프로젝트 진입점
- `CLAUDE.md` — Claude Code가 세션 시작 시 자동 로드하는 지침 (부팅 프로토콜 포함)
