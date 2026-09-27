# RoxStock 백엔드 운영 사전점검

## 문서 정보

- 작성 담당: 웹서버 (server)
- 작성 시각: 2026-09-27 11:12:16 (KST)
- 대상 서버: Cafe24 RoxStock 운영 서버 (newrox.cafe24.com)
- 프로젝트 경로: /opt/roxstock
- 운영 URL: https://newrox.cafe24.com
- 기준 Git branch: main
- 기준 Git commit: 9f88c95caa68e3739504a5efcf079ee544404ca0
- 점검 기준: 2026-09-27 UTC에 완료한 읽기 전용 사전점검. 이 문서는 당시 결과를 기록하며, 작성 단계에서 서버 재점검이나 설정 변경을 하지 않았다.

## Git

- branch: main
- commit: 9f88c95caa68e3739504a5efcf079ee544404ca0
- 최근 커밋: Frontend: match tablet stock list table to Figma finals
- remote: git@github.com:byungho-cho/roxstock.git
- working tree 변경 여부: 있음. 점검 당시 아래 운영 변경사항이 있었으며 이번 문서 커밋에 포함하지 않는다.

```text
 M .gitignore
 M compose.yml
 M scripts/README.md
 M scripts/deploy.sh
 M scripts/tests/test_deploy.py
?? infra/caddy/
?? infra/docker/compose.prod-db.yml
```

사전점검에서는 git pull, commit, push를 수행하지 않았다. 이번 문서 게시만 별도로 승인받았다.

## Backend

- listen host: 0.0.0.0
- port: 3300
- health: GET /health → HTTP 200, status=ok
- DB health: GET /health/db → SELECT 1 조회; 성공 시 HTTP 200, status=ok, database=connected; 실패 시 HTTP 503, status=error, database=disconnected
- API prefix: /api (accounts, securities, trades 라우트)
- start command: backend 디렉터리에서 npm start → node dist/server.js
- 현재 상태: 백엔드 컨테이너 및 3300 리스너 없음
- 근거: backend/src/server.ts, backend/src/app.ts, backend/package.json. host/port는 소스 기본값과 기존 환경파일 설정이 일치한다. Endpoint는 소스 확인 결과이며 실행 중인 백엔드 호출 결과가 아니다.

## Frontend

- container: roxstock-frontend
- image: newrox/roxstock-frontend:sha-9f88c95
- network: roxstock_app
- 내부 IP: 172.19.0.2
- ports: 내부 80/tcp, 호스트 공개 없음
- health: running / healthy
- restart policy: unless-stopped

## Caddy

- container: roxstock-proxy
- image: caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
- network: roxstock_app (172.19.0.3), roxstock_default (172.18.0.2)
- Caddyfile 실제 경로: /opt/roxstock/infra/caddy/Caddyfile
- 컨테이너 경로: /etc/caddy/Caddyfile (읽기 전용 bind mount, ro,Z)
- Compose 파일: /opt/roxstock/compose.yml
- Compose 프로젝트: roxstock
- ports: 호스트 IPv4·IPv6 TCP 80, 443
- volumes: roxstock_caddy_data → /data; roxstock_caddy_config → /config
- health: running / healthy
- restart policy: unless-stopped
- HTTPS 상태: 인증서 검증 성공, HTTP/2 200
- 인증서: newrox.cafe24.com, Let's Encrypt YE2
- 인증서 유효기간: 2026-09-26 05:59:38 UTC ~ 2026-12-25 05:59:37 UTC
- /api proxy 존재 여부: 백엔드 전용 설정 없음. 모든 요청을 frontend:80으로 전달한다.
- frontend 연결: 공통 roxstock_app 네트워크의 frontend DNS 이름과 80 포트 사용
- 디렉터리 파일: infra/caddy/Caddyfile, infra/caddy/README.md

현재 운영 Caddyfile 전체 내용:

```caddyfile
{
    acme_ca https://acme-v02.api.letsencrypt.org/directory
    servers {
        protocols h1 h2
    }
}

newrox.cafe24.com {
    reverse_proxy frontend:80
}
```

## MariaDB

- container: roxstock-mariadb
- image: mariadb:11.8.9
- Compose 프로젝트: roxstock-db
- Compose 파일: /opt/roxstock/infra/docker/compose.prod-db.yml
- network: roxstock-db_default
- 내부 IP: 172.20.0.2
- container DNS: roxstock-mariadb (별칭 mariadb)
- host binding: 127.0.0.1:3306만 바인딩
- persistent volume: roxstock_mariadb_data → /var/lib/mysql
- 호스트 볼륨 위치: /var/lib/docker/volumes/roxstock_mariadb_data/_data
- health: running / healthy
- restart policy: unless-stopped
- DB명: roxstock
- DB 사용자명: roxstock
- 같은 네트워크에 연결된 컨테이너에서 등록된 DNS 이름으로 접근 가능한 구조이다.

