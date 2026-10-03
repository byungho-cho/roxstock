# RoxStock 최초 백엔드 운영 연결 최종 결과

## 문서 정보

- 작성 담당: 웹서버 (server)
- 작성 시각: 2026-09-27 16:17:44 KST
- 대상: https://newrox.cafe24.com
- 프로젝트: /opt/roxstock
- 지시 문서: docs/handoff/20260927-1455-github-caddy-api.md
- 기준 main: 5bf37df6b186190a144c445f68b14c9b7fb2f893
- backend 이미지 기준 commit: 5e63475a91707f240c543a6e3ef2f4f175102419
- 결과: 성공. 외부 JSON API와 기존 frontend/HTTPS 동작까지 확인하여 최초 백엔드 운영 배포 완료.

## 사전점검

backend, Caddy, frontend, MariaDB 모두 running / healthy임을 확인한 뒤 진행했다. backend의 /health 및 /health/db는 내부 요청으로 각각 200을 반환했다. 기존 origin/main을 읽고 handoff 문서만 fast-forward했으며 기존 운영 working tree 변경사항을 보존했다.

## Caddy 백업 및 정확한 변경

- 실제 운영 파일: /opt/roxstock/infra/caddy/Caddyfile
- 기존 컨테이너 마운트: /etc/caddy/Caddyfile (읽기 전용 bind mount)
- 원본 백업: /opt/roxstock/.ops-backups/caddy-api-20260927T161030+0900/Caddyfile.before
- 후보 보관: /opt/roxstock/.ops-backups/caddy-api-20260927T161030+0900/Caddyfile.candidate
- 검증/리로드 로그 및 결과: 동일 백업 디렉터리의 validate.log, reload.log, result.json (Git 제외)
- infra/caddy 디렉터리를 교체하거나 삭제하지 않았다. bind mount가 가리키는 파일을 제자리에서 수정했다.
- 기존 global 옵션, Let's Encrypt 설정, HTTP/HTTPS 동작을 보존했다.

최종 Caddyfile:

```caddyfile
{
    acme_ca https://acme-v02.api.letsencrypt.org/directory
    servers {
        protocols h1 h2
    }
}

newrox.cafe24.com {
    @api path /api /api/*
    handle @api {
        reverse_proxy roxstock-backend:3300
    }

    handle {
        reverse_proxy frontend:80
    }
}
```

