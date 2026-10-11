# Docker 개발 실행

같은 Compose의 `development` 프로필은 개발 실행, `runtime`은 패키지 이미지 실행, `package`는 이미지 빌드에 사용한다. local/dev는 development, prod는 runtime을 지정한다. 공통 기준은 [ENV 관리 지침](ENV_GUIDELINES.md), 운영 절차는 [운영 안내](OPERATIONS.md)를 따른다. 프로젝트 스크립트는 scripts/에 두며 공개 서비스·파일 목록은 scripts/project.conf에서 관리한다.

## 시작

Docker Desktop/Engine와 Compose v2를 사용한다. Windows 스크립트는 PowerShell 7(pwsh), Linux/NAS·macOS 스크립트는 POSIX sh에서 실행한다. 암호화/복호화에는 SOPS가 필요하고 키 생성에만 age-keygen이 필요하다. macOS에서도 동일한 .sh 파일을 사용하며 추가 Python/jq 설치는 필요 없다.

암호화 원본을 복호화하거나 이미 준비된 평문 ENV로 실행한다. 기존 평문을 수정했다면 먼저 encrypt하여 변경을 보존한다.

```powershell
# Windows
pwsh -NoProfile -File scripts/env.ps1 decrypt -Environment local
pwsh -NoProfile -File scripts/docker.ps1 validate -Environment local
pwsh -NoProfile -File scripts/docker.ps1 up -Environment local
pwsh -NoProfile -File scripts/docker.ps1 logs -Environment local
```

```sh
# Linux / macOS
sh scripts/env.sh decrypt local
sh scripts/docker.sh validate local
sh scripts/docker.sh up local
sh scripts/docker.sh logs local
```

PROJECT_SOURCE_DIR와 DB_DATA_DIR는 기존 절대 디렉터리여야 한다. .env.local의 개발 도메인·데이터 경로·플랫폼 값은 그대로 사용한다. 프런트엔드·Spring Boot·PostgreSQL·Nginx·PDF 생성기는 Docker에서 실행된다. PDF 생성기는 추가 외부 포트를 열지 않는다.

## ENV 수정 반영

env 스크립트는 필수값·공개 원점·관리자 쌍·환경 프로필을 확인한다. encrypt는 암호화 원본, decrypt는 보호된 실행용 평문을 교체하며 실패 시 기존 파일을 보존한다. check와 docker validate는 실행 호스트의 데이터 경로와 Compose도 검사한다. 같은 이름의 셸 변수로 파일 설정을 덮어쓰면 중단한다.

이 Windows PC에서는 기존 .runtime/tools/sops.exe와 Git에서 제외한 키 위치 포인터를 재사용한다. 별도 중앙 OPS 설치는 사용하지 않는다. 다른 PC는 SOPS를 PATH에 설치하거나 -Sops로 지정하고, 프로젝트 밖 개인키를 SOPS_AGE_KEY_FILE로 연결한다. Linux/macOS에서는 필요하면 SOPS_BIN으로 실행 경로를 지정한다. 개인키와 실제 키 경로를 문서에 기록하지 않는다.

```powershell
pwsh -NoProfile -File scripts/env.ps1 encrypt -Environment local
pwsh -NoProfile -File scripts/docker.ps1 up -Environment local -Service backend,frontend,nginx
```

```sh
sh scripts/env.sh encrypt local
sh scripts/docker.sh up local backend frontend nginx
```

Compose up은 ENV 변경이 있는 서비스를 재생성한다. 관리자 식별자 변경은 백엔드에 적용하며 기존 세션도 다음 API 요청부터 현재 관리자 설정을 확인한다. 개발 소스 변경은 기존 개발 서버의 감지 방식으로 반영한다.

## 검사

