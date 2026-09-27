# RoxStock 최초 백엔드 운영 배포 결과 — 실패 및 안전 중지

## 문서 정보

- 작성 담당: 웹서버 (server)
- 작성 시각: 2026-09-27 14:13:39 KST
- 대상 서버: newrox.cafe24.com
- 프로젝트: /opt/roxstock
- 지시 문서: docs/handoff/20260927-1345-github-backend-deploy.md
- 지시 문서를 읽고 동기화한 Git main: bbfe6b4c1a3e20672075c0d76986715f818f1bf7
- 지정 이미지의 소스 commit: cd99ee39aec24342319b7974b31f4e5f955134d9
- 배포 결과: 실패. 런타임 Prisma Client 경로 불일치로 backend가 기동하지 못했다. 실패 정책에 따라 backend만 중지했으며 API 라우팅을 활성화하지 않았다.

## 수행 내용

1. origin/main을 fetch하여 지정된 handoff를 먼저 읽었다.
2. 당시 원격 차이는 handoff 문서 한 개였으므로 git merge --ff-only로 동기화했다. 운영 변경사항은 보존했다.
3. 기존 backend/.env에서 자격증명을 출력하지 않고 읽어 Docker DNS 대상의 backend/.env.production을 새로 생성했다. HOST=0.0.0.0, PORT=3300, NODE_ENV=production이며 파일 권한 600 및 Git 제외를 확인했다.
4. 기존 roxstock_app, roxstock-db_default 네트워크와 healthy MariaDB를 확인했다. 네트워크와 DB를 재생성하지 않았다.
5. Caddyfile 원본을 백업하고 API 라우팅 후보를 백업 디렉터리에만 작성했다. backend 검증이 끝나기 전에는 live Caddyfile을 변경하지 않았다.
6. 지정된 명령 bash /opt/roxstock/scripts/deploy-backend.sh sha-cd99ee3을 실행했다.
7. Prisma 상태 조회는 성공했고 적용 대기 마이그레이션은 없었다. 스크립트는 migrate deploy도 호출했으나 No pending migrations to apply로 종료했다.
8. backend가 모듈 누락으로 재시작을 반복했고 약 120초 health 대기 후 배포 스크립트가 종료 코드 1로 실패했다.
9. 지시 문서의 실패 정책에 따라 docker stop roxstock-backend를 실행했다. 기존 frontend/Caddy/MariaDB는 중지하지 않았다.

## 이미지 및 컨테이너

- image/tag: newrox/roxstock-backend:sha-cd99ee3
- image ID: sha256:bfe8ed82b75c09bdc5356fa00bf810864dd5c908055493104496a8bfd8228313
- repo digest: newrox/roxstock-backend@sha256:bfe8ed82b75c09bdc5356fa00bf810864dd5c908055493104496a8bfd8228313
- container: roxstock-backend
- container ID: 81cb2c6cd29e9e36eadce66f95d34d75c23bcb5b0363436499e8ba02804df6e8
- Compose project: roxstock-backend
- 최종 상태: exited / unhealthy (기동 실패 후 명시적으로 중지)
- network 설정: roxstock_app, roxstock-db_default
- DNS alias: roxstock-backend, backend
- 중지 상태이므로 활성 네트워크 endpoint/IP는 없음
- backend 내부 port: 3300
- host port publishing: 없음
- /health: 애플리케이션 부팅 실패로 성공하지 못함
- /health/db: 정상 backend 기동 후 검증 단계에 도달하지 못함. 단, 이미지의 Prisma CLI는 DB DNS를 통해 연결 및 상태 조회에 성공함

## 실패 원인

