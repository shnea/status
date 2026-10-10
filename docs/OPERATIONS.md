# Linux/NAS 운영 실행과 복구

운영 환경은 AMD64 Linux/NAS의 Docker Compose이며 Docker 24.0.2·docker-compose v2.20.1을 사용한다. 2026-10-11에 최소 실행 파일과 SOPS 암호화 ENV를 배치하고 레지스트리 이미지 Pull/Up으로 운영 기동을 확인했다. 실제 설정값은 암호화 ENV에서 관리한다.

## 실행 구성

같은 `compose.yml`에서 ENV의 `COMPOSE_PROFILES`로 실행 방식을 선택한다.

| 환경 | 프로필 | 실행 |
| --- | --- | --- |
| local / dev | development | 소스 마운트, Gradle bootRun, Next.js 개발 서버, 별도 테스트 DB |
| prod | runtime | 검증한 실행 JAR·Next.js standalone·PDF 이미지, PostgreSQL, Nginx |
| 검사 / 빌드 / 운영 도구 | checks / package / ops | 명시적으로 지정한 일회성 서비스 |

runtime은 `db`·`backend-runtime`·`frontend-runtime`·`pdf-runtime`·`nginx-runtime` 다섯 서비스를 시작한다. 앱에는 소스·개발 캐시·테스트 DB 설정을 마운트하지 않는다. 세 앱은 비루트 사용자로 실행하며 각 서비스는 상태 검사와 재시작 정책을 갖는다. PDF·백엔드·프런트엔드 포트는 컨테이너 네트워크 내부에서만 접근한다.

