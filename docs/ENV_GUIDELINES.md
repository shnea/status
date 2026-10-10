# 공통 ENV · 빌드 · 배포 관리 지침

다른 개인 프로젝트에도 복사해서 사용하는 지침이다. 기술 스택·업무 기능·Golden Path 기준은 이 문서에서 정하지 않는다. 기존 프로젝트에는 데이터·키·운영 상태를 보존하며 단계적으로 적용한다.

## 1. 기본 원칙

1. 실설정 원본은 **SOPS + age**로 암호화하여 Git에서 버전 관리한다.
2. 환경은 **local / dev / prod**로 구분한다. 실행용 평문은 `.env.local`, `.env.dev`, `.env.prod`다.
3. Docker Compose는 **compose.yml 하나**를 기본으로 하고 환경별 ENV를 명시적으로 선택한다. 개발/운영 실행 방식이 다르면 같은 파일의 프로필을 사용한다.
4. 개발 PC에서 이미지를 **Build / Push**하고, 운영 서버에서는 **Pull / Up**만 한다. 운영 서버에서 소스를 빌드하지 않는다.
5. 평문 ENV·age 개인키·실제 데이터·복호화 중간 파일은 Git과 이미지에 넣지 않는다. 문서·로그·명령 인자에도 비밀값을 노출하지 않는다.
6. DB·업로드·영구 파일의 호스트 저장 경로와 노출 포트는 ENV로 지정한다.
7. **각 프로젝트에 필요한 표준 스크립트를 복사한다.** 중앙 OPS 프로그램이나 공통 설치 폴더에 의존하지 않는다. 프로젝트별 서비스·프로필·파일 목록은 프로젝트 설정에서 관리한다.
8. CI/CD와 전체 검수를 모든 수정에 강제하지 않는다. 변경에 필요한 검증을 수행하고 자동화는 선택적으로 사용한다.
9. 운영에는 실행과 운영 작업에 필요한 파일만 둔다. 개발 소스·빌드 도구·테스트·Git 저장소는 배치하지 않는다.
10. 기존 키를 임의로 재생성하거나 기존 데이터·운영 폴더를 자동 삭제하지 않는다.

## 2. 파일 구성

개발 저장소의 기본 구조:

```text
project/
├── compose.yml
├── .env.example           # 변수 명세와 안전한 예시
├── .sops.yaml             # 공개 수신자 정책
├── .env.local.sops.env
├── .env.dev.sops.env
├── .env.prod.sops.env
├── infra/                 # Compose가 참조하는 설정
├── scripts/               # 이 프로젝트의 표준 실행·ENV 스크립트
└── 소스 및 테스트
```

실제로 사용하는 환경의 암호화 원본만 만든다. 자리표시자를 실제 연결 값처럼 취급하지 않는다. `.env.example`에는 용도·필수 여부·안전한 예시만 넣으며, 실설정과 실제 저장 경로는 암호화 원본에 둔다.

운영 서버의 기본 구조:

```text
project/
├── compose.yml
├── .env.prod              # 준비된 평문 또는 SOPS 복호화 결과
├── infra/                 # 운영 Compose가 참조하는 파일만
└── scripts/               # Pull/Up·로그 등 운영에 사용하는 스크립트만
```

서버에서 SOPS를 사용하는 경우에는 `.env.prod.sops.env`, `.sops.yaml`과 ENV 처리 스크립트도 배치한다. 별도 `tools/`·`.docker/`·중앙 `ops/` 폴더를 만들도록 요구하지 않는다. SOPS·age 실행 파일의 설치 위치는 OS 관례에 맞춰 선택하며 운영 배포 묶음에 자동으로 포함하지 않는다.

## 3. 운영 ENV 방식

배포할 때 다음 중 하나를 **명시적으로 선택**한다.

| 방식 | 서버에서 사용하는 파일 | 필요한 도구와 키 |
| --- | --- | --- |
| `sops` | 암호화 원본을 서버에서 복호화하여 `.env.prod` 생성 | SOPS와 해당 수신자의 age 개인키 |
| `plain` | 이미 준비된 `.env.prod`로 실행 | 실행만 한다면 SOPS와 개인키 불필요 |

어느 방식도 자동 기본값으로 강제하지 않는다. `plain` 방식도 암호화 원본을 Git에서 관리한다. 서버에서 ENV를 편집했다면 적절한 키와 정책으로 다시 암호화하고 원본 변경을 저장소에 반영한다. 평문을 Git에 올리지 않는다.

평문은 실행에 필요할 때 만들고 POSIX에서는 `0600`, Windows에서는 사용자 전용 ACL로 보호한다. Compose의 `env_file`을 사용하는 서비스는 재생성에도 평문 파일이 필요할 수 있으므로 실행 직후 무조건 삭제하지 않는다. 더 이상 쓰지 않는 평문·임시 파일은 정리한다.