개발 서버가 실행 중일 때 다음 명령을 사용한다. Gradle 검사는 실행 백엔드 안에서 수행해 다른 컨테이너 사이의 공유 캐시 잠금 충돌을 피한다. 통합 테스트는 실제 PostgreSQL의 별도 `status_test` DB만 사용하며 애플리케이션 DB를 초기화하지 않는다. development의 db-test-init이 기존 DB 디렉터리에서도 status_test의 존재만 확인하고 없을 때 생성한다. runtime은 이 서비스를 실행하지 않는다.

```powershell
docker compose --env-file .env.local exec -T backend sh ./gradlew --no-daemon test
docker compose --env-file .env.local --profile checks run --rm --no-deps frontend-check
docker compose --env-file .env.local --profile checks run --rm --no-deps browser-check
```

`frontend-check`는 소스를 읽기 전용으로 복사해 lint·타입·포맷·배포 빌드를 수행한다. 실행 중인 개발 서버의 `.next`를 공유하지 않는다. `browser-check`는 프런트와 API 준비를 확인한 뒤 Docker Chromium에서 실제 개발 원점의 로그인 진입·실패 콜백·익명 접근·사이트맵과 작성/관리 UI를 PC·모바일 크기로 검사한다. UI 모의 응답과 실제 서버 권한 검증은 테스트에 명시한다.

브라우저 산출물은 Git에서 제외한 `.runtime/browser-check/`에 저장한다. OIDC 코드·세션 토큰을 기록하지 않도록 trace·video를 사용하지 않는다. 실제 계정 입력·정상 로그인·로그아웃은 해당 사용자의 브라우저로도 확인한다.

## 로그인 세션과 샘플 템플릿