development와 runtime을 동시에 켜지 않는다. 같은 Docker 호스트에 여러 환경을 둘 때는 서로 다른 `COMPOSE_PROJECT_NAME`을 사용하고 데이터 디렉터리·포트도 분리한다. [Docker 프로필 동작](https://docs.docker.com/compose/how-tos/profiles/)에 따라 명시적 `--profile`을 사용할 때는 필요한 프로필을 모두 지정한다.

## 실행 파일과 배포

공통 기준은 [ENV 관리 지침](ENV_GUIDELINES.md)을 따른다. 각 프로젝트에 스크립트를 복사하는 구조이며 중앙 OPS나 ops.json은 사용하지 않는다. 상태창의 scripts/project.conf에는 서비스·프로필·필수 변수명·운영 파일 목록만 둔다.

로컬 소스가 있는 PC에서 Build/Push한다. .env.prod의 이미지 이름을 레지스트리의 릴리스 태그로 지정하고 레지스트리 로그인을 준비한다. DB 경로 등 운영 서버의 경로는 로컬 빌드 시 존재할 필요가 없다. Build 실패 후 Push하지 않는다.

```powershell
# Windows 개발 PC
pwsh -NoProfile -File scripts/env.ps1 encrypt -Environment prod
pwsh -NoProfile -File scripts/build.ps1 build-push -Environment prod
pwsh -NoProfile -File scripts/export-runtime.ps1 -EnvMode sops
```

```sh
# Linux / macOS 개발 PC
sh scripts/env.sh encrypt prod
sh scripts/build.sh build-push prod
sh scripts/export-runtime.sh sops
```

개별 build와 push도 가능하다. Apple Silicon Mac에서도 AMD NAS용 이미지를 만들도록 package 서비스의 APP_IMAGE_PLATFORM 기본값은 linux/amd64다. 다른 대상 CPU는 ENV에서 변경한다. Mac 자체에서 전체 이미지를 빌드한 검증은 아직 수행하지 않았다.

export-runtime은 .runtime/ 아래 새 배치 폴더를 준비하며 서버에 전송하거나 기존 서버 파일을 삭제하지 않는다. -EnvMode plain / sh scripts/export-runtime.sh plain은 이미 준비된 평문을 보호하여 포함한다. none은 실제 ENV 없이 공개 실행 파일만 준비한다. sops는 암호화 원본·수신자 정책·env.sh를 추가한다. 소스·테스트·빌드 스크립트·개인키·실제 데이터는 어떤 모드에도 포함하지 않는다.

공통 운영 파일은 compose.yml, infra/nginx/default.conf, infra/postgres/backup.sh, infra/postgres/restore-check.sh와 scripts/project.conf, common.sh, docker.sh, deploy.sh다. 스크립트는 현재 NAS에 맞는 sh 파일만 배치한다.

배치한 파일을 운영 설정 디렉터리에 전달한 뒤 **서버에서** 실행한다. 아래 명령은 실제 운영 변경을 수행한다.

```sh
# 서버에서 SOPS 복호화: 암호화 원본·SOPS·프로젝트 밖 age 개인키 필요
sh scripts/deploy.sh prod sops

# 또는 이미 준비된 .env.prod로 실행: 실행만 한다면 SOPS·키 불필요
sh scripts/deploy.sh prod plain

sh scripts/docker.sh status prod
sh scripts/docker.sh logs prod
```

deploy는 선택한 ENV 방식으로 준비 → 검증 → Pull → up -d --no-build --wait 순서로 실행한다. 준비·검증·Pull 실패 시 Up하지 않는다. Docker Compose v2 플러그인과 NAS의 docker-compose v2를 모두 지원하며 서버에 Python/jq를 요구하지 않는다.

SOPS 방식에서는 .env.prod.sops.env와 .sops.yaml, env.sh를 함께 배치하고 기존 서버의 SOPS·프로젝트 밖 개인키를 연결한다. 서버에서 평문을 편집한 경우 env.sh encrypt prod로 암호화 원본에 반영하고 그 암호화 파일만 저장소에 가져온다. plain 방식을 선택하면 준비된 .env.prod를 사용하고 서버에서 SOPS 처리할 필요가 없다.

최초 관리자 두 값은 함께 비우거나 함께 지정한다. 가입 후 확인한 issuer·subject를 암호화 원본에 반영하고 백엔드를 재생성한다. 실제 DB와 백업 경로는 운영 ENV로 지정하며 기존 디렉터리 존재를 검사한다.

운영 설정은 사용자가 지정한 /volume1/docker/prod/status에, DB·백업은 /volume2/homes/status의 용도별 디렉터리에 배치했다. 서버 SOPS 복호화 방식을 적용했으며 기존 운영 서버 키와 관리자 키를 수신자로 사용한다. 실행용 ENV는 0600, DB·백업 디렉터리는 0700으로 제한한다. 가입 후 사용자가 지정한 관리자 식별자 두 값을 암호화 원본과 운영 백엔드에 반영하고 활성 운영 계정과의 일치를 확인했다. 경로 검사도 배포 사용자가 PostgreSQL 소유의 0700 디렉터리에 들어가지 않고 백업 경로의 포함 여부를 확인한다.

외부 Nginx는 HTTPS 원점의 Host·프로토콜을 앱의 호스트 포트로 전달한다. 외부 프록시의 파일 요청 한도는 앱 요청 한도 12MiB 이상으로 설정한다. 브라우저 원점과 OIDC 등록 주소가 일치해야 한다. 내부 Nginx는 Docker DNS를 조회해 컨테이너 주소 변경을 반영하므로 `resolve`를 지원하는 Nginx 1.27.3 이상을 사용한다.

아래 백업 명령의 `docker compose`는 NAS 설치에 따라 `docker-compose`로 실행할 수 있다.
## DB 백업

`BACKUP_DIR`를 준비한 뒤 실행한다. 파일은 UTC 시각과 임의 접미사로 구분하며 완료된 custom archive와 SHA-256 파일만 게시한다. 작성 실패 시 임시 파일을 정리하고 기존 백업을 덮어쓰지 않는다. 생성 파일은 NAS의 ACL 상속에도 0600이 적용되도록 게시 직전에 chmod로 권한을 명시한다.

```sh
docker compose --env-file .env.prod --profile ops run --rm --no-deps db-backup
```

[pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)는 실행 중인 DB에서도 일관된 스냅샷을 생성한다. 백업 범위는 상태창 DB의 스키마·자료이며 전역 역할·비밀번호·플랫폼의 실제 첨부 바이너리·AI 컬렉션을 포함하지 않는다. 운영 ENV는 SOPS 원본, age 개인키는 별도 보호 백업으로 관리한다. 첨부는 플랫폼 저장소의 백업 정책도 확인한다.

DB 백업의 자동 일정·보존 기간·외부 저장소 복제는 아직 정하지 않았다. 미사용 첨부의 7일 삭제 정책은 DB 백업 보존 기간에 적용하지 않는다. 오래된 DB를 복구하면 이후 삭제된 플랫폼 파일을 자동으로 되살릴 수 없다.

## 복구 검사

백업 명령이 출력한 파일명만 `BACKUP_FILE`로 전달한다.

```sh
docker compose --env-file .env.prod --profile ops run --rm --no-deps \
  -e BACKUP_FILE=status-20261011T000000Z-example.dump db-restore-check
```

검사는 네트워크·호스트 포트·영구 DB 볼륨이 없는 별도 컨테이너에서 실행한다. SHA-256이 일치하는 경우에만 임시 PostgreSQL에 [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)를 단일 트랜잭션으로 실행하고 마이그레이션·포트폴리오 소유권·계정당 한 개·다섯 디자인 사전과 자료 수를 검사한다. 컨테이너가 종료되면 임시 DB는 사라진다. 실행 중인 앱 DB에 연결해 덮어쓰는 명령이 아니다.

실제 장애 복구는 검사를 통과한 백업을 **새 빈 DB 디렉터리**에 복구하고 검수한 뒤 운영 ENV의 대상 경로를 전환하는 순서로 진행한다. 기존 데이터 디렉터리는 그대로 보존하고, 앱을 먼저 시작해 빈 DB에 자동 마이그레이션하지 않는다. 복구 대상·DB명·백업 파일을 확인한 뒤 pg_restore를 수행한다. 복구한 과거 로그인 세션은 폐기하고 관리자·공개 상태·첨부 접근을 확인한 뒤 앱을 재개한다. AI는 플랫폼의 기존 작업 상태를 확인한 뒤 관리자 전체 재색인으로 현재 공개본을 다시 반영한다.

이미지 교체 전에도 백업을 생성한다. 스키마가 바뀐 이후에는 이전 이미지만 되돌리는 방식이 가능한지 확인해야 하며, 불가능하면 새 DB 복구 방식으로 전환한다.

## 격리된 개발 PC 검사

```powershell
pwsh -NoProfile -File scripts/test-operations.ps1
```

검사 스크립트는 실제 설정을 읽지 않고 새로운 Docker 프로젝트·검사 DB·가상 연결 값을 생성한다. 개발 DB/Nginx 컨테이너에서는 검증한 이미지 이름만 조회한다. 소스 없이 최소 운영 파일만 배치해 다섯 서비스의 상태 검사·Nginx 경유 화면·다섯 템플릿·내부 PDF를 확인한다. 한글 초안·숨긴 항목·공개본·파일 참조·과거 주소·업로드 재시도 자료와 공용 스킬을 백업하고 별도 임시 DB에서 복구한다. 연속 백업의 중복 방지·손상 파일 거절·원본 검사 DB 보존도 확인한다. 생성한 검사 프로젝트의 컨테이너·볼륨·네트워크만 정리한다.

실행/ENV 스크립트의 Windows 검증은 scripts/test-env-scripts.ps1, POSIX 검증은 Docker에서 infra/checks/env-scripts.py로 수행한다. 가상 ENV·임시 age 키·Compose 모의 응답으로 SOPS 왕복·실패 시 보존·권한·관리자 쌍·데이터 경로·Build/Push 순서·운영 --no-build·두 ENV 모드·최소 배치 목록을 확인한다. macOS의 shasum 대체 경로는 Docker에서 검증했으며 실제 Mac 실행은 아직 확인하지 않았다. 실제 앱 실행·백업·복구는 위 프로젝트 검사로 구분한다.

## 적용된 운영 배포

2026-10-11 적용한 릴리스는 `release-20261010T202304Z-9b6d5aa4`다. 세 앱 이미지는 `registry.shnea.kr/status-backend`, `status-frontend`, `status-pdf`에서 동일 릴리스 태그로 Pull했다. 로컬 Docker의 이미지 ID와 레지스트리의 플랫폼별 config digest 표시는 다를 수 있으므로 실제 서버 이미지 ID는 레지스트리의 AMD64 manifest config digest와 대조했다.

다섯 운영 서비스의 상태 검사, HTTPS 홈페이지·정적 리소스·샘플 화면, 운영 OIDC realm·콜백·PKCE·보안 쿠키, 익명 사용자에게 작성/관리 API 차단, 운영 원점의 robots/sitemap을 확인했다. 운영 플랫폼의 연결 환경·파일 권한·명시적 장기 보존 정책도 확인했다.

초기 DB 백업을 생성하고 네트워크 없는 임시 PostgreSQL에서 복구하여 10개 마이그레이션을 확인했다. 복구 검사는 운영 DB에 쓰지 않는다. OIDC 로그인 진입을 자동 검증했고 운영 DB에서도 회원과 계정당 한 개 포트폴리오의 생성이 확인됐다. 가입 후 지정한 슈퍼관리자 식별자를 운영 백엔드에 적용했으며 실제 활성 회원과 설정의 일치를 값 노출 없이 확인했다.

서버에는 운영용 Compose·참조 infra 파일·필수 sh 스크립트·암호화 원본·수신자 정책·보호된 실행용 ENV만 배치했다. 소스·빌드 스크립트·테스트·Git·이미지 tar 파일을 서버에 두지 않는다.
