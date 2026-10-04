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

### 초기 구현 및 제한 검사 시작

- 구현 커밋: `e5b4b1d3f6f96883b473c3d392de7525c2bf415d` (작업 브랜치에 푸시 완료), PR #78.
- 로컬 새 검사 TypeScript 구문 확인: `node --experimental-strip-types --check frontend/tests/targets/stock-scroll-restoration.spec.ts` 성공. 앱의 TypeScript/빌드는 코드가 같으므로 Run 37123554472의 통과 결과를 보존한다.
- 실행 중: Stock Scroll Restoration Check Run `37125025589`, 검증 SHA `e5b4b1d`, 세 분류×커버/펼침 6건. 실제 스크롤 범위와 세 복귀 시점의 JSON을 남긴다.
- 새 Frontend Check `37125025600`와 Stock Function Check `37125025578`은 변경 범위 선택 단계 성공. 앱/이전 기능 입력이 변하지 않아 기존 검사 job은 실행하지 않는다. 신규 스크롤 검사만 실행한다.
- 다음 작업: 기존 실행 ID를 이어서 조회하고 결과를 기록한다. 성공하면 결과 기록을 커밋·푸시하고 중복 검사 없이 PR 병합한다. 실패면 로그/JSON을 읽고 원인에 해당하는 코드/검사 조건만 수정한다.

### 스크롤 검사 종료 체크포인트 · 2026-10-03 22:07 KST

- 검증 소스 SHA: `e5b4b1d3f6f96883b473c3d392de7525c2bf415d`.
- Stock Scroll Restoration Check Run `37125025589`, job `111208460574`: **6/6 통과**, 검사 실행 시간 56.7초. 보유·관심·거래 각 30개에서 스크롤 범위 >420px를 검증하고 420px 이동 후 입력/브라우저/헤더 복귀에서 정확한 위치와 조건을 복원했다. 건너뛴 분류나 실패를 성공으로 변경한 항목 없음.
- 기능 실패/제품 수정: 없음. 세 분류 모두 충분한 데이터에서 정상 복원한다. 이전 기록의 관심·거래 복원 증거 부족은 해소했다.
- TypeScript·빌드: 앱 입력이 동일하여 기존 성공 Run `37123554472` 보존. 새 Frontend Check `37125025600`는 변경 범위 선택 단계만 성공하고 타입/빌드 job은 미실행. 기존 기능 결과도 그대로 보존한다.
- 새 workflow 구문/범위 선택: Frontend Check `37125025600`, Stock Function Check `37125025578` 성공. 신규 검사 파일의 로컬 TS 구문 검사 성공.
- 결과 자료: 최초 Run의 로그에 6/6 통과 기록이 있다. Playwright의 메모리 첨부는 HTML 보고서 내부에 포함됐고 기존 artifact 경로에는 독립 파일이 없어 업로드 경고가 발생했다. 성공 캐시는 검사 입력 해시로 저장했다. 단순 결과 기록 커밋에서는 실검사를 재실행하지 않는다.
- 남은 문제: 이 작업 범위에서 없음. 전체 시각 QA/전체 회귀는 별도 요청 대상이며 이번에 실행하지 않았다.
- 다음 실행: 결과 기록 커밋·푸시 → 성공 결과 재사용 확인 → PR #78 병합 → 운영 `sha-3c8cbd3`의 기존 배포 성공 상태 재확인 → 작업 종료. 앱 변경이 없어 동일 앱의 이미지 빌드/배포는 중복 실행하지 않는다.

### 측정 기록 업로드 교정

- 종료 체크포인트 `3d66e843ac57bb0715e93f7defcaac4fc4de3524`를 브랜치에 푸시했다. 첫 검사 성공은 보존한다.
- 원인: `info.attach({body})`는 성공 시 별도 디스크 결과 파일을 만들지 않았고, HTML 보고서는 artifact 대상 밖이었다. GitHub 로그에 `No files were found ... frontend/test-results/targets/` 경고를 확인했다. 기능 실패가 아니라 기록 산출물 결함이다.
- 수정: 각 테스트의 finally에서 `scroll-metrics.json`을 실제 파일로 저장하고 파일 첨부로 바꾼다. HTML 보고서도 artifact에 포함한다. 검사 조건·앱 복원 코드는 변경하지 않는다.
- 다음 실행: 기록 코드/업로드 경로가 변경된 제한 검사만 실행해 6건 결과 및 JSON artifact 생성 확인 → 결과 커밋·푸시. 타입·빌드·기존 기능·배포는 재실행하지 않는다. 첫 실행의 성공을 삭제하거나 실패로 바꾸지 않는다.

