# 프로젝트 시작 안내

[Agent.md](Agent.md)의 프로젝트 지침을 따른다. 스킬은 목적과 적용 조건에 맞을 때만 사용하며, 같은 책임과 검증을 중복 수행하지 않는다.

## 프로젝트 스킬

| 요청 이름 | 실제 스킬 | 적용 범위 |
| --- | --- | --- |
| Attention Span | [attention-kind](.agents/skills/attention-kind/SKILL.md) | 사용자가 Attention-kind 스타일을 명시적으로 요청한 대화. 원본의 명시 호출 제한을 유지한다. 평소 설명 원칙은 Agent.md를 따른다. |
| Andrej Karpathy Skills | [karpathy-guidelines](.agents/skills/karpathy-guidelines/SKILL.md) | 코드 작성·수정·리뷰·리팩터링 |
| Anti Slop | [install-anti-slop](.agents/skills/install-anti-slop/SKILL.md) | JavaScript/TypeScript 프로젝트에서 Anti Slop/Oxlint 도입·설정·업데이트가 필요할 때. Kotlin 정적 분석에는 적용하지 않는다. |
| Verification Before Completion | [verification-before-completion](.agents/skills/verification-before-completion/SKILL.md) | 성공·해결·완료를 주장하기 전 변경에 맞는 실제 검증 |
| Golden Path | [golden-path, 한국어](.agents/skills/golden-path/SKILL.md) | 현재 개발 기준과 실제 사용 스킬의 정리·확인·갱신 요청 |

Golden Path 문서는 `docs/GOLDEN_PATH.md`에 둔다. 일반 개발의 상시 참조나 필수 선행 절차로 삼지 않는다. 사용자가 명시적으로 요청한 반영은 재확인하지 않는다.

스킬 원본·커밋·라이선스는 각 스킬의 `UPSTREAM.md`에 기록한다. 추가 전에 실제 이름·별칭·출처를 확인하고 이미 설치한 스킬을 중복 설치하지 않는다.

## 요구사항과 ENV

- 기능 범위·화면 동작을 정리하거나 구현할 때 관련 [요구사항](docs/REQUIREMENTS.md)을 확인한다.
- 환경변수·암호화·데이터 경로·포트 작업에는 [공통 ENV 관리 지침](docs/ENV_GUIDELINES.md)을 따른다.
- 실설정값은 SOPS + age 암호화 원본으로 관리한다. 평문 값과 개인키를 문서·코드·Git·도구 출력에 넣지 않는다.
