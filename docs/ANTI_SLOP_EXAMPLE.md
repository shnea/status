# Anti Slop 실행 예제

Anti Slop은 JavaScript·TypeScript 코드를 Oxlint 규칙으로 검사한다. 설치 스킬은 플러그인과 설정을 구성하고, 실제 검사는 lint 명령이 수행한다. 이 프로젝트에서는 프런트엔드에 적용하며 Kotlin 백엔드는 검사 대상이 아니다.

## 예제: 대표 스킬의 이름 가져오기

입력:

```ts
const skills = [
  { name: "Kotlin", featured: true },
  { name: "Java", featured: false },
  { name: "PostgreSQL", featured: true },
];
```

수정 전:

```ts
const names = skills.filter((skill) => skill.featured).map((skill) => skill.name);
```

활성화한 `anti-slop/no-array-filter-map` 규칙은 연속 배열 처리를 지적한다. 실제 진단:

```text
error anti-slop(no-array-filter-map):
Avoid consecutive array `filter` and `map` passes.
```

수정 후:

```ts
const names = skills.flatMap((skill) => (skill.featured ? [skill.name] : []));
```

이 입력과 부작용 없는 콜백에서는 결과를 유지하면서 중간 필터 배열과 연속 처리를 없앤다. 무조건 성능이 빨라진다는 뜻은 아니다. 인덱스 사용, 부작용, 콜백 실행 순서에 의존하는 다른 코드는 별도로 검토해야 한다.

두 코드의 실제 실행 결과:

```text
[ 'Kotlin', 'PostgreSQL' ]
```

## 프로젝트에서 사용하기

저장소 루트에서:

```powershell
Set-Location frontend
npm run demo:anti-slop
npm run lint
npm run typecheck
```

실행 가능한 예제는 [frontend/examples/anti-slop.ts](../frontend/examples/anti-slop.ts)에 있다. 검사 규칙은 [frontend/.oxlintrc.json](../frontend/.oxlintrc.json), 출처는 [플러그인 UPSTREAM.md](../frontend/tools/oxlint/anti-slop/UPSTREAM.md)에 기록한다.

검증 결과:

- 수정 전 예제: `no-array-filter-map` 오류, 종료 코드 1.
- 수정 후 예제: 오류 없음, 종료 코드 0.
- 실행 결과: 수정 전·후 모두 `Kotlin`, `PostgreSQL`.
- 현재 프런트엔드 전체 lint·typecheck 및 예제 실행: 종료 코드 0.

실패하는 코드는 문서에 설명용으로 두고, 실제 예제 파일은 통과하는 수정 후 코드로 유지한다.

## 적용 범위

불필요한 배열 누적 복사, 근거 없는 연속 타입 단언, 모호한 타입, 일부 읽기 어려운 패턴 등을 검출한다. 규칙은 [원작자의 취향을 반영한 프로젝트 기준](https://github.com/dmmulroy/anti-slop)이며 보편적인 정답은 아니다.

서비스 동작·권한·보안·파일 분리의 적절성을 모두 판단하지는 않는다. 한 파일에 기능을 과도하게 몰아넣는 문제는 [Agent.md의 소스 구조 기준](../Agent.md#소스-구조와-분리-기준)으로 별도 검토한다.