`decrypt`는 암호화 원본을 실행용 평문에 적용하는 명령이다. 평문을 직접 수정했다면 먼저 `encrypt`하여 변경을 보존한 뒤 복호화한다. 두 파일 중 어느 것이 최신인지 판단하지 않고 덮어쓰지 않는다.

## 4. age 키와 SOPS

age 개인키는 **프로젝트 밖**에 보관한다. OS의 사용자 설정/보안 저장 경로 등 보호된 위치를 사용하고 키 파일은 POSIX `0600`, 상위 디렉터리는 `0700` 또는 Windows 사용자 전용 ACL로 제한한다. 프로젝트 안에 개인키를 두고 `.gitignore`만 적용하는 방식은 사용하지 않는다.

`.sops.yaml`에는 공개키와 파일별 수신자 정책만 둔다. 키 위치는 `SOPS_AGE_KEY_FILE` 또는 Git에서 제외한 로컬 포인터로 지정한다. 개인키를 문서나 설정 예시에 붙여 넣지 않는다. SOPS의 OS 기본 키 경로를 사용해도 프로젝트 밖이라는 원칙을 지킨다.

기존 키가 있으면 재사용 여부와 수신자를 확인하고 연결한다. 키 공유는 자동으로 가정하지 않으며 환경·접근 권한에 맞게 수신자를 지정한다. 운영 관리자용 키를 보존하고, 서버 복호화를 선택하면 운영 서버의 공개키도 수신자로 추가한다.

```yaml
creation_rules:
  - path_regex: ^\.env\.local\.sops\.env$
    age: REPLACE_WITH_LOCAL_PUBLIC_KEY
  - path_regex: ^\.env\.dev\.sops\.env$
    age: REPLACE_WITH_DEV_PUBLIC_KEY
  - path_regex: ^\.env\.prod\.sops\.env$
    age: >-
      REPLACE_WITH_ADMIN_PUBLIC_KEY,
      REPLACE_WITH_SERVER_PUBLIC_KEY
```

자리표시자는 실제 키로 교체한다. 서버 수신자는 서버에서 복호화할 경우에 추가한다. 수신자 정책을 바꿀 때 기존 암호화 파일에도 `sops updatekeys`로 반영해야 한다. 암호화 원본과 별도로 개인키를 보호 백업하고 새 환경에서 복호화되는지 확인한 뒤 이전 키를 정리한다.