## Docker Networks

- frontend: roxstock_app
- caddy: roxstock_app, roxstock_default
- mariadb: roxstock-db_default
- roxstock_app: bridge, internal=true
- roxstock_default: bridge, internal=false
- roxstock-db_default: bridge, internal=false
- Docker 기본 네트워크: bridge, host, none
- 현재 Caddy와 MariaDB에는 공통 네트워크가 없다.

## Host Ports

- 80: 0.0.0.0:80 및 [::]:80, Caddy
- 443: 0.0.0.0:443 및 [::]:443, Caddy
- 3300: 리스너 없음; 외부 공개 없음
- 3306: 127.0.0.1:3306, MariaDB; 공인 주소 및 0.0.0.0 바인딩 없음
- 기타 3000번대: 리스너 없음
- 기타 TCP 리스너: 22 (SSH), 111 (rpcbind), 127.0.0.1:40661 (Codex)
- firewalld: not running

## Prisma

- migration status: Database schema is up to date!
- 2 migrations found in prisma/migrations
- 종료 코드: 0
- 기존 backend/.env를 사용하여 backend 디렉터리에서 아래 상태 조회만 수행했다.

```sh
npx --no-install prisma migrate status --schema ../database/prisma/schema.prisma
```

마이그레이션 적용, 초기화, 데이터·스키마 변경은 수행하지 않았다.

## 현재 서비스

- HTTP → HTTPS: 308 Permanent Redirect 정상
- http://newrox.cafe24.com/ → https://newrox.cafe24.com/
- http://127.0.0.1/ → https://127.0.0.1/
- HTTPS home: HTTP/2 200, Via: 1.1 Caddy
- HTTPS 인증서: 신뢰 체인 및 도메인 검증 성공
- 프론트엔드, Caddy, MariaDB 모두 healthy

## 발견된 문제 및 주의사항

1. 기존 DB 연결 설정은 호스트 실행 기준이다. 백엔드를 컨테이너로 배포할 때 그대로 사용하면 안 된다.
2. backend 컨테이너 내부의 127.0.0.1은 backend 자신이며 MariaDB를 의미하지 않는다.
3. backend가 사용할 기존 MariaDB Docker network는 roxstock-db_default이다. 이 네트워크에 연결하여 DB에 접근하도록 배포 구성을 준비해야 한다.
4. MariaDB 컨테이너 DNS 이름은 roxstock-mariadb이며 mariadb 별칭도 등록되어 있다. 연결 포트는 3306이다.
5. Caddy와 backend가 공유할 기존 네트워크는 roxstock_app이다. Caddy는 추가로 roxstock_default에도 연결되어 있다. backend의 네트워크 연결은 아직 수행하지 않았다.
6. /health 및 /health/db는 /api prefix 밖에 있다. Caddy 라우팅과 컨테이너 healthcheck 설정에서 이를 구분해야 한다.
7. 현재 backend 전용 /api proxy는 없다. 현재 모든 경로는 frontend:80으로 전달된다. backend API는 /api prefix를 포함하므로 향후 프록시에서 이를 임의로 제거하지 않도록 해야 한다.
8. backend 3300 포트는 현재 리스닝하지 않으며 외부에 공개되어 있지 않다. 향후 Caddy가 Docker 내부 네트워크로 접근하도록 구성할 수 있다.
9. MariaDB 3306 포트는 127.0.0.1에만 바인딩되어 있다. 외부 공개로 변경하면 안 된다. firewalld는 not running 상태이다.
10. 실제 운영 Caddyfile은 /opt/roxstock/infra/caddy/Caddyfile이며 컨테이너 /etc/caddy/Caddyfile에 읽기 전용 마운트되어 있다.
11. 기존 Caddy HTTPS 설정과 roxstock_caddy_data, roxstock_caddy_config 볼륨을 보존해야 한다. 인증서나 볼륨을 초기화하거나 삭제하면 안 된다.
12. 운영에 사용하는 미커밋·미추적 파일이 있다. 자동배포에서 git reset/clean 등으로 작업 트리를 일괄 덮어쓰거나 정리하면 운영 구성이 손상될 수 있다. 특히 infra/caddy/와 운영 DB Compose 파일을 보존해야 한다.
13. 컨테이너 IP는 점검 당시 값이며 재생성 시 변경될 수 있다. 배포 설정에는 Docker DNS 이름을 사용한다.
14. 기존 프론트엔드/Caddy 프로젝트는 roxstock, DB 프로젝트는 roxstock-db로 분리되어 있다. 새 배포가 기존 프로젝트 및 네트워크를 불필요하게 재생성하지 않도록 범위를 명확히 해야 한다.
15. 이번 문서는 기존 읽기 전용 점검 결과만 기록한다. 문서화 과정에서 운영 설정, 환경파일, 컨테이너, 네트워크, 볼륨, DB를 변경하지 않았다.

