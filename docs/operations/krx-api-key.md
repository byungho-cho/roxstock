# KRX 운영 인증키 등록 및 갱신

## 이용기간

- 사용자 확인 서비스 이용기간: **2026.10.08~2027.01.07**.
- 만료일: **2027.01.07**. 운영 담당자는 만료 전에 KRX 서비스 관리 화면에서 연장/재신청 가능 여부와 절차를 확인하고 갱신한다. 서비스별 실제 갱신 방법과 새 이용기간은 확인 후 기록한다.
- 갱신 시 같은 환경변수 `KRX_API_KEY`를 사용한다. 키 값, 일부 문자열, 해시 등 키 식별값은 문서·GitHub·로그에 기록하지 않는다.

## 등록 위치와 전달 경로

운영 원본은 `/opt/roxstock/backend/.env.production`이다. 서버 로컬 비밀정보 파일이며 기존 설정을 유지하고 `KRX_API_KEY` 항목만 추가/교체한다. 개발 `.env`를 복사하지 않는다.

현재 `infra/docker/compose.prod-backend.yml`은 아래 네 서비스에 이 파일을 `env_file`로 전달한다. 따라서 Compose 수정 없이 키가 전달되며, 공유 파일 특성상 KRX 호출 여부에 관계없이 네 서비스 모두 키를 받는다.

| 서비스 | 컨테이너 |
| --- | --- |
| backend | roxstock-backend |
| collector | roxstock-collector |
| realtime-collector | roxstock-realtime-collector |
| dart-collector | roxstock-dart-collector |

프런트 `compose.yml`에는 이 파일이 연결되지 않는다. React, 프런트 컨테이너, 빌드 인수, `VITE_*`에는 키를 넣지 않는다. 개발 담당은 백엔드에서 `process.env.KRX_API_KEY`를 사용한다. 호출·헤더·오류 로깅에 키가 포함되지 않도록 개발 검증한다.

## 안전한 등록

승인된 SSH 연결로 **화면/세션 녹화가 없는 개인 터미널**에서 운영 파일 소유자로 실행한다. 키를 명령줄, 환경변수 인수, 채팅, CI 입력, 파일 업로드로 전달하지 않는다. 이 저장소의 `scripts/register-krx-key.py`를 서버에서 검토한 뒤 사용한다. 스크립트를 사용하려고 main을 병합하거나 Production Deploy를 실행할 필요는 없다. 검토한 스크립트 파일만 서버에 전달한다.

```sh
python3 /path/to/reviewed/register-krx-key.py --register
python3 /path/to/reviewed/register-krx-key.py
```

등록 도구는 `/dev/tty` 숨김 입력과 확인 입력을 받는다. 숨김 입력이 불가능하면 중단한다. 원본 파일 존재·권한 600·소유자·Git 미추적 및 제외·중복 키를 확인하고 기존 production.lock을 잡아 배포와 겹치지 않도록 한다. 다른 변수는 그대로 보존하고 권한 600 임시 파일을 원자적으로 교체한다. 등록/갱신 후 값은 출력하지 않는다. 임의의 빈 키나 예시 키를 운영 파일에 미리 넣지 않는다.

이 도구는 API 호출, Docker 실행, 컨테이너 재생성, DB 접속, 수집, 백필을 수행하지 않는다. 등록 확인은 비어 있지 않은 항목의 존재 확인이며 API 인증 유효성 검증이 아니다.

## 실행 컨테이너 전달 여부 확인

아래는 기존 컨테이너에 Node 프로세스를 실행하여 변수 존재 여부만 확인한다. 수집기 명령이나 API를 실행하지 않는다. 미실행 컨테이너/명령 실패는 '미등록'과 구별하여 확인 실패로 보고한다.

```sh
for container in roxstock-backend roxstock-collector roxstock-realtime-collector roxstock-dart-collector; do
  printf '%s: ' "$container"
  docker exec "$container" node -e 'console.log(process.env.KRX_API_KEY ? "present" : "absent")' || printf 'check failed\n'
done
```

`cat`으로 운영 env를 표시하거나 `docker inspect` 전체 출력, `docker compose config` 렌더링, `printenv`, `set -x`로 값을 노출하지 않는다. Git 추적 제외는 원본 및 배포 worktree 각각에서 확인하며 파일 권한도 각각 600이어야 한다.

## 적용 보류와 개발 검증 후 적용

원본 등록과 실행 컨테이너 반영은 별개다. 기존 컨테이너는 파일 변경만으로 갱신되지 않고 재생성이 필요하다. 기존 배포는 원본 env를 커밋별 worktree에 권한 600으로 복사한 뒤 컨테이너를 재생성한다.

**이번 작업에서는 Production Deploy, deploy-backend.sh, 수집기 시작/재생성, 수집·DB 보충을 실행하지 않는다.** 기존 배포 스크립트는 마이그레이션과 daemon 수집기 시작을 포함하므로 개발 검증 전의 키 등록 작업에 사용하지 않는다. 파일만 등록한 경우 '등록 완료, 런타임 반영 보류'로 보고한다.

개발 검증 후 기존 배포 절차로 반영하고 위 존재 확인 명령을 실행한다. 동일 SHA의 컨테이너가 이미 healthy이면 `deploy-production-component.sh`가 배포를 건너뛰므로 같은 SHA 재실행만으로 반영됐다고 판단하지 않는다. 다음 검증된 새 SHA 배포 등 실제 재생성 여부를 확인한다. 현재 실행 worktree에 키를 복사하거나 컨테이너를 수동 재생성하는 우회는 하지 않는다.

## 현재 준비 상태 및 완료 보고 항목

2026.10.08 저장소 설정 검토로 전달 경로와 Git 제외 규칙을 확인했다. 운영 서버 연결과 실제 키 입력이 제공되지 않아 **운영 등록, 서버 권한/미추적 확인, 실행 컨테이너 전달 확인은 아직 수행하지 않았다**. 이 문서는 운영 등록 완료의 증거가 아니다.

운영 담당은 작업 후 원본 등록 여부, 원본/배포 파일 권한 및 Git 제외 결과, 컨테이너별 present/absent/확인 실패, 재생성 적용 여부, 검증 시각, 남은 개발 검증/배포/갱신 작업만 기록한다. 인증키 값은 포함하지 않는다.
