# 계정 분리 전 운영 복구 기준점 확보 완료 · 2026-10-20

[원 지시문](https://github.com/byungho-cho/roxstock/blob/docs/pre-auth-freeze-20261020/docs/shared-reports/pre-auth-freeze-20261020.md)에 따른 서버 사전 준비 결과다. 계정 생성·데이터 소유권 변경·인증 기능 배포·사용자 임시 비밀번호 생성·메일 발송은 수행하지 않았다.

**소스 태그 원격 등록, 현재 운영 DB 일관 백업, 격리 복원 검증을 완료했다. 복구 기준점 확보 관점에서 계정화 개발 착수가 가능하다. 메일 발송 설정은 준비되지 않았으며 인증 배포·실제 발송은 이번 완료 범위에 포함하지 않는다.**

## 1. 실제 운영 상태와 기준 소스 차이

운영 내부 HTTP API `/api/version` 응답은 **1.1.26**, `/health/db`는 connected다. 작업 종료 검사에서도 운영 8개 컨테이너 전부 running/healthy이며 각 이미지가 작업 전과 동일하다.

기준 main: **7fc626afe41bff305d565b8aae936281507cdfd4**.

- backend와 일반·DART·실시간 collector는 **2507a965465d8370159556c23829fd9296e7d1a1** 이미지다.
- main과 이 커밋의 차이는 `docs/shared-reports/news-schedule-dashboard-20261020.md` 및 보고서 JPG 증빙 2개 파일뿐이다. 운영 코드 차이는 없다.
- frontend는 **eb48c7cdb5a75400e867b0058844806384a13d81** 이미지다. 이 커밋과 기준 main의 frontend 트리는 동일하다.
- 투자동향 전용 수집기는 **ed870dfc9a0a385cfbedaa88b30cec926b912d35**다. API/일반 수집기와 같은 SHA로 가정하지 않는다.
- 단일 main SHA로 모든 운영 서비스가 빌드된 상태는 아니다. 아래 실제 이미지 digest를 서비스별 복구 기준으로 사용한다.

| 서비스 | 실행 이미지 / 소스 SHA | 복구용 불변 이미지 |
|---|---|---|
| backend | sha-2507a965465d8370159556c23829fd9296e7d1a1 | `newrox/roxstock-backend@sha256:05cef016017dcc2ddbb1c45f9625e759741d210d79dcbf7c72c28d39cbb9bd93` |
| collector | sha-2507a965465d8370159556c23829fd9296e7d1a1 | `newrox/roxstock-collector@sha256:c6f4e8d6b0552490e127f906b737cd3457b1d29ada3316c4ba1225fdfba3729a` |
| dart-collector | sha-2507a965465d8370159556c23829fd9296e7d1a1 | `newrox/roxstock-collector@sha256:c6f4e8d6b0552490e127f906b737cd3457b1d29ada3316c4ba1225fdfba3729a` |
| realtime-collector | sha-2507a965465d8370159556c23829fd9296e7d1a1 | `newrox/roxstock-collector@sha256:c6f4e8d6b0552490e127f906b737cd3457b1d29ada3316c4ba1225fdfba3729a` |
| frontend | sha-eb48c7cdb5a75400e867b0058844806384a13d81 | `newrox/roxstock-frontend@sha256:601191187dbbcb84e2e39a6ee607518b4c7a48aae47b093443936a8c7588ac06` |
| investor-crawler | sha-ed870dfc9a0a385cfbedaa88b30cec926b912d35 | `newrox/roxstock-investor-crawler@sha256:b89024514788e065c1de6cc2f43f961a19ea32c10e047001eff0554a5f344d5a` |
| mariadb | 11.8.9 | `mariadb@sha256:79d59758afc91b89b120b0a8904d637f5a3b3e1c4900f29b740d6d46c72fef68` |
| proxy | caddy:2-alpine | `caddy@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b` |

Docker image ID와 RepoDigest를 모두 기록했으며 이번 실행에서는 대응 SHA-256이 동일했다. 세 collector는 같은 이미지지만 기존 서비스별 실행 명령·환경설정을 함께 보존해야 한다.

## 2. Annotated Git 태그 등록 및 검증

태그: [freeze/pre-auth-20261020-v1.1.26](https://github.com/byungho-cho/roxstock/tree/freeze/pre-auth-20261020-v1.1.26)

- 원격 tag object: **38351dbcd6bc0dbc718a468423d1ed7712bd7a57**
- peeled commit: **7fc626afe41bff305d565b8aae936281507cdfd4**
- 원격 등록 검증: **2026-10-20 16:40:27 KST / 07:40:27 UTC**
- `git cat-file -t` 결과 tag인 annotated tag다. 기존 로컬·원격에 같은 이름이 없음을 확인한 뒤 생성했으며 강제 덮어쓰지 않았다.
- 주석에 실제 운영 이미지 digest, DB 스냅샷·백업 완료 시각, 비공개 백업 식별자, SQL gzip 체크섬을 연결했다. DB 내용·인증키·자산값은 넣지 않았다.
- `git ls-remote`의 `refs/tags/...`와 `refs/tags/...^{}`를 각각 tag object 및 기준 commit과 대조했다. GitHub API도 object type=tag를 확인했다.
- 기준 소스의 workflow 67개 트리거를 검사했다. 유일한 push workflow는 main의 특정 workflow 파일 변경에만 반응하고, 태그 생성·release 트리거는 없다. 배포 workflow는 수동 dispatch다. 태그 푸시 이후 해당 SHA의 push workflow 실행 조회도 0건이었다.

## 3. 운영 DB 백업

| 항목 | 결과 |
|---|---|
| 비공개 백업 식별자 | `roxstock-v0.2-20261020T073357Z` |
| 보존 디렉터리 | `/opt/roxstock/backups/roxstock-v0.2-20261020T073357Z/` |
| SQL gzip 파일 | `roxstock-v0.2-20261020T073357Z.sql.gz` |
| 작업 시작 | **10/20 16:33:57 KST / 07:33:57 UTC** |
| 스냅샷 동기화 | **16:34:01.027~16:34:01.628 KST / 07:34:01.027~07:34:01.628 UTC** |
| 백업·무결성 검사 완료 | **16:34:46.565 KST / 07:34:46.565 UTC** |
| DB 버전 | 11.8.9-MariaDB-ubu2404 |
| 압축 크기 | **87,820,856 bytes** |
| 비압축 크기 | **944,532,744 bytes** |
| gzip 검사 | PASS |
| 테이블 | **56개, 전부 InnoDB** |
| 백업 후 스키마 목록·엔진 대조 | 일치 |

SQL gzip SHA-256:

```text
3582b9b71aa31cce37bf36e8de423c4e58dbb5f5fada2171f4cd15b8d81eef4f
```

비압축 SQL SHA-256:

```text
08cad963e92aa0858e15e40e1011e9b5050a8576abf8d15efcc7663c3f00cdb8
```

서버 `AGENTS.md`의 새 백업 경로·명명 규칙을 따랐다. 식별자의 v0.2는 백업 명명 규칙이며 운영 앱 버전을 뜻하지 않는다. 기존 백업은 덮어쓰거나 삭제하지 않았다.

`mariadb-dump --single-transaction --quick --skip-lock-tables --routines --events --triggers --hex-blob roxstock`를 사용했다. 스키마·데이터·마이그레이션 이력과 존재하는 루틴·트리거·이벤트를 포함하는 옵션이다. 관련 객체 목록도 비공개 증거에 보존했다. DB 사용자·권한은 별도의 제한된 비공개 파일로 보존했다.

운영 배포의 `production.lock`을 백업 동안 잡아 정상 배포 경로의 DDL을 방지했다. 전부 InnoDB임을 확인한 뒤 **전역 읽기 잠금 약 0.601초** 동안 덤프와 대조 조회의 일관 스냅샷을 시작했다. 덤프가 실제 SELECT 단계에 진입한 것을 확인하고 잠금을 해제했다. 그 뒤 운영 쓰기·수집은 계속 진행됐다. 장기 서비스 정지·수집기 중지·잠금 행 삭제는 하지 않았다.

## 4. 격리 복원 결과

최종 검증 시작 **10/20 16:42:56 KST / 07:42:56 UTC**, SQL 복원 완료 **16:45:53 KST / 07:45:53 UTC**, 검증 후 중지 **16:46:59 KST / 07:46:59 UTC**.

- 운영과 동일한 MariaDB 이미지 digest를 사용한 전용 컨테이너다.
- Docker network=none, 포트 미공개, DB skip-networking, 이벤트 스케줄러 OFF다. 앱·외부 수집·메일 프로세스를 연결하지 않았다.
- 덤프에 CREATE DATABASE/USE 문이 없음을 검사하고, 운영과 저장소를 공유하지 않는 격리 DB에만 명시적으로 입력했다.
- 초기화용 임시 서버가 아닌 실제 mariadbd PID 1과 연결 준비를 확인한 후 복원했다.
- 동일 스냅샷의 운영 조회 결과와 복원 결과를 **전체 파일 단위로 정확히 비교**했다. 검증 시점의 최신 운영 DB와 비교해 수집 증가분을 오차로 취급한 것이 아니다.

| 검증 범위 | 결과 |
|---|---|
| 전체 56개 테이블 행 수 | **56/56 일치** |
| 주요 자산·거래 합계 | **17/17 일치** |
| 마이그레이션 이름·체크섬·완료/롤백 상태·단계 수 | **37/37 일치** |
| CHECK TABLE | **56/56 OK** |
| 증권계좌·매수 Lot·분할매도·예수금·배당 | 해당 테이블 건수 및 관련 합계 일치 |
| 계좌/종목 스냅샷 | 건수 및 잔고·평가액·수량 등 합계 일치 |
| 관심종목·뉴스·수집 설정/작업 상태 | 전체 테이블 건수 일치 |
| 실제 운영 DB 복원 | **미실행** |

17개 합계는 매수·매도 각각 수량 및 수량×단가, 예수금 amount/fee_tax_amount/balance_after, 배당 gross/net, 계좌 스냅샷 cash/stock/total/investment, 종목 스냅샷 quantity/purchase/market/unrealized다. 실제 계좌별 건수·금액 및 합계값은 공개하지 않고 비공개 검증 파일에 보존했다.

서버 여유 디스크가 약 1.3GB로 제한돼 디스크 기반 복원 시도는 안전 여유 한도에서 중지했다. 그때 만든 격리 사본만 정리하고, **tmpfs 1536MiB·RAM 384MiB·메모리+스왑 2GiB·CPU 0.75**로 제한한 격리 환경에서 최종 복원을 완료했다. 검증 후 컨테이너를 중지하면서 tmpfs의 개인정보 사본은 제거됐다. 영구 복원 DB를 서버에 계속 운영하는 상태는 아니다. 작업 종료 여유 디스크는 약 1.2GiB다.

## 5. 비공개 설정·인증키 보존과 메일 준비

- 실제 backend/collector 및 투자동향 수집기의 운영 env 파일, DB 운영 env, Compose 파일과 Caddy 설정 등 **10개 파일**을 별도 `private-config.tar.gz`에 보존했다. 아카이브 재읽기와 원본 파일별 SHA-256 대조를 통과했다.
- DB 사용자·권한 SQL은 `private-db-users.sql.gz`에 별도 보존했다. 이 파일은 비밀번호 해시를 포함할 수 있는 비밀정보로 취급하며 공개하지 않는다.
- 백업 디렉터리는 **0700**, 직접 보존한 파일은 **0600**이다. SQL gzip 자체 체크섬 파일 및 증거 묶음의 `SHA256SUMS`를 보존했다.
- 비공개 파일은 Git·웹 정적 폴더·채팅에 업로드하지 않았다. 서버 로컬 권한 제한 보관이며 별도 암호화·오프서버 복제까지 완료했다는 뜻은 아니다.
- 실행 중 backend의 환경변수 이름과 설정 여부만 확인했다. **SMTP/MAIL/SES/SENDGRID/RESEND/POSTMARK 계열 설정은 없었다.** 따라서 앱의 이메일 발송 준비 완료로 판단할 수 없다.
- 메일 제공처 계정·발신 주소·도메인 인증·전달 성공 여부는 미검증이다. 시험 메일, 계정 인증 메일, 비밀번호 메일을 발송하지 않았다. 운영 인증키를 교체하거나 새 사용자 비밀번호를 만들지 않았다.

## 6. 복구 절차와 남은 작업

1. **코드만 복구할 수 있을 때**: 위 서비스별 digest 및 해당 서비스의 보존된 Compose·env·실행 명령으로 복귀한다. 일반·DART·실시간 수집기는 같은 이미지여도 명령이 다르다. API/DB health, 서비스별 health, 수집 락·진행 상태와 화면 버전을 확인한다. 태그에서 새로 빌드하는 것을 기존 운영 digest 복귀와 동일시하지 않는다.
2. **스키마 변경 후**: 가능한 추가 방식의 마이그레이션으로 기존 소유 데이터를 보존한다. 구 코드가 신 스키마를 읽을 수 있는지 먼저 확인하고, 자동 다운 마이그레이션이나 전체 DB 복원을 가정하지 않는다.
3. **DB 전체 복원이 불가피할 때**: 복원 직전 DB를 추가 백업하고 백업 이후 거래·수집 자료의 차이를 보존한다. 쓰기 진입을 통제한 유지보수 경계에서 격리 검증·차이 재적용 계획을 확정한 뒤 진행한다. 이번 백업 시각 이후 데이터를 잃을 수 있으므로 이번 파일을 즉시 운영에 덮어쓰지 않는다.
4. 로그인 보호 배포 이후에는 롤백 중에도 접근 차단/유지보수 경계를 유지해 무인증 자산 API를 다시 공개하지 않는다.
5. 메일 제공처·발신 도메인 및 발송 자격증명을 비공개로 설정한 뒤, 별도 승인된 단계에서 시험 발송·인증/재설정 흐름을 검증해야 한다.
6. 복구점은 현재 서버에 보존돼 있다. 서버 자체 장애에 대비한 별도 비공개 위치 복제, 보존기간, 여유 디스크 확보는 후속 운영 과제다. 이미지도 장기 보존 대상으로 유지해야 한다.

이번 보고서의 완료는 **계정 분리 개발 전 복구 기준 확보**다. 계정화 코드 구현·마이그레이션·운영 인증 배포의 완료를 뜻하지 않는다.