로그인된 사용자의 시작하기·플랫폼 로그인 링크는 기존 세션으로 작성 화면에 바로 연결한다. 익명 사용자만 OIDC 인증을 시작한다. 동시 요청이 같은 세션 속성을 추가하는 경우를 위해 Spring Session의 PostgreSQL 전용 저장 설정을 사용한다. [공식 세션 SQL 설정](https://docs.spring.io/spring-session/reference/configuration/jdbc.html#customizing-the-sql-queries)에 따른 설정이며 계정·스킬·공유 주소의 실제 중복 검사는 유지한다.

메인의 샘플 포트폴리오 보기는 `/design-preview`에서 공개 선택 가능한 템플릿을 표시한다. 현재 다섯 디자인을 구현했으며, 관리자가 신규 선택을 허용한 디자인의 축소 화면도 실제 샘플 페이지로 렌더링한다. 선택하면 전체 샘플을 열고 목록으로 돌아갈 수 있다.

## 실제 플랫폼 파일 검사

개발 플랫폼 연결·파일 읽기/쓰기/삭제 권한·명시적 장기 보존 정책이 준비된 경우에만 다음 opt-in 검사를 실행한다. 격리된 테스트 DB와 실제 개발 플랫폼을 사용하며 유효한 이미지 한 개를 만들고 finally에서 해당 파일만 삭제한다. 실제 사용자 파일이나 애플리케이션 DB를 초기화하지 않는다. 플랫폼 처리 대기와 요청 지연 때문에 기본 테스트에서는 자동 실행하지 않는다.

```powershell
docker compose --env-file .env.local exec -e RUN_PLATFORM_FILE_TEST=true -T backend sh ./gradlew --no-daemon test --tests '*actualPlatformImageUploadAndRevokedPublicFileAccess'
```

## 개발 도메인

외부 Nginx는 앱 호스트 포트로 연결하고 원래 Host와 HTTPS 프로토콜을 전달한다. 콜백·로그아웃 주소는 플랫폼 등록값과 일치해야 한다. Next.js 개발 리소스는 `APP_PUBLIC_URL`의 호스트를 [allowedDevOrigins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins)로 허용한다.

Windows 바인드 마운트에서 새 파일이 바로 감지되지 않으면 프런트엔드를 재시작한다. 내부 Nginx는 Docker DNS를 주기적으로 다시 조회하므로 앱 컨테이너의 주소 변경에 별도 재시작 없이 대응한다. 격리된 주소 교체 검사는 `scripts/test-proxy-dns.ps1`로 실행한다.
공개 첨부의 GET/HEAD(`views`, `content`, `hls`)와 사이트 공유 이미지 GET/HEAD는 Nginx에서 Cookie를 전달하지 않는다. 이 요청은 현재 공개본·파일 소유권·숨김·이용정지를 백엔드에서 검사하며 로그인 상태에 의존하지 않는다. 로그인·작성·AI 대화·방문 통계 등 나머지 요청은 기존 세션과 CSRF 처리를 유지한다. 세션 쿠키가 있는 공개 방문에서도 이미지 요청들이 같은 DB 세션 갱신을 기다리지 않도록 한 설정이다.

공개 파일의 쿠키 분리, 로그인 경로의 쿠키 유지, CSRF 헤더·Range·no-store 응답 검사는 실제 Nginx와 가상 HTTP 서버를 쓰는 격리 Docker 검사로 확인한다. 실제 ENV·계정·파일 서비스는 사용하지 않는다.

```powershell
pwsh -NoProfile -File scripts/test-public-file-proxy.ps1
```

```powershell
docker compose --env-file .env.local restart frontend
```

## PDF 및 공개 AI 화면 검사

```powershell
docker compose --env-file .env.local --profile checks run --rm --build pdf-check
docker compose --env-file .env.local --profile checks run --rm ai-check
```

`pdf-check`는 실제 인쇄 화면과 Chromium 생성기를 사용하며 격리된 문서·파일 응답으로 출력 권한과 A4·한글·이미지·링크를 확인한다. Poppler로 모든 페이지를 렌더링한 PNG와 PDF는 `.runtime/browser-check/pdf/`에 저장한다. PDF 파일은 검증용 자료이며 실제 사용자 출력 결과로 간주하지 않는다.

`ai-check`는 별도 Next.js와 응답 서버에서 실제 공개 컴포넌트를 검수한다. 다섯 템플릿의 PC 배경 클릭·스크롤·키보드 조작과 모바일 전체 화면, 대화·근거 링크·이동/재로드 시 대화와 입력 복원·동일 요청의 상태 복구·취소 경합·권한 철회를 확인한다. 마크다운 서식과 긴 코드의 가로 스크롤, 포트폴리오/방문 세션별 저장 격리 및 손상된 저장값도 검사하고, 실제 모델 실행 및 서버 격리는 별도 검사로 구분한다.

## 실제 플랫폼 AI 검사

개발 플랫폼의 색인 쓰기·읽기·검색·AI 실행·작업 조회 권한과 실제 모델 연결이 준비되어야 한다. 인공 자료 한 건의 임시 컬렉션을 새로 만들고 finally에서 해당 컬렉션만 비운다. 실제 임베딩과 답변을 실행하므로 기본 검사에서는 자동 실행하지 않는다. 연결 설정 존재와 실제 실행 통과는 구분한다.

```powershell
docker compose --env-file .env.local exec -e RUN_PLATFORM_AI_TEST=true -T backend sh ./gradlew --no-daemon test --tests '*actualPlatformIndexSearchAndAnswerUseOneIsolatedGeneration'
```

응답 유실 시 새 요청 ID로 자동 모델 재실행하지 않는다. 관리자 AI 관리의 접수 확인은 기존 플랫폼 작업을 조회해 복구하며, 최근 조회 범위를 벗어나면 플랫폼에서 기존 작업을 확인해야 한다. AI 입력·대화 전문·원격 오류 원문·키는 운영 기록에 보관하지 않는다.
## 본문 파일 및 영상 검사

브라우저 검사 컨테이너는 FFmpeg로 2초 영상·HLS 목록/조각·WAV를 만들고, 생성한 PDF·Markdown과 함께 실제 플레이어·미리보기를 확인한다. 파일은 `.runtime/browser-check/media/`에 저장하며 사용자 파일을 읽거나 변경하지 않는다. `browser-check`를 한 번 실행하면 백엔드 컨테이너에도 같은 검사 자료가 읽기 전용으로 연결된다.

```powershell
docker compose --env-file .env.local --profile checks run --rm --build browser-check
docker compose --env-file .env.local exec -T -e RUN_PLATFORM_MEDIA_TEST=1 backend sh ./gradlew --no-daemon test --tests kr.shnea.status.PlatformMediaTests
```

두 번째 명령은 실제 개발 플랫폼에 작은 가상 PDF·WAV·Markdown·MP4를 PRIVATE로 업로드하고 보기·원본 해시·HLS를 검사한 뒤 생성한 파일만 삭제한다. 영상 변환을 실행하므로 기본 검사에서는 건너뛴다. 본문 영상은 플랫폼 외부 iframe 대신 hls.js 1.7.3과 상태창의 같은 출처 중계를 사용한다. 재생 목록의 경로와 자막/영상 조각도 같은 파일 안으로 제한하고 매 요청에서 현재 소유권 또는 공개 범위를 확인한다.

이미지와 일반 첨부의 관리자 설정 한도는 현재 Nginx·Spring 전송 한도에 맞춰 1~10MiB다. 사용자별 총용량 할당은 구현하지 않았다. 서비스 이름·공지·기본 공유 이미지는 관리자 시스템 설정에서 변경하고 키·OIDC 식별자는 암호화 ENV로 관리한다.

## 패키지 이미지와 초기 실행 검사

개발 DB가 실행 중인 상태에서 프로젝트 루트에서 실행한다.

```powershell
pwsh -NoProfile -File scripts/build.ps1 build -Environment local
pwsh -NoProfile -File scripts/test-images.ps1
```

이미지는 로컬의 `status-backend:local`·`status-frontend:local`·`status-pdf:local` 태그로 만들어진다. 백엔드는 실행 JAR, 프런트엔드는 Next.js standalone 결과물을 사용하고 세 이미지 모두 비루트 사용자로 실행한다. 플랫폼 키와 실행 ENV는 빌드 인자로 전달하지 않는다. `package` 서비스는 이미지 빌드용이며 개발 서비스 대신 실행하는 배포 구성이 아니다.

검사 스크립트는 개발 DB 컨테이너 `status-db-1`에서 PostgreSQL 이미지 이름만 읽는다. 새로운 사설 네트워크와 `status_image_test` DB를 만들고 가상 설정으로 백엔드의 초기 마이그레이션·기동·익명 권한을 확인한다. 프런트엔드의 운영 서버·런타임 공개 설정 변경·공유 이미지·미리보기 noindex와 PDF 생성기의 보호 문서 출력을 검사한다. 실제 플랫폼 키나 사용자 자료는 읽지 않고 생성한 컨테이너 ID·볼륨·네트워크만 정리한다. 실제 운영 OIDC 로그인과 운영 배포 검증은 별도다.

## 공용 아이콘과 미사용 첨부

실행 시 저장소의 Simple Icons 전체 목록을 아이콘 목록과 검색 가능한 공용 스킬에 추가한다. 이미 같은 이름의 공용 스킬이 있으면 수정하거나 재활성화하지 않는다. 기존 기본 기술은 언어·백엔드 등 기존 분류를 유지하고 나머지는 브랜드 · 도구로 시작한다. 개인 스킬의 같은 이름 우선 표시와 기존 프로젝트 연결은 유지된다. 검색 결과는 30개씩 조회한다.

관리자 스킬 사전의 **아이콘 추가**에서 Simple Icons 식별자·이름·원본 HEX 색상을 입력할 수 있다. 서버가 고정 CDN의 SVG 존재를 확인하고 목록과 변경 기록에 추가한다. 이미 있는 식별자는 중복 등록하지 않는다. 임의 URL·SVG 업로드는 받지 않으며 아이콘 선택을 생략하거나 로딩에 실패하면 스킬 약자를 표시한다.

시스템 설정의 **미사용 첨부 후보**는 초안의 숨긴 항목·저장된 공개본·기본 공유 이미지가 참조하는 파일을 제외하고 삭제 예정 시각과 재시도 상태를 표시한다. 후보 조회는 읽기 전용이다.

사용자가 승인한 정책에 따라 어디에도 참조되지 않은 상태가 7일간 유지된 파일만 자동 삭제한다. 예약 작업은 매분 최대 50개 파일을 순환 검사하고 최대 5개 삭제 작업을 처리한다. 기존 파일도 최초 미참조 확인부터 대기하며 업로드 날짜로 소급하지 않는다. 참조 저장 시 대기 시간을 초기화한다. 삭제 직전에 회원·포트폴리오·공유 이미지 변경과 잠금을 맞춰 다시 검사하고, 삭제 시작 이후 새 참조와 이전 업로드 요청으로 되살리는 것을 차단한다.

파일 서비스 실패는 15분 뒤 존재 여부를 확인한 후 재시도한다. HTTP 404만으로 삭제 완료를 가정하지 않으며, 파일 조회에서 확인한 FILE_NOT_FOUND만 이미 삭제된 것으로 처리한다. 정리 상태와 완료 시각은 DB에 남긴다. 테스트는 status.file-cleanup-enabled=false로 실제 예약 작업을 끄고 격리 DB·파일 서비스 응답으로 대기·재참조·실패·편집 경합을 검증한다. 실제 플랫폼 검사는 이번 실행이 만든 파일만 삭제하며 재조회까지 확인한다.

## macOS에서 준비하기

Docker Desktop과 Compose v2, SOPS를 설치하고 기존 age 개인키를 프로젝트 밖의 보호된 경로에 연결한다. 키를 새로 만들지 않고 필요한 수신자에게 권한이 있는지 먼저 확인한다.

Windows에서 사용하던 ENV의 PROJECT_SOURCE_DIR·DB_DATA_DIR·BACKUP_DIR는 Mac에서 존재하는 절대 경로로 조정한다. 키·평문을 출력하지 않는 로컬 편집기로 수정하고, 데이터 디렉터리를 준비한 뒤 encrypt → validate → up 순서로 실행한다. 연동 콜백과 공개 원점도 실제 실행 환경에 맞아야 한다. 운영 서버용 DB 경로는 로컬 빌드를 위해 Mac 경로로 바꾸지 않는다.

```sh
sh scripts/env.sh encrypt local
sh scripts/docker.sh validate local
sh scripts/docker.sh up local
sh scripts/docker.sh status local
```

운영 파일 묶음도 Mac에서 `sh scripts/export-runtime.sh none|plain|sops`로 준비할 수 있다. `none|plain|sops` 부분은 사용할 모드 하나로 바꾼다. AMD NAS용 이미지 빌드는 APP_IMAGE_PLATFORM=linux/amd64를 유지한다. 실제 Mac 하드웨어에서의 실행과 이미지 빌드는 별도 확인이 필요하다.

## 실행 스크립트 검사

Windows에서:

```powershell
pwsh -NoProfile -File scripts/test-env-scripts.ps1
```

POSIX 스크립트 검사는 실제 설정을 읽지 않고 Docker의 임시 프로젝트·키·Compose 모의 응답으로 수행한다. SOPS와 age-keygen의 Linux 실행 파일 경로만 지정한다.

```sh
docker run --rm \
  --mount type=bind,source="$(pwd)",target=/source,readonly \
  --mount type=bind,source="/path/to/linux/sops",target=/sops,readonly \
  --mount type=bind,source="/path/to/linux/age-keygen",target=/age-keygen,readonly \
  python:3.13-slim python /source/infra/checks/env-scripts.py
```

이 검사는 앱 전체 검사나 실제 운영 배포를 수행하지 않는다.
