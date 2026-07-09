---
title: ADR-0001 문서 기반 하네스 엔지니어링 도입
created: 2026-07-07
status: accepted
---

# ADR-0001: 문서 기반 하네스 엔지니어링 도입

## 상태

Accepted

> **2026-07-09 갱신**: "git 저장소가 아니다"라는 전제가 바뀜 — git 도입됨(커밋·푸시는 사용자 직접).
> 후속 과제로 미뤘던 git init이 실행된 것. 단 session-log의 진행 이력 SSOT 역할은 유지한다
> (세션 서사 보존 + CLAUDE.md 부팅 프로토콜 전제). 아래 본문은 도입 당시 맥락 그대로 둔다.

## 맥락

file-converter는 Claude Code를 주 개발 도구로 쓴다. 개발자(이성현)는 코드를 직접 읽지 않고
**인스톨러로 설치해 테스트하고 스크린샷으로 피드백**하는 방식으로 협업한다. 세션이 끊기면
직전까지의 맥락(무엇을 왜 했는지, 남은 일)이 사라져 매번 다시 설명해야 하는 비용이 컸다.

자매 프로젝트 `cm_groupware`·`pt_schedule`는 이미 하네스 엔지니어링 문서 표준을 갖추고 있다:
`writing-guide.md`, `adr/`, `todo.md`, `guides/`, YAML frontmatter, CLAUDE.md 부팅 지침.
그 규율(Constrain → Verify → Correct, 결정의 영구 보존)을 이 프로젝트에도 들여올 필요가 있었다.

단, 결정적 차이가 하나 있다: **file-converter는 git 저장소가 아니다.** cm_groupware는 완료 이력을
git history에 맡기지만, 여기선 그럴 수 없다.

## 결정

`cm_groupware`의 문서 규약을 **개념 그대로** 이식하되, git 부재를 아래처럼 보정한다.

1. **문서 표준 이식**: `docs/writing-guide.md`(지배 규칙), `adr/`(0000-template + 번호매김),
   `todo.md`(P1~P4), `plans/`, `guides/`, 모든 문서 YAML frontmatter.
2. **git history 대체 = `docs/session-log.md`**: 세션마다 최상단에 블록 추가(날짜/한 일/현재 상태/다음).
   "무슨 일이 언제 있었나"의 SSOT. `todo.md`는 미해결만 담는다(cm_groupware와 동일).
3. **CLAUDE.md = 부팅 스크립트**: 세션 시작 시 session-log → todo → plans → 루트 스크린샷 순으로
   상태를 복구하는 프로토콜을 명문화. 변경 후에는 typecheck·test·build → 인스톨러 자동 빌드까지 규칙화.

## 근거

| 대안 | 장점 | 단점 | 결론 |
|------|------|------|------|
| cm_groupware 표준 전체를 그대로 | 성숙·검증됨 | git history 전제라 완료이력이 증발 | 부분 채택 |
| git init 후 표준 그대로 | 규약 100% 재사용 | 사용자가 git 워크플로우 미요청, 별도 결정 필요 | 후속 과제로 분리 |
| **개념 이식 + session-log로 git 대체** | 스택·협업방식에 맞음, 지금 바로 적용 | session-log 수기 관리 필요 | **채택** |

핵심 판단: 가져올 가치는 **코드가 아니라 프로세스 규율**이다. git이 없으므로 "완료 이력의
단일 진실 소스"만 session-log로 옮겨주면 나머지 규약은 그대로 성립한다.

## 결과

### 긍정적
- 세션이 끊겨도 `CLAUDE.md → session-log → todo`만 읽으면 맥락 완전 복구.
- 결정이 ADR로 영구 보존되어 "왜 이렇게 했지?" 추적 가능.
- 자매 프로젝트들과 문서 구조가 통일되어 오갈 때 인지 비용이 낮음.

### 부정적
- session-log·todo를 **매 변경마다 수기 갱신**해야 함(git 자동 이력이 없어서). CLAUDE.md 자동 규칙으로 완화.
- git 부재로 diff·revert·blame 부재. 필요해지면 별도 ADR로 git 도입을 결정한다.
