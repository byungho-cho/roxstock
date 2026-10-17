# 자동 가치지표 보완: DB 순차 작업과 실행 임대

기준: main `88aac1c32fb4c968fe64c8f71e50aa8d3002cac6`, v1.1.8. 기존 수동 갱신의 접수/실행 시각, FIFO, 만료 정리, 재접속 동기화, 자료 검증과 계산식은 재사용한다.
조사: [2026-10-17 장애 보고서](https://github.com/byungho-cho/roxstock/blob/docs/collector-incident-20261017/docs/handoff/20261017-collector-lock-oom-investigation.md).

## 범위와 데이터 구조

`dart_backfill_tasks`는 공시 원본 수집의 기간·공시 선택 상태다. 보완 성공/불가를 이 표의 SUCCESS/NO_FILING에 덮어쓰지 않는다. `collector_runs/items`는 실행 이력으로 유지한다. 보완 작업에 필요한 소유권·입력 버전·재등록 상태는 기존 표에 없으므로 다음 세 표를 추가했다.

- `valuation_supplement_tasks`: `(security_id,fiscal_year,period_type,kind)` 고유. 공시 ID와 입력 해시, 조회용 ready, 우선순위, 상태, 시도 횟수, 다음 시각, 시작/종료, 소유자, 임대/heartbeat, 안전한 진단을 저장한다.
- `valuation_supplement_scan`: 탐색 소유권, cursor, 한 순회의 고정 upper_id, 단계/heartbeat, 조회 건수와 자동 작업 차례를 저장한다. 신규 행이 계속 생겨도 현재 순회가 끝나므로 기존 공시의 변경을 다시 확인한다.
- `valuation_supplement_budget`: 서울 날짜별 원자적 예약 수. 하루 최대 200기간이며 배포 당일 기존 실행의 reservedPeriods/reservedCalls도 SQL 단일 집계로 승계한다.

원본 재무제표와 기존 가치지표는 초기화하지 않는다. 기존 화면/계산과 같은 period_valuations 및 정확한 공시의 주식수 표에 결과를 저장한다.

## 등록과 상태 전이

최초 등록과 재탐색은 동일한 keyset 경로다. 한 페이지 100 ID, 한 주기 최대 2페이지/200 ID, 탐색 시간 20초를 제한한다. SQL에서 활성 주식, 2015~현재 연도, ANNUAL/Q1/Q2/Q3, 철회/제외/종목코드 namespace, 최신 공시 및 누락 조건을 확인한다. 재무 JSON 원문을 전송하지 않고 ID·버전·작은 상태 플래그만 반환한다. JSON_TABLE/JSON_EXTRACT는 제한된 ID 페이지에만 적용한다. account_sources 전체를 후보 목록으로 읽지 않는다.

EPS/BPS/ROE 누락, 양의 분모인데 없는 PER/PBR, 공시 일치 주식수·계정 근거 부족을 판정한다. 문자열 숫자를 SQL에서 명시적으로 숫자로 변환한다. 실제 0과 NULL은 다르며, 0/음수 분모의 비율 부재는 기존 valueCompletion 정책에 따라 정상 부재다. 기존 음수 비율을 지우지 않는다.

- PENDING → PROCESSING → COMPLETE / RETRY / UNAVAILABLE.
- RETRY는 24시간 후다. 정상 원천 부재/계산 근거 부족이 3회 계속되면 UNAVAILABLE. 통신·인증·파싱·공급자·한도 장애는 이 기준으로 영구 종료하지 않는다. 외화/미지원 원본은 API 호출 없이 UNAVAILABLE.
- 공시 ID/접수·수집 시각/정규화 버전, 주요 재무 금액·기간·귀속, 전기 연간 자본, 종목/수집 revision, 기업 코드 또는 정책 버전 변경 시 재등록한다. 수동/KIS의 period_valuations 변경 시각도 감지한다. 현재 원본 account_sources를 수정하는 경로는 collectedAt을 함께 갱신해야 한다.
- 전기 자본의 보완 계정도 금액·공시·귀속 해시에 포함한다. 원본 공시가 바뀌지 않아도 ROE 기준이 보완되면 다시 대상으로 잡으며, 전기 보완의 재시도 시각만 바뀐 경우는 입력 변경으로 보지 않는다.
- 자신이 쓴 가치지표의 updatedAt은 작업의 valuationAt에 저장하므로 매 순회 자신의 결과를 새 입력으로 오인하지 않는다. 변경 없는 COMPLETE/UNAVAILABLE를 다시 외부 호출하지 않는다. 제외 후 재활성화된 작업은 다시 등록할 수 있다.
- 등록 감지는 제한된 순회가 해당 ID를 다시 만났을 때다. 과거 행 변경을 즉시 전부 탐색한다고 보장하지 않는다. 신규 전체 로딩이나 전체 JSON 재검사는 없다.

## 실행·잠금·공정성

탐색 전에 SUPPLEMENT_SCAN 실행 이력을 만들며, 탐색은 공용 실행 잠금 밖에서 한다. due 인덱스 `(ready,next_attempt_at,priority,id)`로 최대 10 ID를 선택한다. 더 오래 대기한 작업부터 처리하고 같은 시각에서는 보유/관심 우선순위를 적용한다. 최근 새 작업이 오래된 일반 종목을 계속 추월하지 않는다.

실제 처리는 순차적이며, 한 기간마다 공용 `dart-financial-statements` 임대를 획득하고 짧은 DB 트랜잭션에서 하루 예약과 작업 확보를 원자적으로 처리한다. 이후 종목/제외/현재 공시/입력 버전을 재검증한다. 전체 주기는 240초, 개별 기간은 120초 제한이다. 보완 상세 JSON과 전기 근거는 실제 기간 하나에 대해서만 읽는다. 외부 API 동안 DB 트랜잭션을 열어두지 않는다. 기존 호출 최소 간격(최소 2초), 제공자별 한도와 일정은 유지한다. 빈 대상과 소진된 한도에서는 외부 호출이 없다. 제공자 일일 한도 오류는 해당 서울 날짜의 QUOTA_BLOCKED 상태로 저장한다.

자동 DART·수동 갱신·자동 기간 보완은 같은 실행 임대를 계속 사용한다. 90초 임대/20초 heartbeat로, 프로세스가 죽거나 event loop가 멈추면 갱신되지 않는다. 만료된 소유자가 heartbeat로 자기 잠금을 되살릴 수 없다. 구버전이 남긴 900초 임대를 행/실행 부재만으로 지우지 않는다.

DB 쓰기는 revision row → 실행 임대 row → 작업 row(자동 보완) → 종목 순으로 짧게 잠그고, 쓰기 직전과 commit 직전에 소유권과 유효기간을 검증한다. 소유권 상실/시간 초과 후 늦게 도착한 응답은 저장하지 못한다. 임대가 끝난 PROCESSING은 소량(최대 10) 조건부 갱신으로 RETRY로 돌리며, 완료 결과나 공용 잠금은 삭제하지 않는다. 수동 진행/종료 기록도 lockOwner CAS로 이전 실행의 덮어쓰기를 막는다.

수동 요청은 시작 전과 각 기간 경계에서 확인하고, 잠금을 해제한 상태에서 우선 처리한다. 첫 등록도 계속 진행할 수 있도록 양보한 주기에 제한된 탐색만 수행한다. 수동 완료 3건 이상이며 자동 차례가 10분 넘게 없으면 다음 자동 기간 하나의 차례를 예약한다. 이미 실행 중인 수동 요청은 중단하지 않는다. 예약은 최장 690초이고 탐색기 활동이 90초 끊기면 수동/DART는 예약을 무시한다. 자동 작업이 기간 하나를 확보하면 예약을 해제한다. 보통의 요청 우선권을 유지하면서 계속 들어오는 요청으로 자동 보완이 영구 기아 상태가 되는 것을 막는다.

한투 별도 수집기의 연간 지표 저장도 공용 실행 임대와 commit 전후 fence를 사용한다. 현재 참고 스냅샷은 별도 표에 보존하고, 공용 임대가 바쁘면 연간 지표 저장만 양보한다. 종목 후보를 SQL에서 최대 10개로 제한하고, 연간 보완 역시 한 실행 최대 10기간, 필요한 공시만 기간별 조회한다. 투자동향 자체의 잠금/원본은 변경하지 않는다.

유효한 임대인데 heartbeat가 오래되면 대기 화면에서 LOCK을 CHECKING으로 바꿔 숨기지 않는다. `leaseState=CHECK_REQUIRED`로 소유자 확인 필요를 별도 표시한다. 원시 토큰은 공개 trace/리포트에 포함하지 않는다.

## DB 오류 조사

삼성전자 10243의 과거 DATABASE_ERROR는 구체 번호가 보존되지 않아 원인을 확정하지 않는다. 잠금/OOM과 같은 원인으로 묶지 않았다. 수동 결과에 안전한 진단을 저장하고 로그에 요청·종목·연도·기간·단계, Prisma P-code, 숫자 native code, 허용된 모델명만 기록한다. SQL, 임의 meta/target, 원문 응답, 키와 토큰은 기록하지 않는다.

이번 검증에서는 신규 하루 예약을 Prisma emulated upsert 후 FOR UPDATE로 읽을 때 동시 실행에서 MariaDB 1020/P2010을 실제 재현했다. 첫 문장을 native INSERT ... ON DUPLICATE KEY UPDATE로 바꾸어 원자적으로 잠근 뒤 읽도록 수정했고 동시 확보가 한 번만 성공했다. 이것이 과거 10243 오류의 원인이었다고 주장하지 않는다. 기존 main의 analysis revision 선행 잠금 보완은 그대로 유지한다.

## 검증과 측정

운영 데이터 재조회/OOM 재현은 하지 않았다. 전용 loopback MariaDB의 합성 자료를 사용한다. `collector/tests/valuation-queue.integration.ts`와 memory/crash 하위 프로세스가 재현 방법이며 Collector Split Check에 포함한다.

합격 기준: 후보 ID 200/2페이지, 실제 확보 10기간, 동시에 원천 처리 1, 일일 원자 예약 200, 대상·한도 없음의 외부 호출 0, 메모리 하위 프로세스 V8 한도 128MiB/관측 힙 <112MiB/RSS <320MiB, 후보 탐색 SQL ≤650회이며 크기 증가의 쿼리 차이 ≤10, 강제 종료 후 임대 만료 회수 및 이전 소유자 저장 0, 원본/기존 값/캐시 revision 보존.

2026-10-17 Windows 로컬, Node v24.21.0, MariaDB 13.0.2, JSON payload 2,048자/행의 측정(프로세스 별도 실행):

| 원본 행 수 | 후보 ID/페이지 | SQL 수 | 관측 최대 힙 | 최대 RSS | 탐색 시간 |
|---|---|---|---|---|---|
| 1,000 | 200 / 2 | 426 | 14.75 MiB | 79.73 MiB | 269.7 ms |
| 70,000 | 200 / 2 | 426 | 14.74 MiB | 79.58 MiB | 263.0 ms |

힙은 query 이벤트에서 관측한 최고값이고 순간 피크를 전부 샘플링한 값은 아니다. 별도로 V8 128MiB 제한 하에서 성공했고 RSS는 OS maxRSS다. DB 버퍼/서버 메모리는 이 Node 수치에 포함하지 않는다. 7만 행 JSON payload 자체는 약 137MiB이며 JS에 올리지 않았다. 샘플마다 처리 시간 차이는 성능 향상 수치가 아니다.

강제 자식 프로세스 종료(소유권 해제/finally 없음) 후 90.1초에 회수, attempts=2 재개를 확인했다. 이는 검증 DB 시간이며 운영 수동 요청의 향후 실제 대기시간 보장은 아니다. due 조회 EXPLAIN은 valuation_supplement_due_idx, Using where; Using index이고 filesort가 없다. 후보 키는 PRIMARY 범위이며 최신 공시에는 dart_filing_latest_idx를 추가했다.

동시 claim/재시작, 만료 전 정상 임대 보존, 만료 후 구 소유자 finish 거절, commit 전 임대 상실의 금융 값·revision rollback, 수동 양보/재개·기아 방지, 정상 부재와 통화 정책, 원본 JSON 보존을 검증한다. 기존 수동 갱신 DB 통합 검증도 유지한다.

미검증: 운영의 수정 후 실제 메모리/대기시간, 당시 특정 힙 객체/누수 여부, 원래 요청 10243의 정확한 Prisma 번호, 운영 네트워크/한투 실제 오류 응답, 서로 다른 서버의 큰 시계 오차. 로컬 Node 24/MariaDB 13의 수치를 운영에 그대로 적용하지 않는다. CI는 Node 20/MariaDB 11.8.9로 같은 통합 검증을 실행한다.

## 배포와 롤백

마이그레이션 20261017123000_bounded_valuation_queue는 세 표와 dart_filing_latest_idx를 추가하고, 20261017123100_valuation_scan_frontier는 upper_id를 추가한다. 기존 공시·가치지표·DART 작업·잠금을 변경하거나 삭제하지 않는다. 데이터가 있는 DB의 적용은 기존 deploy-production-component.sh가 먼저 서버 로컬 dump → gzip 검사 → SHA-256 파일을 만든 뒤 migrate deploy하는 절차를 따른다. 덤프/환경파일은 Git에 올리지 않는다.

백엔드, 일반/실시간/DART collector 이미지, 프런트엔드, 별도 investor-crawler 이미지를 같은 병합 SHA로 배포한다. APK 변경은 없다. 구 이미지는 새 표를 모르는 구조이므로 추가 스키마를 유지한 채 이미지 롤백할 수 있다. 단, 구 코드에는 fence가 없으므로 신/구 금융 writer를 동시에 실행하지 않는다. 자동 보완을 VALUATION_SUPPLEMENT_ENABLED=false로 멈추고 금융 writer들을 정상 정지한 뒤 임대 만료/쓰기 종료를 확인하고 이전 이미지들을 복원한다. PROCESSING 작업은 삭제하지 말고 새 코드 재적용 때 임대 회수로 이어간다. 새 테이블·인덱스를 바로 DROP하지 않는다. 되돌릴 필요가 있으면 제한된 백업/진단을 보존한 후 별도 검토한다. 정상 이미지 롤백에는 운영 DB 전체 복원이 필요 없다.

운영 확인은 작업 상태별 집계, scan phase/cursor/upper_id/heartbeat, quota, 해시 ownerId 실행 이력과 잠금 시각을 대조한다. 원시 토큰이나 재무 JSON을 공개 보고서에 복사하지 않는다. 작업이 없다는 이유로 잠금을 지우지 않는다.

## 별도 후속 사항

주말/휴장일 market-prices 전체 수집은 별도 잠금·별도 이슈다. 거래일 기준 스케줄과 과거 누락 보충 정책을 나누는 후속 작업으로 남긴다. 이번 재무 임대/OOM 수정에 섞지 않는다.
