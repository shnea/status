# Golden Path

## 개발 기준

| 항목 | 적용 기준 |
| --- | --- |
| 백엔드 프레임워크 | Spring Boot |
| 백엔드 개발 언어 | Kotlin |
| 프런트엔드 | Next.js App Router·React·TypeScript. 공개 페이지는 검색 가능한 HTML을 제공하고 편집·상세 열기에는 클라이언트 기능을 사용한다. |
| DB·스키마 관리 | PostgreSQL·Flyway. 본문과 공개 스냅샷의 구조화 데이터에는 JSONB를 사용할 수 있다. |
| 인증·세션 | Spring Security OIDC Authorization Code + PKCE. 서버 세션을 Spring Session JDBC로 DB에 저장하고 HttpOnly 쿠키를 사용한다. |
| PDF 생성 | Playwright Chromium과 A4 인쇄 전용 화면. 출력 대상·권한·버전은 Spring Boot에서 검증한다. |
| 언어·런타임·프레임워크 버전 | Spring Boot 4.1.1·Kotlin 2.3.21·JDK 17·Gradle 9.7.1. Next.js 16.4.0·React 19.3.0·TypeScript 7.0.2·Node.js 24·PostgreSQL 17. 패키지는 lockfile과 Gradle Wrapper로 고정하고 버전 변경 시 호환성을 검증한다. |
| 빌드 도구·의존성 관리 | 백엔드 Gradle Kotlin DSL·Gradle Wrapper, 프런트엔드 npm·package-lock.json. |
| 제품 소스·모듈 구조 | 단일 저장소의 frontend/·backend/·infra/·scripts/·docs/. 제품 내부는 기능별로 모으고 백엔드는 하나의 Spring Boot 애플리케이션으로 시작한다. |
| 명명 규칙 | Kotlin·TypeScript 식별자는 camelCase, 타입·컴포넌트는 PascalCase, DB 테이블·컬럼은 snake_case. 프레임워크의 파일·라우팅 규칙은 유지한다. |
| Kotlin 코드 작성 규칙 | [Agent.md의 Kotlin 지침](../Agent.md#kotlin)을 따른다. |
| 검증 규칙 | [Agent.md의 Verification Before Completion 지침](../Agent.md#verification-before-completion)을 따른다. |
| 기존 코드 제약 | 기존 Java 프로젝트를 Kotlin으로 임의 변환하지 않는다. |
| 개발·테스트 실행 | 프런트엔드·Spring Boot·PostgreSQL을 Docker Compose로 실행한다. 개발 서버·빌드·lint·타입 검사·통합 테스트도 컨테이너 안에서 수행하며 실제 PostgreSQL을 사용한다. |
| 환경 구분 | local / dev / prod. 동일 Compose와 명시적인 ENV 선택. |
| ENV·키 관리 | [공통 ENV 관리 지침](ENV_GUIDELINES.md). 실설정값은 SOPS + age 암호화 원본으로 관리하며 개인키 보관은 해당 지침을 따른다. |
| 관리자 초기 설정 | ADMIN_OIDC_ISSUER와 ADMIN_OIDC_SUBJECT는 최초 가입 전 둘 다 빈 값 허용. 한쪽만 비어 있으면 오류. 둘 다 일치하는 단일 계정만 관리자. |
| 포트 배정 | Nginx가 접근하는 앱의 첫 호스트 노출 포트 30165. 필요한 추가 노출 포트는 30166부터 1씩 증가. |
| UI 구성 | 작성·관리 화면은 Swiss Editorial 고정. 공개 템플릿의 레이아웃·컴포넌트·CSS Modules는 서로 격리. 글로벌 스타일은 필요한 초기화·폰트에 한정한다. |
| 소스 분리 기준 | [Agent.md의 소스 구조 지침](../Agent.md#소스-구조와-분리-기준). 관련 기능은 모으고 책임이 섞일 때 분리하며 줄 수만 맞추는 분리·불필요한 추상화는 피한다. |
| 스킬 아이콘 | Simple Icons 목록·CDN, Lucide 기본 아이콘, 자동 약자 배지. 기능 정책은 [요구사항](REQUIREMENTS.md#6-스킬)에 둔다. |
| 연동 | OIDC·에디터·파일·AI는 SHNEA 플랫폼의 공개 연동 계약을 사용하며 사용자별 권한·데이터 소유권은 상태창 서버가 검사. |
| Git 원격 | https://github.com/shnea/status.git |

## 개발에 사용한 스킬

| 스킬명 | 역할 설명 |
| --- | --- |
| golden-path | 프로젝트의 기술·구조·작업 기준을 사람이 확인할 수 있도록 정리한다. |
| verification-before-completion | 문서·구현 변경의 실제 검증 결과를 확인한 뒤 완료를 보고한다. |
| karpathy-guidelines | 로그인·포트폴리오·관리자 코드를 작성하며 필요한 책임만 분리하고 검증 가능한 범위로 구현한다. |
| install-anti-slop | 프런트엔드에 Anti Slop/Oxlint 규칙을 설치·구성하고 자동 수정과 포맷의 안정성을 검증한다. |