/api prefix는 제거하지 않는다. /api 및 /api/*만 backend로 전달하고 모든 나머지 경로는 기존 frontend로 전달한다. /health 및 /health/db를 backend 공개 경로로 추가하지 않았다.

## Caddy validate 및 graceful reload

아래 순서로 기존 컨테이너에서 실제 live 후보를 검증하고 reload했다.

```sh
docker exec roxstock-proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec roxstock-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

- validate: exit 0, Valid configuration
- graceful reload: exit 0
- Caddy 컨테이너 재생성·재시작: 없음
- roxstock_caddy_data 및 roxstock_caddy_config 볼륨: 보존
- 장애 및 복구: 없음. 모든 검증이 통과하여 원본 복구는 필요하지 않았다.

## Backend

- container: roxstock-backend
- image/tag: newrox/roxstock-backend:sha-5e63475
- image ID: sha256:4992f4ce9b6796a44ce85584139e397d833c6ff3d8101bd032d9db7ad64eb451
- final health: running / healthy
- networks: roxstock_app, roxstock-db_default
- 내부 port: 3300
- host publishing: 없음 (PortBindings={})
- /health: HTTP 200, status=ok
- /health/db: HTTP 200, status=ok, database=connected
- 이번 작업에서 backend를 재배포하거나 재생성하지 않음

## Prisma

실행 중인 backend 컨테이너에서 조회만 수행했다.

```sh
docker exec roxstock-backend npx --no-install prisma migrate status --schema database/prisma/schema.prisma
```

- 2 migrations found in prisma/migrations
- Database schema is up to date!
- 이번 작업에서 마이그레이션 적용·초기화·DB 데이터 변경 없음

## 외부 JSON API 및 frontend 검증

| 요청 | HTTP | Content-Type | 본문 의미 검증 |
|---|---|---|---|
| GET /api/accounts | 200 | application/json; charset=utf-8 | JSON 파싱 성공, data 배열 확인; frontend HTML 아님 |
| GET /api/securities | 200 | application/json; charset=utf-8 | JSON 파싱 성공, data 배열 확인; frontend HTML 아님 |
| GET /api/__handoff_nonexistent | 404 | application/json; charset=utf-8 | backend JSON의 statusCode=404 확인 |
| GET /api | 404 | application/json; charset=utf-8 | 정확한 /api 경로도 backend에 전달됨; statusCode=404 |
| GET / | 200 | text/html | frontend HTML 확인 |
| GET /detail/assets | 200 | text/html | frontend 직접 경로 요청 및 HTML 확인 |

실제 계좌·종목 레코드 내용은 로그나 공유 문서에 출력하지 않았다. POST/PUT/PATCH/DELETE API나 테스트 거래 데이터 생성은 수행하지 않았다.

## HTTPS

- http://newrox.cafe24.com/ → HTTP 308 → https://newrox.cafe24.com/
- HTTPS 요청은 인증서 검증을 비활성화하지 않고 모두 성공
- 인증서 도메인: newrox.cafe24.com
- 발급자: Let's Encrypt YE2
- 유효기간: 2026-09-26 05:59:38 UTC ~ 2026-12-25 05:59:37 UTC
- TLS 신뢰 체인 및 도메인 검증 정상

## 최종 인프라 상태

| 컨테이너 | 이미지 | 상태 | 네트워크 |
|---|---|---|---|
| roxstock-backend | newrox/roxstock-backend:sha-5e63475 | running / healthy | roxstock_app, roxstock-db_default |
| roxstock-proxy | caddy:2-alpine (기존 고정 digest 유지) | running / healthy | roxstock_app, roxstock_default |
| roxstock-frontend | newrox/roxstock-frontend:sha-0abd483 | running / healthy | roxstock_app |
| roxstock-mariadb | mariadb:11.8.9 | running / healthy | roxstock-db_default |

네 컨테이너 모두 작업 전후 ID가 동일했다. 컨테이너 중단·재생성, 네트워크 변경, Docker volume 초기화는 하지 않았다.

- host 3300: 리스너 없음, backend publish 없음
- host 3306: 127.0.0.1:3306만 리스닝, MariaDB PortBindings도 동일
- host 80/443: 기존 Caddy IPv4/IPv6 리스너 유지
- MariaDB 데이터 볼륨 roxstock_mariadb_data 보존

## 변경 파일 및 공유 범위

- 변경: infra/caddy/Caddyfile의 API 라우팅 (서버 운영 변경으로만 유지, 커밋 제외)
- 생성: 위 .ops-backups 경로 내 백업·후보·검증 로그·결과 (Git 제외)
- 생성 및 커밋 대상: 이 handoff 문서 한 개
- 기존 환경파일, DB Compose, 기존 운영 변경사항, 인증서 및 볼륨은 변경하지 않음
- origin 및 기존 roxstock_deploy 키는 변경하지 않음
- 문서만 RoxStock Handoff Writer 키로 공유하며 Secret이나 전체 DB 접속 문자열은 포함하지 않음

## 복구 정보

이번 작업에는 실패가 없었다. 향후 이 라우팅만 원복할 필요가 생기면 위 Caddyfile.before 내용을 운영 파일에 제자리 복원한 뒤 기존 컨테이너에서 validate와 graceful reload를 수행한다. bind mount 때문에 파일 inode를 바꾸는 교체 방식은 피한다. 디렉터리·인증서·DB 볼륨은 삭제하거나 초기화하지 않는다. 원복 시 /api는 다시 기존 frontend로 전달됨에 유의한다.

## 다음 담당

GitHub/CI·CD 담당. 최초 backend 운영 배포 및 Caddy JSON API 연결 검증이 완료됐다. 이후 backend 관련 변경은 기존 Backend Test Build Deploy workflow와 immutable sha 이미지 배포 절차를 사용한다. 운영 Caddyfile은 여전히 서버의 미추적 설정이므로 배포 시 보존한다.

## 2026-10-03 · 개발 복구 및 검사 단계 인수인계 (KST)

이 절은 위의 2026-09-27 백엔드 기록을 변경하지 않고 프론트 개발 복구 상태를 추가한다.

- 복구 확인: 열린 PR 0, 실행 중인 Actions 0. 로컬은 Git 메타데이터 없는 소스 작업 사본이며 186개 텍스트 파일은 줄바꿈/파일 끝 개행 차이를 제외하면 원격 main과 일치한다. 미반영 제품 소스 없음.
- 완료된 작업 브랜치: `codex/stocks-v04-refactor-20261003`, 최종 앱 커밋 `2ddd4dfcc33ae158d22fddb8fc960ed50f070009`.
- PR #77 병합 main: `3c8cbd30eb30c631828a80a2734af0d53d4dd695`.
- 보존하는 통과 기록: Frontend Check Run `37123554472` (TypeScript/빌드), Stock Function Check `37123554581` (단위 8, 입력/분류 32, 홈 복귀 4), Stocks Update Check `37123554521` (42 통과, 펼침 전용 2건 커버에서 제외).
- 운영 증거: Frontend Docker Image `37123959184`, 2026-10-03 21:48:54 KST 완료, `newrox/roxstock-frontend:sha-3c8cbd3`, frontend healthy 및 서버 HTTP health 성공.
- 신규 작업 브랜치: `codex/checkpoint-scoped-checks-20261003`, 시작점 `3c8cbd3`.
- 이번 범위: 검사 선택·분리·성공 결과 재사용 및 데이터가 충분한 세 분류 복원 검사. 앱/API/DB 변경 없음. 운영 이미지 재배포 불필요; 기존 운영 성공 SHA를 보존한다.
- 구현 완료 체크포인트: 이 절을 추가한 커밋이 초기 구현 커밋이다. 실제 검사 시작 후 소스 SHA와 실행 ID를 아래에 추가한다.
- 남은 문제: 관심/거래 목록의 충분한 데이터 스크롤 복원 증거 부족. 새 검사에서 각 분류 30건, 실제 스크롤 범위 >420px를 먼저 검증한다.
- 다음 실행: PR에서 Stock Scroll Restoration Check 한 번 실행 → 실패 시 로그/측정 자료 확인 → 필요 수정만 수행 → 종료 결과 커밋/푸시 → PR 병합 → 기존 운영 SHA 정상 여부 확인 후 보고. 전체 시각 QA/전체 회귀 미실시.
