# API·수집기 분리 운영 (V1.0.37)

최신 main `87d99bbbb60c3be0eae47d634e70d7670052cc44` (PR #228 반영)을 기반으로 구현했습니다. 같은 저장소·서버·MariaDB를 유지합니다. 물리 서버 분리는 이번 범위에 없습니다. 수집 일정·대상·계산식·API 응답·DB 마이그레이션 SQL은 변경하지 않습니다.

## 구조와 요청 흐름

| 경로 | 책임 |
| --- | --- |
| `frontend/` | 기존 React/Vite UI |
| `backend/src/` | Fastify API, 수집 조회·관리/수동 요청 접수, SSE |
| `collector/src/` | 일반·실시간·DART 진입점, 공급자·스케줄·수집/파싱/저장·재시도·캐시 생성 |
| `collector/tests/` | 수집 전용 실DB 통합 테스트와 DART 응답 fixture |
| `shared/src/` | 단일 DB 클라이언트, 수집 제외 정책, 타입·순수 계산, 잠금/수동 큐 계약, 조회 캐시 |
| `database/prisma/` | 유일한 스키마·마이그레이션 원본 |

production 의존 방향은 API → shared, collector → shared입니다. API는 수집 실행 모듈을 import하지 않습니다. 수동 API는 기존 `collector_runs` 요청·메타데이터 형식으로 접수하고 DART worker가 같은 DB 큐를 처리합니다. 소유 토큰·DB 잠금·collection revision·요청 멱등성·오류/진행 기록을 유지합니다. 실시간 수집기는 기존 내부 토큰 인증 POST로 API 메모리 캐시를 갱신하고 DB 저장 실패/HTTP 통지 실패를 기존 방식으로 처리합니다. 재무·가치 캐시는 기존 DB 변경 트리거/무효화와 수집 이후 생성 경로를 유지합니다.

## 개발·독립 빌드

Node 20과 npm workspace를 사용합니다. 루트에서:

```bash
npm ci
npm run prisma:generate
npm run typecheck:backend
npm run build:backend
npm run typecheck:collector
npm run build:collector
npm --workspace shared test
npm --workspace backend test
npm --workspace collector test
docker build -f backend/Dockerfile -t roxstock-api:test .
docker build -f collector/Dockerfile -t roxstock-collector:test .
```

API는 `npm --workspace backend run dev`, 각 수집기는 `collector/README.md`의 명령으로 실행합니다. 공통 빌드는 각 서비스 빌드가 먼저 수행합니다. 생성 클라이언트의 타입·런타임을 `shared/dist/generated`로 통일합니다. Docker build context는 루트이며 API 이미지에는 API·shared·migration CLI/스키마, 수집 이미지에는 collector·shared·DB 클라이언트만 포함합니다. 수집 이미지에는 Fastify·API 실행 코드·migration CLI가 없습니다.

## 환경·Compose·종료

개발 API 설정은 `backend/.env.example`, 수집 설정은 `collector/.env.example`에 있습니다. `DATABASE_URL`, 실시간 내부 POST의 `COLLECTOR_INTERNAL_TOKEN`과 수동 요청/모니터링에 쓰는 DART 할당량·달력 정책은 두 프로세스에서 일치해야 합니다. 실제 API 키/DB 암호는 공개 저장소에 저장하지 않습니다. 최초 분리 배포에서는 기존 서버의 `backend/.env.production`(0600)을 그대로 사용하여 키/토큰/설정 회전을 피합니다. 외부 API 키는 이 파일에서 수집 프로세스에 전달됩니다.

`infra/docker/compose.prod-backend.yml`은 `BACKEND_IMAGE`와 `COLLECTOR_IMAGE` 전체 참조를 각각 받습니다. 일반·실시간·DART 컨테이너 이름과 외부 네트워크 `roxstock_app`, `roxstock-db_default`는 유지합니다. 실시간 API URL도 `http://backend:3300/internal/realtime-prices`를 유지합니다. `unless-stopped`, 기존 health check와 작업 소유권 정책을 사용합니다. 종료 시 timer/신규 tick을 중단하고 진행 중 작업/쓰기 종료 후 DB 연결을 닫습니다. 수집기 종료 유예 720초는 기존 수동 작업 600초 예산의 정상 drain을 허용합니다. 강제 종료/서버 장애 시에도 기존 lease·소유 토큰·transaction·revision 검사가 적용됩니다.

## CI·독립 배포

`Production Deploy` 단일 진입점은 main SHA를 확인하고 서버의 실제 API·세 수집기·frontend 이미지 SHA와 health를 읽어 각 서비스별 변경을 계산합니다. 일부 서비스만 배포된 실패 실행이나 배포가 생략된 성공 실행이 다른 서비스의 기준점을 앞당기지 않습니다. 세 수집기 중 하나만 이전 이미지여도 수집기 그룹을 선택하며, 첫 분리 전 backend 공유 이미지를 쓰는 수집기는 새 이미지로 전환합니다. 최초 분리는 API·수집기와 변경된 frontend Docker workspace 설정을 함께 반영합니다. 이후:

| 변경 | 선택 |
| --- | --- |
| API 전용 | API |
| collector 전용 | 일반·실시간·DART 수집기 이미지/컨테이너 |
| shared 또는 DB | API + 수집기 |
| frontend 전용 | frontend |
| lockfile | workspace별 실제 도달 의존 그래프가 바뀐 서비스 |
| 공통 빌드/운영 Compose·배포 스크립트 | 관련 전체 서비스 (보수적 검증) |
| `backend/src/release.json`만 | 서비스 재배포 없음 |

PR 검사는 collector/shared 경로와 rename 이전 경로도 포함합니다. 필수 PR Gate는 선택된 검증 및 다른 PR workflow의 성공을 요구합니다. 자동 병합 후 기존 dispatch 중복 방지/최신 main 검증을 유지합니다. 이미지 이름은 `newrox/roxstock-backend:sha-<SHA>`, `newrox/roxstock-collector:sha-<SHA>`로 구분하고 실제 Docker content ID를 서비스별 기록합니다. 네이티브 변경이 없으므로 APK를 배포하지 않습니다.

SHA 고정 SSH wrapper `scripts/deploy-production-component.sh <40자리 SHA> backend|collector|frontend`가 서버 전역 `flock`을 잡고 해당 커밋의 worktree에서 실행합니다. API는 `up --no-deps backend`만, 수집기는 `up --no-deps collector realtime-collector dart-collector`만 수행합니다. 상대 서비스의 컨테이너 ID와 StartedAt가 그대로인지 비교합니다. API 배포 때문에 수집기를 재시작하거나 수집기 배포 때문에 API를 재시작하지 않습니다. 이미지 GC는 사용 중 컨테이너/볼륨/백업을 건드리지 않으며 registry에서 재취득 가능한 미사용 이미지에만 적용합니다.

API 또는 수집기 배포 전 gzip DB 백업을 서버 `.deploy/backups`(0700/파일 0600)에 만들고 검증/해시를 남깁니다. 같은 SHA의 API·수집기 배포는 검증 완료 marker로 백업 한 번을 공유합니다. 기존 profit/analysis-cache migration 복구 스크립트를 유지하고 API 배포에서 migration deploy/status를 한 번 수행한 후 SHA marker를 기록합니다. 수집 시작·수집기별 컨테이너 시작에는 migration이 없습니다. collector-only 배포에는 migration이 없습니다. API health 실패는 이전 API 이미지, 수집 health 실패는 각 이전 수집 이미지만 자동 복구합니다.

앱 버전은 기존 API `/api/version`에서 읽되 운영 API는 디렉터리 mount `/opt/roxstock/.deploy/runtime:/run/roxstock:ro`의 공개 `release.json`을 읽습니다. 성공한 컴포넌트 배포 후 파일을 atomic rename합니다. 따라서 버전 변경을 위해 변경 없는 API/frontend 이미지를 강제로 다시 만들 필요가 없습니다. 로컬/이전 배포에서는 번들 버전을 사용합니다.

## 배포 직전 기록·롤백

각 배포는 서버 `.deploy/history/<시각>-<서비스>-<SHA>/`에 적용 Compose, 템플릿, 실제 이전 컨테이너 설정/환경·명령·mount(`before-containers.json`), 이전 이미지 태그/ID, 상대 서비스 ID/시작 시각, 이후 이미지를 기록합니다. **환경/Compose 기록에는 비밀정보가 포함될 수 있어 서버 제한 디렉터리에만 저장하며 PR·로그·artifact로 올리지 않습니다.** `.deploy/backend-images.txt`, `collector-images.txt`, 각 `*-last-deploy`가 실제 배포 식별자/기록 위치를 따로 추적합니다.

애플리케이션 롤백 전 이전 버전과 현재 스키마 호환성을 확인합니다. 이번 분리는 migration SQL 변경이 없지만 이후 배포에는 별도 확인이 필요합니다. 현재 배포 커밋의 스크립트에서:

```bash
# 서버 제한 기록 경로를 사용. 두 명령은 독립적으로 실행합니다.
bash scripts/rollback-production-component.sh /opt/roxstock/.deploy/history/<API-배포기록> backend
bash scripts/rollback-production-component.sh /opt/roxstock/.deploy/history/<수집기-배포기록> collector
```

전역 배포 잠금 아래 기록의 이전 이미지로 지정 서비스만 시작합니다. 첫 분리 전의 backend 공유 이미지를 수집기에 복구할 때는 `backend/dist/collector/*.js` 명령을 자동 선택합니다. DB를 자동 복원하거나 migration을 되돌리지 않습니다. `health/db`, 수집 health·소유권·대기 큐 처리를 별도로 확인하고 상대 서비스 ID가 유지되는지 확인합니다. 전체 이전 Compose/컨테이너 설정 복구가 필요한 경우 제한 기록을 이용해 운영 설정을 검토한 뒤 지정 서비스만 복구합니다.

분리 전 소스 기준은 `v0.2` (`c351ae61a5315cb80c3f9019a83dfa7c0d403c99`)이며 태그를 이동하거나 최신 main을 이 버전으로 되돌리지 않습니다. 소스 태그는 DB 백업을 대신하지 않습니다. DB 복원은 별도 승인·정지/호환성 확인 및 백업 무결성 검증을 포함한 기존 운영 절차로 수행합니다. 백업·비밀정보를 Git에 올리지 않습니다.

## 검증 기록

검증 결과와 미확인 항목은 PR #229에 갱신합니다. 로컬 Windows 환경은 Docker daemon과 workspace symlink/일부 native filesystem 호출을 제공하지 않아 컨테이너·MariaDB 실검증은 GitHub Linux CI에서 수행합니다. 로컬 검사는 설치 manifest를 일시적으로 평탄화한 임시 검증 환경에서 수행하며 저장소 lockfile/workspace 설정을 바꾸지 않습니다. CI는 표준 `npm ci`를 사용합니다. 운영 데이터 초기화·대량 수집을 검증에 사용하지 않습니다. 운영 배포 시작 이후 완료/운영 화면 확인은 이번 보고 범위에 포함하지 않습니다.