## GitHub/CI·CD 담당에게 전달할 내용

| 항목 | 실제 서버 정보 및 배포 시 반영할 사항 |
|---|---|
| Caddy Docker network | roxstock_app, roxstock_default |
| Caddy와 backend의 공유 네트워크 | 기존 roxstock_app 사용을 기준으로 구성; 현재 backend는 미배포 |
| MariaDB Docker network | 기존 roxstock-db_default |
| MariaDB container DNS 이름 | roxstock-mariadb (별칭 mariadb) |
| backend 내부 port | TCP 3300, listen host 0.0.0.0 |
| Caddy가 backend에 접근할 방법 | backend를 roxstock_app에 연결하고, 배포 시 정한 backend 서비스 DNS 이름의 3300 포트로 프록시. backend 서비스명은 아직 확정된 운영 값이 아님 |
| backend가 MariaDB에 접근할 방법 | backend를 roxstock-db_default에 연결하고 roxstock-mariadb:3306으로 접속 |
| DB명 / 사용자 | roxstock / roxstock |
| 운영 환경파일 위치 | 기존 /opt/roxstock/backend/.env가 있음. 컨테이너용 설정이 필요하면 /opt/roxstock/backend/.env.production 등 별도 파일을 서버에서 권한 600 및 Git 제외 상태로 관리하는 방안을 권장. 제안 경로의 파일은 이번에 생성하지 않음 |
| DB 운영 환경파일 | 기존 /opt/roxstock/infra/docker/.env.prod 유지. 내용은 공유 문서에 기록하지 않음 |
| API 라우팅 | /api prefix 유지. 현재 전용 프록시 없음 |
| healthcheck | /health, DB 확인은 /health/db. 두 경로 모두 /api 밖에 있음 |
| 기존 Compose 파일 | /opt/roxstock/compose.yml 및 /opt/roxstock/infra/docker/compose.prod-db.yml |
| 주요 충돌 가능성 | 운영 미커밋 변경 덮어쓰기, infra/caddy/ 삭제, 기존 Compose 프로젝트/컨테이너 재생성, 기존 네트워크 삭제, 인증서·DB 볼륨 삭제, 호스트 기준 DB 접속 주소 재사용, 3300/3306 외부 공개 |

별도 Compose 프로젝트로 backend를 배포한다면 기존 네트워크를 정확한 이름으로 참조하는 구성을 검토해야 한다. 새로운 backend DNS 이름, 이미지명, Compose 파일 및 배포 절차는 GitHub/CI·CD 담당이 준비할 사항이며 아직 운영 서버에 적용되지 않았다.

## 다음 담당

GitHub/CI·CD 담당

GitHub 담당은 이 문서를 확인한 뒤 다음 구성을 진행한다.

- backend Dockerfile
- Docker image 구성
- CI 검증
- GitHub Actions
- Docker Hub
- Cafe24 자동배포

## 향후 인수인계 규칙

- 공식 공유 디렉터리는 docs/handoff/이다.
- 파일명은 YYYYMMDD-HHMM-담당-작업.md 형식이며 실제 작성 시각의 한국시간(KST)을 사용한다.
- 담당 표기는 server(웹서버), github(GitHub/CI·CD)로 통일하고 작업명은 짧은 영문 kebab-case를 사용한다.
- 작업 지시, 점검, 배포, 장애 및 복구 결과는 작업마다 새 문서로 누적한다. 기존 문서를 덮어쓰지 않는다.
- GitHub 담당은 최신 server 문서를, 웹서버 담당은 최신 github 문서를 확인하여 작업을 인계받는다.
- 비밀번호, 전체 DB 접속 문자열, 개인키, Secret, 토큰 및 인증서 개인키는 문서에 기록하지 않는다.