실제 컨테이너 오류:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/backend/dist/generated/prisma/index.js'
imported from /app/backend/dist/lib/prisma.js
```

backend/src/lib/prisma.ts의 상대 import ../generated/prisma/index.js는 컴파일 후 dist/lib/prisma.js에서도 유지되어 dist/generated/prisma/index.js를 요구한다. 현재 Dockerfile은 생성된 Client를 /app/backend/src/generated에 복사하므로 런타임 import 대상 경로와 일치하지 않는다.

Prisma CLI는 OpenSSL/libssl 버전을 감지하지 못해 openssl-1.1.x로 기본 선택한다는 경고도 출력했다. CLI 상태 조회는 성공했지만 이미지의 OpenSSL 런타임 구성도 함께 점검해야 한다. 직접 확인된 시작 실패 원인은 위 ERR_MODULE_NOT_FOUND이다.

운영 서버에서 이미지 내부 파일을 임의로 복사하거나 Dockerfile을 수정해 우회하지 않았다. GitHub 담당이 수정된 immutable 이미지를 만들고 재배포를 인계해야 한다.

## Prisma 및 DB

- target image의 migrate status: 2 migrations found; Database schema is up to date!
- migrate deploy: No pending migrations to apply.
- 신규 적용 마이그레이션: 없음
- 스키마 rollback, reset, db push, DROP DATABASE, 운영 데이터 변경 API 호출: 없음
- DB target: roxstock-mariadb:3306, DB roxstock
- MariaDB container: roxstock-mariadb
- image: mariadb:11.8.9
- final state: running / healthy
- network: roxstock-db_default
- host binding: 127.0.0.1:3306만 유지
- persistent volume: roxstock_mariadb_data 보존

## Caddy 변경 및 복구

- live Caddyfile: /opt/roxstock/infra/caddy/Caddyfile
- live 파일 변경: 없음. 백업과 byte 단위 동일 확인
- validate/reload: 실행하지 않음. backend 실패로 후보 활성화 단계에 도달하지 않음
- 현재 모든 요청: frontend:80으로 전달하는 기존 HTTPS 구성 유지
- 후보는 /api와 /api/*만 roxstock-backend:3300으로 전달하며 prefix를 보존하도록 준비했지만 적용하지 않음
- /health 및 /health/db 외부 공개: 하지 않음
- 백업 경로: /opt/roxstock/.ops-backups/backend-first-20260927T135227+0900/Caddyfile.before
- 후보 경로: 동일 디렉터리의 Caddyfile.candidate
- 로그: 동일 디렉터리의 deploy-result.log (접속정보 제거 후 저장, Git 제외)
- Caddy rollback: live 변경이 없으므로 불필요
- 이미지 rollback: 최초 배포라 이전 정상 backend SHA 없음. 실패 컨테이너만 중지
- DB rollback: 수행하지 않음
- Caddy data/config 볼륨과 infra/caddy 디렉터리는 보존

## 외부 검증 및 기존 서비스

| 검증 | 결과 |
|---|---|
| HTTP → HTTPS | 308, https://newrox.cafe24.com/로 리다이렉트 |
| HTTPS home | 200 |
| frontend 직접 경로 /detail/assets | 200 |
| GET /api/accounts | 200 text/html; 기존 프론트 응답이며 API 성공 아님 |
| GET /api/securities | 200 text/html; 기존 프론트 응답이며 API 성공 아님 |
| GET /api/__handoff_nonexistent | 200 text/html; 정상 backend 404 검증 실패/미달성 |
| roxstock-proxy | running / healthy |
| roxstock-frontend | running / healthy |
| roxstock-mariadb | running / healthy |
| host 3300 | 리스너 없음, backend publish 없음 |
| host 3306 | 127.0.0.1:3306만 리스닝 |
| host 80/443 | 기존 Caddy의 IPv4/IPv6 리스너 유지 |

Caddy 컨테이너 ID 823cb95bc1930a7a7444dcd31c7b3a6d8594805c75314f7ae4ae2bd03dc03154 및 MariaDB 컨테이너 ID d265db3b44ee60ea13fda22fa934d7c9da5a9361c2c5ecceb3c261c4bf598880는 작업 전후 동일했다.

작업 중 별도 프론트 배포가 관측됐다. 프론트는 sha-757233b에서 sha-0abd483으로 변경됐고 최종 container ID는 3a8a1dabb5f32c400fa412b554c93dbb5f75785a7acdd4187915595704dec4c1, 시작 시각은 2026-09-27T05:10:14Z였다. 이 작업에서는 프론트 재생성 명령을 실행하지 않았다. 서버 HEAD도 별도 작업으로 0abd483bdec2e35258b61e09e69f98a66004e01c까지 이동했다. 동시에 배포가 진행되는 점을 후속 작업 계획에 반영해야 한다.

## 서버 파일 및 상태 변경

- 생성: backend/.env.production (600, Git 제외, 내용 비공개)
- 생성: .ops-backups/backend-first-20260927T135227+0900/ 내 원본 백업·후보·정제 로그 (Git 제외)
- 생성: .backend-deploy.lock (배포 스크립트 생성, 미추적 상태로 남기며 커밋하지 않음)
- 생성: 이 server handoff 문서
- Docker: 지정 backend 이미지 다운로드, 마이그레이션 CLI용 일회성 컨테이너 실행 및 --rm 정리, backend 컨테이너 생성 후 실패하여 중지
- 보존 확인: infra/caddy/Caddyfile, compose.yml, infra/docker/compose.prod-db.yml은 백업과 동일
- 기존 미커밋 운영 변경사항 보존. 환경파일, Caddyfile, DB Compose, lock, 로그는 이번 커밋 대상에서 제외
- origin 설정 및 기존 deploy key 변경 없음. handoff 문서만 Handoff Writer 키로 공유

## GitHub/CI·CD 담당 후속 작업

1. Dockerfile에서 생성된 Prisma Client를 컴파일된 import가 기대하는 경로에 배치하거나 import/생성 경로를 일관되게 수정한다.
2. 최종 runtime 이미지 자체를 실행하여 /health와 /health/db를 검증하는 smoke test를 CI에 추가한다. TypeScript build 성공만으로 실제 이미지 부팅이 보장되지 않는다.
3. OpenSSL/libssl 경고를 해소할 수 있도록 build/runtime 의존성을 검토한다.
4. 배포 스크립트의 실패 경로에서 재시작 중인 backend도 확실히 중지하도록 보완한다. 이번에는 서버 담당이 명시적으로 중지했다.
5. migrate status 후 pending일 때만 deploy를 호출하라는 handoff 설명과 실제 무조건 호출 동작의 차이를 정리한다. pending 시 status가 비정상 종료하는 경우도 검토해야 한다.
6. 수정된 immutable SHA 이미지를 CI에서 검증한 뒤 새로운 github handoff로 재배포를 요청한다.
7. 서버 환경파일은 준비되어 있으나 API Caddy 라우팅은 아직 활성화되지 않았다. backend healthy 확인 후 백업·validate·reload 절차와 외부 JSON/404 검증이 필요하다.

## 다음 담당

GitHub/CI·CD 담당. 최초 백엔드 운영 배포는 완료되지 않았으며, 수정 이미지 인계 후 재시도가 필요하다.