SOPS와 age는 [SOPS 공식 설치 안내](https://getsops.io/docs/installation/)와 [age 공식 배포](https://github.com/FiloSottile/age/releases)에 맞는 OS/CPU 실행 파일을 설치한다. 다운로드한 실행 파일은 배포처와 체크섬을 확인한다. 키 생성은 최초 설정에만 필요하며 배포할 때마다 생성하지 않는다.

## 5. 프로젝트 스크립트

명령의 역할은 공통으로 유지하고 각 프로젝트의 Compose 서비스·검증 조건에 맞게 구현한다. Windows용 `.ps1`과 Linux/NAS·macOS용 POSIX `.sh`를 제공한다. 셸 스크립트는 `sh scripts/파일.sh`로 실행할 수 있어 실행 권한 변경을 필수로 하지 않는다.

| 스크립트 | 역할 | 운영 배치 |
| --- | --- | --- |
| `build.ps1 / build.sh` | `build`, `push`, `build-push` | 제외 |
| `docker.ps1 / docker.sh` | `pull`, `up`, `logs`, `status`, `validate` | 운영 OS에 필요한 것만 |
| `env.ps1 / env.sh` | `encrypt`, `decrypt`, `check` | 서버에서 SOPS 처리할 때 |
| `deploy.sh` 등 운영용 배포 스크립트 | 선택한 ENV 준비 → 검증 → Pull → Up | 포함 |
| `export-runtime.ps1 / export-runtime.sh` | 허용 목록의 최소 운영 파일 준비 | 제외 |
| `common.*`, `project.conf` 등 | 배치한 스크립트의 필수 의존 파일 | 필요한 것만 |

파일 이름은 프로젝트에서 일관되게 정한다. 전달만 하는 스크립트를 불필요하게 여러 개 만들지 않는다. 로컬 Build/Push와 서버 Pull/Up을 분리하거나 필요한 경우 합친 배포 명령을 제공한다. SSH 전송 자동화는 선택 사항이며 접속 비밀번호를 파일에 저장하지 않는다.

Windows:

```powershell
pwsh -NoProfile -File scripts/env.ps1 encrypt -Environment local
pwsh -NoProfile -File scripts/env.ps1 decrypt -Environment local
pwsh -NoProfile -File scripts/docker.ps1 validate -Environment local
pwsh -NoProfile -File scripts/docker.ps1 up -Environment local
pwsh -NoProfile -File scripts/docker.ps1 logs -Environment local
pwsh -NoProfile -File scripts/build.ps1 build-push -Environment prod
pwsh -NoProfile -File scripts/export-runtime.ps1 -EnvMode sops
```

Linux/NAS·macOS:

```sh
sh scripts/env.sh encrypt local
sh scripts/env.sh decrypt local
sh scripts/docker.sh validate local
sh scripts/docker.sh up local
sh scripts/docker.sh logs local
sh scripts/build.sh build-push prod
sh scripts/export-runtime.sh sops
```

운영 서버의 두 실행 방식:

```sh
sh scripts/deploy.sh prod sops
# 또는 준비된 평문을 사용하는 경우
sh scripts/deploy.sh prod plain
```

Mac에서도 Docker Desktop과 Compose v2를 사용한다. Apple Silicon 개발 PC와 AMD64 운영 서버처럼 CPU가 다르면 빌드 대상 플랫폼을 ENV/Compose에 명시한다. 공통 지침에서 특정 CPU를 강제하지 않으며 해당 이미지가 대상 CPU에서 실제 실행되는지 검증한다. [Docker 플랫폼 빌드 안내](https://docs.docker.com/build/building/multi-platform/)를 참고한다.

## 6. 스크립트 처리 기준

- 실행할 환경과 ENV 파일을 명시한다. 셸에 같은 이름의 변수가 있어 ENV를 덮어쓰면 이름만 알리고 중단한다.
- 필수값·환경/프로필·포트·공개 원점·서비스별 연동 조건을 검증한다. 최초 설정에서 허용한 빈 값과 누락을 구분한다.
- ENV를 셸 코드로 `source/eval`하지 않는다. 이 스크립트 형식은 한 줄 `KEY=value`와 단순 따옴표를 지원한다. `$` 같은 리터럴은 작은따옴표로 감싸고 다중 행·변수 참조·복잡한 escape는 사용하지 않는다.
- 암호화/복호화는 제한된 임시 파일에 먼저 쓰고 결과를 확인한 뒤 교체한다. 실패·중단·처리 중 입력 변경 시 기존 대상 파일을 보존한다.
- 모든 비어 있지 않은 설정값이 암호화됐는지 확인한다. `_unencrypted` 등의 예외로 실제 ENV 값을 남기지 않는다.
- Build 실패 시 Push하지 않는다. 운영 ENV 준비/검증/Pull 실패 시 Up하지 않는다. 서버 Up에는 `--no-build`를 적용한다.
- ENV·개인키·원문 비밀값을 출력하지 않는다. Compose 설정은 조용히 검사하고 로그에서는 알려진 비밀값을 가린다. 로그 마스킹이 모든 앱 로그의 안전성을 보장하지 않으므로 앱도 비밀을 기록하지 않는다.
- 운영 이미지는 명시적인 릴리스 태그 또는 digest로 지정한다. `latest`·개발용 로컬 태그를 운영 기준으로 사용하지 않는다.
- 운영 파일은 **허용 목록**으로 준비한다. 프로젝트 전체를 압축하거나 소스와 테스트까지 자동 복사하지 않는다.

## 7. 데이터와 포트

호스트 bind mount 경로는 해당 환경의 ENV에 둔다. 기존 데이터 디렉터리의 절대 경로·존재 여부·접근 권한을 확인한다. 오타를 새 빈 DB 디렉터리로 조용히 생성하지 않도록 중요한 Compose bind mount는 `create_host_path: false`를 사용한다. 최초 디렉터리 생성은 의도한 위치를 확인한 뒤 수행한다.

named volume을 사용하는 캐시·임시 데이터에는 호스트 경로를 억지로 지정하지 않는다. 업로드가 외부 저장 서비스에만 존재한다면 불필요한 로컬 업로드 경로를 만들지 않는다.

백업 경로는 DB 디렉터리 밖으로 분리하고 중요한 백업은 별도 장치/저장소에 복제한다. 백업·보존·복구 명령은 프로젝트의 실제 데이터 구조에 맞게 제공한다. 복구 검사는 운영 DB를 덮어쓰지 않는 격리 환경에서 수행한다.

외부 공개가 필요한 포트만 바인딩한다. 내부 서비스는 컨테이너 네트워크로 연결한다. DB 관리 포트가 필요하면 루프백 또는 허용된 관리 네트워크에 제한한다. 외부 프록시의 HTTPS 원점과 로그인 콜백·쿠키 설정을 일치시킨다.

## 8. 검증과 기존 환경 이관

스크립트를 도입/변경했을 때 암호화 왕복·실패 시 보존·권한·Build/Push와 Pull/Up 순서·최소 파일 목록을 확인한다. OS마다 다른 명령은 호환 처리를 검증한다. 실제로 확인하지 않은 OS에서 테스트했다고 표시하지 않는다.

기존 평문·암호화 원본·키·데이터·컨테이너 상태를 먼저 확인한다. 새 스크립트로 준비/검증한 다음 실제 배포 흐름을 교체한다. 기존 설정과 백업을 보존하고 불필요한 임시 도구는 참조가 없다는 것을 확인한 뒤 정리한다. 운영 변경이 보류된 동안에는 문서·로컬 구성·격리 검증만 진행한다.