### 기록 산출물 교정 검사 종료 · 2026-10-03 22:13 KST

- 최종 검증 소스: `7105aefc0ed02b72460069e2a4151a876d7c7874`.
- 실행: [Stock Scroll Restoration Check 37125342721](https://github.com/byungho-cho/roxstock/actions/runs/37125342721), job `111209402879`, **6/6 통과** (58.1초).
- 결과 산출물: `stock-scroll-evidence`, artifact `11274835752`. 측정 JSON 및 HTML 보고서 업로드 성공을 확인했고 JSON 6개를 직접 읽었다.
- 실측: 커버 보유 최대 4237px / 관심 4507px / 거래 3427px, 펼침 세 분류 최대 714px. 모두 420px에서 입력 닫기·브라우저 뒤로가기·헤더 뒤로가기 후 **420px / 420px / 420px**로 복원.
- 중복 방지 실증: 문서 체크포인트 `3d66e843`의 Run `37125252607`는 동일 입력의 성공 캐시를 읽었고 npm 설치·브라우저 설치·6건 기능 검사를 모두 미실행했다. 성공으로 위장한 실패/생략은 없으며 실제 통과 Run은 `37125025589`와 기록 코드 변경 후 `37125342721`로 구분한다.
- 보존 결과: 앱 TypeScript·빌드 및 기존 8개 단위/78개 관련 브라우저 검사는 원본 `2ddd4df`의 성공 기록을 유지한다. 앱 소스 변경이 없어 재실행하지 않았다.
- 종료 상태: 구현·필요한 기능 검사·기록 파일 검증 완료, 제품 오류/남은 수정 없음. 결과 기록 체크포인트를 작업 브랜치에 커밋·푸시하고 PR #78을 병합한다. 최종 병합 상태/커밋은 [PR #78](https://github.com/byungho-cho/roxstock/pull/78)의 원본 기록으로 확인한다.
- 운영: 이번 변경은 검사 설정·테스트·문서뿐이다. 기존 앱 `sha-3c8cbd3`의 배포 성공 Run `37123959184`를 확인하고 중복 배포하지 않는다. 사용자 운영 화면 검증을 기다리며 작업을 유지하지 않는다.

## 2026-10-04 · C1200/T1200 매매일지 v0.4 (KST)

- 복구 기준 main: `41a98a8078ddfeeaf83b559641dfd478a280ae8e`. 열린 PR 0 / 실행 중인 검사 0. 앞선 C1100/T1100 결과와 운영 `sha-3c8cbd3` 보존.
- 작업 브랜치: `codex/journal-v04-refactor-20261004`.
- Figma: C1200 305:5 / FINAL 779:2 / DETAIL 183:2, T1200 774:2 / FINAL 3283:210·3283:675, 개발 명세 3144:57·3287:719. REVIEW 높이 사용하지 않음.
- 구현: 302px·6주 달력, 7열 동일 기준, 배경 알파 70% 녹색/적색 칩 및 흰색 글자, outline만 선택 강조. 커버 본문·태블릿 2열 독립 스크롤, sticky 날짜 44px+8px, 마지막 80px, 기존 overlay scrollbar 재사용. 현재 태블릿 v0.4 하단 메뉴 재사용.
- 데이터: 실제 계좌·기간 조회 유지. 기존 buy-lots API를 remainingOnly=false로 조회해 완전 매도 Lot도 연결한다. 평균단가 사용하지 않고 매도수량×Lot단가로 원가·손익 계산. 불명확한 원가/손익은 —. 거래현황은 매수/매도 분리 컴포넌트를 메인/일별손익에 공통 사용.
- 기존 동작 우선: 월 이동은 기존 선택 일자를 해당 월 유효 일자에 맞춰 유지한다. T1200 메모의 이전월 말일/다음월 1일 제안과 달리 이번 요청의 기존 기간 이동 유지 조건을 따른다. 스와이프·수정 목적지·계좌별 페이지 메모리 유지.
- 런타임 앱/API/DB에 Figma 예시 값 추가 없음. 기존 오프라인 매매일지 전용 예시 배열을 제거했다. API 계약·저장 동작·백엔드 변경 없음.
- 로컬 검사: 환경의 Windows managed-network sandbox 초기화 오류로 명령 실행 불가. 확인 없이 반복하지 않고 GitHub Actions에서 분리 TypeScript/빌드/매매일지 제한 기능 검사를 수행한다.
- 검증 범위: journal-v04.spec.ts 6건 × 4뷰포트. 날짜·월·스와이프·일별손익·연결Lot/분할매도·수치·스크롤복원·sticky·최하단·폭넘침·칩·실패/미수집 구분. 전체 회귀/전체 시각 QA 미실행.
- 구현 완료 체크포인트: 이 절을 추가한 커밋을 브랜치에 푸시하고 PR 검사 실행 ID를 추가 기록한다.
- 남은 작업: 제한 기능 검사 + 별도 TypeScript + 빌드 결과 확인 → 관련 실패만 수정 → 종료 시 기록 커밋·푸시 → PR main 병합 → 자동 배포 성공 및 배포SHA 확인.

### 첫 구현 검사 종료 및 조건 교정 · 2026-10-04 09:01 KST

- 구현 SHA: `2654f30841cb1b04867b78248d3cfbebe1c45c18`, [PR #79](https://github.com/byungho-cho/roxstock/pull/79).
- TypeScript: Frontend Check `37163408706`, job `111321390541` 통과. Build: 같은 Run job `111321390555` 통과. 로그와 성공 캐시 보존.
- 공통 메뉴 변경 관련 기존 연결 검사: Stock Function Check `37163408766`, job `111321381611`, home-plus **4건 통과**. 전체 회귀 없음.
- 매매일지: Journal v0.4 Function Check `37163408814`, job `111321364836`, **22통과 / 2실패**. 실패를 통과로 처리하지 않음. artifact `11288403609`에 로그·스크린샷·trace 보존.
- 실패 원인: 816×616에서 달력 302px+안전 여백80px가 본문528px 안에 모두 들어가 왼쪽 최대 스크롤0px인데 검사에서40px 복원을 요구했다. 370/400/725의 모든6건과816의 나머지4건은 통과. 실제 스크롤 조건의 제품 복원 오류 없음.
- 검사 조건 교정: 최대 스크롤을 먼저 측정. 725×396은 >40px 확인하고40px 이동/독립성/복원을 검증. 816×616은 최대0px와 스크롤바 숨김을 검증. 오른쪽 충분한24거래의420px 복원은 네 크기 모두 계속 검사. 기능 검사 생략/skip 없음.
- 추가 마감: FINAL의 구분선 색상 `#407AC7`, 거래 세부 회색 `#7A859E`, 달력/선택일 거래 카드 배경·테두리를 정확한 디자인 값으로 교정. 색상 코드가 변경되어 TypeScript/빌드/관련 기능 재검사 필요.
- 검사 기록: 성공 화면 PNG를 CI 로그에서도 읽을 수 있도록 남겨 로컬 샌드박스 장애에도 요청 화면의 렌더를 직접 확인한다. 저장소 밖 운영 데이터는 사용하지 않음.
- 중복 방지: Stock Function 변경 범위는 synchronize의 before SHA부터 계산하여 뒤따르는 색상/문서 커밋에서 관련 없는 home-plus 검사를 반복하지 않음.
- 다음 작업: 교정 커밋·푸시 → 새 소스 제한 기능24건과TypeScript/빌드 결과 확인 → 요청 화면 PNG 확인 → 종료 체크포인트 → 병합/자동 배포.

### 조건 교정 검사 종료 및 sticky/캐시 마감 · 2026-10-04 09:06 KST

- 교정 소스 SHA: `91d7c3226f023b2a4b5d2c37c7242d29c37d9443`.
- Journal v0.4 Function Check `37163681143`, job `111322153038`: **24/24 통과** (2.5분). 첫 Run의2실패는 정확히 검사 조건 교정으로 해소. 새 계좌 선택 검사도 정상.
- Frontend Check `37163681113`: TypeScript job `111322174337` 통과 / Build job `111322174373` 통과. Stock Function `37163681147`는 관련 입력 변경이 없어 scope만 실행하고 기존4건 성공을 보존.
- 요청 화면 렌더: 네 뷰포트 메인·일별손익 PNG를 CI 로그에서 읽어 실제 Figma 화면과 비교했다. 달력·열 간격·카드·단위·긴 종목명이 정상. 전체 QA 아님.
- 마감 수정1: sticky 날짜의44px 카드 아래8px를 불투명한 고정 컨테이너에 포함해 스크롤 중에도 콘텐츠가 그 간격을 침범하지 않게 한다. 카드44px/컨테이너52px/간격 hit-test를 추가한다.
- 마감 수정2: 새 연결Lot 조회 키를 기존 수정/삭제가 invalidate하는 `buyLots` 계열에 연결한다. 매수단가 수정 후 매매일지에 돌아왔을 때 이전 원가를60초동안 보여주지 않게 한다. 기존 매수 수정 화면/API는 변경하지 않는다.
- 관련 기능 검사 추가: 실제 테스트 API에서 연결Lot단가70,000→80,000 수정 후 매도수량2의 원가140,000→160,000 / 손익80,000→60,000 갱신 및 선택일 유지. 총7건×4크기 **28건** 제한 검사. 운영 데이터 변경 없음.
- 다음 실행: 마감 커밋·푸시 → 바뀐 소스의 제한28건+TS/Build → 결과/이미지 기록 → 병합/자동배포. 이전 성공 기록은 보존한다.

### sticky/거래 수정 검사 종료 및 헤더 마감 · 2026-10-04 09:13 KST

- 검증 SHA `e0f3527b6baf1c9c5bd1d71409386ce8c03ba3df`.
- Journal `37164058928`, job `111323257441`: **28/28 통과** (2.9분). 네 크기의 sticky44px+고정8px hit-test, 실제 거래 목록420px 복원 및 매수Lot단가 변경 후 원가/손익 재조회 모두 통과.
- Frontend `37164058917`: TypeScript `111323282041` / Build `111323282021` 통과. 관련 없는 이전4건은 재실행하지 않음.
- FINAL 헤더 마감: MUI 기본 min-height42px를 명시적으로32px로 제한해 오늘 버튼32px 유지. 일별손익 헤더 제목을 명세의 좌정렬로 지정. 관련 높이 assertion 추가.
- 배포 중복 검사 방지: Frontend Check workflow의 push/merge에서는 HEAD^2의 성공한 PR Frontend Check를 읽고 앱 입력(src/public/컴파일설정/패키지/Docker 입력)이 merge와 동일한 경우에만 타입/빌드를 재사용한다. 조회/동일성/성공 조건이 충족되지 않으면 기존 검사 경로 유지. 실제 이미지 빌드·배포·health 검증은 계속 수행한다.
- 다음 실행: 헤더/검사 마감 커밋 → 최종28건/TS/Build → 결과 문서 체크포인트(성공 캐시 재사용) → PR 병합 → 자동 이미지 배포와 성공 검증 재사용 로그 확인.

### 최종 구현·검사 종료 체크포인트 · 2026-10-04 09:16 KST

- 최종 앱 검증 SHA: `106201154a71312d62bce5a2495c6883226d0545`.
- [Frontend Check 37164328771](https://github.com/byungho-cho/roxstock/actions/runs/37164328771): TypeScript job `111324068493` 통과, Build job `111324068414` 통과.
- [Journal Function Check 37164328799](https://github.com/byungho-cho/roxstock/actions/runs/37164328799): job `111324045289`, **28/28 통과** (1.6분). 370×465·400×640·725×396·816×616 각각7건, 생략/skip0.
- 최종 테스트 범위: 6주302px/7열/칩/선택/기간·스와이프, 실제 연결Lot·분할원가·합계·소수 계산, 매수/매도 공통 형식 및 긴 텍스트, 계좌 변경/미수집/조회 실패, 본문/열 독립 스크롤·420px복원, 날짜44px+고정8px, 80px여백, scrollbar4px 표시/숨김, 오늘 버튼32px, 매수단가 수정 후 원가/손익 갱신.
- artifact `11288951956` (journal-v04-evidence): 성공12개 화면PNG·HTML보고서. CI 로그에서 네 크기의 메인/일별손익/최하단 실제 PNG를 직접 확인했다. 별도 전체 QA/전체 회귀 없음.
- 보존한 관련 메뉴 연결4건: Run `37163408766`. 후속 Stock Function `37164328783`는 관련 코드가 다시 변경되지 않아 기존 성공을 보존.
- 제품 미해결 문제: 없음. 처음816×616 달력의 무스크롤 조건 실패는 별도 기록한 조건 교정으로 해결되었고, 실제 스크롤 복원 실패는 없었다.
- 현재 결과 기록 커밋은 문서만 변경한다. 앱/검사 입력이 동일하므로 이미 통과한TypeScript/빌드/기능 결과를 재사용하고 실검사를 반복하지 않는다.
- 다음 실행: 체크포인트 CI 재사용 확인 → PR #79 main 병합 → Frontend Docker Image 자동배포·healthy/HTTP 성공 확인 → 배포SHA/완료시각 기록·보고·종료. 사용자 운영 검증 대기 없음.
