# DART 과거 보고기간 후보·잔여 실패 조사 및 복구 실행 계획

이번 제출은 읽기 전용 조사와 계획이다. DB 변경·초기화·격리·수집·외부 DART 요청·잠금 해제·재시작·배포를 실행하지 않았다. 기존 자동 수집을 유지했다. **승인 전 실행 가능 대상은 0건**이다. 제목과 저장 기간이 다르다는 이유로 후보 전체를 오류로 확정하지 않는다.

## 기준과 조회 범위

- 기준: [PR #213](https://github.com/byungho-cho/roxstock/pull/213), 보고 커밋 `c2f4692ae8789d3d3ff7d2ae4a24960aaafcaadd`. [이전 운영 보고](https://github.com/byungho-cho/roxstock/blob/c2f4692ae8789d3d3ff7d2ae4a24960aaafcaadd/docs/qa/dart-readonly-operating-status-20261013.md), [수정 배포 검증](https://github.com/byungho-cho/roxstock/blob/main/docs/qa/dart-source-validation-deployment-20261012.md)의 기존 근거를 재사용했다.
- 본 집계 SELECT 조회: **2026-10-13 14:01:42~14:01:57 KST** (05:01:42.156~05:01:57.694 UTC). 이후의 자동 실행 결과는 본 수치에 포함하지 않는다. 여러 SELECT 결과이므로 한 트랜잭션의 원자적 스냅샷으로 간주하지 않는다.
- 비교 범위: 원래 실패 458개 task ID, PR #213 실패 416개 ID, 기간 후보 324개 receipt. 합집합 786개 task ID; 후보와 현재 실패의 교집합 0개. 원래 실패 458개는 기존 배포 전 백업과 대조했다.
- 조사 당시 backend·dart-collector는 `258ee8d06db93d171d6ed71504f5dc9198f4daae` 이미지, healthy, restart 0. 시작 시각은 각각 13:53:27/13:53:39 KST. 과거 CollectionRun/Item에는 실행 SHA 근거가 없어 대상 목록의 `runtime_sha_evidence=UNKNOWN`을 유지한다.
- 수정 배포 경계는 2026-10-12 09:29:40 KST. 경계 이후 시도 여부와 당시 실행 버전의 확정을 구분한다. 최초 시도 정확한 시작 시각은 미확인; 최초 보존 item 생성 시각만 제공하며 전체 이력 보존 여부도 미확인이다.
- 계좌·거래 행과 우선순위 계좌 목록은 조회하지 않았다. 인증정보·금액·계좌정보를 첨부하지 않았다.

## 현재 상태와 중복 없는 분류

전체 task 상태는 PENDING 86,363 / SUCCESS 34,212 / NO_FILING 6,315 / NOT_APPLICABLE 182 / FAILED 416이다. PR #213의 FAILED 416개는 모두 여전히 FAILED; 원래 458개는 SUCCESS 46 / FAILED 412이며 추가 실패 ID 4개다. 추가 4개는 PR #213 이후 신규 실패를 의미하지 않는다. 이전 보고 이후 신규 실패 ID는 0개다.

FAILED의 코드별 235 RECEIPT_MISMATCH + 180 REVIEW_REQUIRED + 1 NETWORK_ERROR = 416. 진단 없는 REVIEW_REQUIRED 165개는 180개 안의 부분집합으로 합산하지 않는다. 보존 오류 메시지에서 165개 모두 원래 RECEIPT_MISMATCH 코드를 확인했으나 하위 원인이나 실제 실패 시점 로직은 확정하지 않았다.

수정 배포 경계 뒤 마지막 task 시도가 있는 실패는 14개, 그 이전은 402개다. 진단 있는 실패는 전체 15개이며 1개는 배포 경계 이전 GRT 대표 검증이다. 배포 후 run 5814는 10/13 03:13:33~06:00:04 KST, 성공 2,663 / 실패 14 / 건너뜀 1 / 공시 없음 2,256이다. 이 14개에 외화 1개와 개발 판정 13개가 포함된다. 실제 실행 SHA가 없어 “현재 이미지로 재실패”로 단정하지 않는다. 관측 기간도 정상 확정에는 부족하다.

|배타적 주분류|task 수|처리|
|---|---:|---|
|종료 C0|46|기존 실패가 SUCCESS로 전환; 후보 아님. 개발 현황에서 제외|
|초기화 후 재수집 후보 R1|6|기존 v2 캐시 근거와 동일 작업 자료 없음 확인; 조건부 1회 검증|
|자료 격리 후 재수집 검토 Q1|307|GRT 외 기간 후보. 오류 확정 전 개발 판정·격리 경로 필요|
|미지원 제외 X0|35|GRT 실패 18 + 기간 후보 17. 대상 통화 미확인 포함 보수적 제외|
|개발 판정 D0|13|배포 경계 뒤 기간·정정 진단 실패. 초기화로 검증 우회 금지|
|추가 근거 U|379|기존 자동 선택 가능 225 + 검토 대기 유지 154|
|합계|786|하위 집계·의존 행은 합산 금지|

기간 후보는 여전히 324개/32개 종목이다. 모두 task SUCCESS이고 저장 sourceValidation은 null이다. normalizationVersion 1:41 / 2:252 / 3:31이며 버전만으로 기간 정확성을 판단할 수 없다. 기존 후보 중 정정 완료로 입증된 건은 0개; 미정정 확정 324개가 아니라 **불일치 후보 324개 유지**다. 실제 조회 최신 선택에 들어가는 후보도 324개이며 withdrawn·현재 종목 namespace 불일치는 0개다.

후보 receipt를 직접 참조하는 PeriodValuation 행은 158개(비GRT 148개). 이 값은 잘못된 계산 확정 건수가 아니다. 같은 연도·인접 연도의 재무 행은 구조적 검토 범위로 따로 표시했다. 조사 종목 내 수동 재무/구 ValuationMetric 행 0, share snapshot 12, consensus 2는 전체 조사 종목 범위 집계이며 전부 영향받는다고 단정하지 않는다.

## 제출 목록과 근거

[evidence/summary.json](evidence/dart-recovery-plan-20261013/summary.json)에 집계 조건을, [targets.csv](evidence/dart-recovery-plan-20261013/targets.csv)에 786개 대상의 연결 정보를 제공한다. 아래 분류별 CSV는 서로 배타적이며 targets의 부분집합이다.

- [closed.csv](evidence/dart-recovery-plan-20261013/closed.csv): 종료 46.
- [reset_recollect_candidate.csv](evidence/dart-recovery-plan-20261013/reset_recollect_candidate.csv): R1 6.
- [quarantine_recollect_candidate.csv](evidence/dart-recovery-plan-20261013/quarantine_recollect_candidate.csv): Q1 307.
- [unsupported_excluded.csv](evidence/dart-recovery-plan-20261013/unsupported_excluded.csv): X0 35.
- [developer_decision.csv](evidence/dart-recovery-plan-20261013/developer_decision.csv): D0 13.
- [insufficient_evidence.csv](evidence/dart-recovery-plan-20261013/insufficient_evidence.csv): U 379.
- [plan-actions.csv](evidence/dart-recovery-plan-20261013/plan-actions.csv): R1/Q1 313개의 기대 상태·누적 시도·작업/filing/receipt·격리/큐/원복 프로필. 실행 스크립트가 아니다.
- [history.csv](evidence/dart-recovery-plan-20261013/history.csv): 대상별 보존 CollectionItem 1,319개. item/run/시각/진단 연결; 실행 SHA 미확인.
- [dependencies.csv](evidence/dart-recovery-plan-20261013/dependencies.csv): 직접 receipt 참조와 구조적 인접 참조를 분리한 2,479개 edge. 직접 참조도 계산 오류를 입증하지 않는다.
- [cached-evidence.json](evidence/dart-recovery-plan-20261013/cached-evidence.json): 기존 v2 캐시 115개 작업의 제목·기간·결산월·정정 목록 근거. 연결/별도·응답 통화까지 검증한 자료가 아니다.
- [source-provenance.json](evidence/dart-recovery-plan-20261013/source-provenance.json): 원래 백업 및 조회 출처.

CSV의 empty receipt/filing은 자료가 없거나 근거가 없다는 뜻이다. 시각은 UTC를 명시했으며 KST=UTC+9이다. cached closing month는 공시 목록 해석 근거이며 수집 재무 응답의 결산월 확정과 다르다. correction 유형 목록만으로 실제 반환 접수번호의 원본/정정 허용 관계를 확정하지 않는다.

## 후보 선정과 제외 이유

R1은 5개 종목/6개 작업이며 모두 누적 attempts=3, REVIEW_REQUIRED, 수정 배포 경계 뒤 해당 작업 item 없음, 같은 security/year/report filing 없음, v2 CALENDAR_REPORT_YEAR 캐시와 periodError 없음, 활성 회사 backfill 미완료다. “과거 로직 오류로 확정”이 아니라 최신 검증을 시도할 근거가 상대적으로 있는 후보다. 통화와 재무 응답은 모두 미확인이다.

|종목|task|연도/종류|캐시 접수번호|캐시 기간|대표 순서|
|---|---|---|---|---|---|
|오리엔트바이오 002630|114461|2026 Q1|20260814002966|2026-06-30|첫 1건|
|대신정보통신 020180|116133|2026 Q1|20260814000310|2026-06-30|다음 1건|
|동원모빌리티 018500|116049|2026 Q1|20260814002059|2026-06-30|대표 통과 후|
|동원모빌리티 018500|116052|2026 ANNUAL|20260624000498|2026-03-31|내용/첨부 정정 검증 후|
|한국캐피탈 023760|116233|2026 Q1|20260519000148|2026-03-31|첨부 정정 검증 후|
|모아텍 033200|116681|2026 Q1|20260813000800|2026-06-30|대표 통과 후|

캐시는 관측 때 유효했으며 10/14 03:16~03:21 KST경 만료한다. 실행 시 재검증이 필요하다. 이번 단계에서 새 목록/재무 응답 요청을 하지 않았다.

Q1 307개는 백업·격리·원문 판정 후 재수집을 우선 검토할 목록이다. 제목 기간으로 직접 날짜를 덮어쓰지 않는다. 판타지오 032800 2023 ANNUAL filing 26453 / receipt 20230915000455(CFS), 양지사 030960 2023 ANNUAL filing 26375 / receipt 20231004000111(OFS)는 기존 v2 캐시도 같은 receipt의 2023-06-30을 가리켜 저장 2023-12-31과 다르므로 격리 경로 대표 검토에 적합하다. 통화·실제 회계기간·파생 계산은 아직 검증되지 않았다. 체시스 등 캐시 periodError가 있는 대상은 개발 판정 전 실행에서 제외한다.

D0 13개는 결산월 변경 4 / 같은 보고연도 복수 연간 4 / 내용 정정 불일치 2 / 정정 관계 불일치 3이다. 제목과 응답 기간·정정 원문을 개발 담당이 판정해야 한다. U의 225개(접수번호 코드 224 + 통신 1)는 현재 자동 재시도 선택이 가능하므로 별도 초기화하지 않고 기존 자동 수집을 유지한다. U 검토 대기 154개는 캐시/원문 근거가 부족해 보류한다. 따라서 235개나 165개 전체 초기화는 권하지 않는다.

GRT 35개 중 명시적 NON_KRW task 진단은 2개, 기존 2024 대표 보고 근거로 연결되는 대상은 3개, 개별 기간 통화 미확인은 30개다. 35개 모두의 통화를 확정한 것이 아니라 종목 단위 보수적 재수집 제외다. **기존 저장 후보 17개는 제외만으로 안전해지지 않는다**. 계산 노출과 통화 근거를 별도 판정하고 필요하면 재수집 없는 격리를 검토한다. 기존 실패 처리와 NON_KRW_STORAGE_UNSUPPORTED/‘외화 자료 미지원’ 분류를 유지하며 외화 저장·환산·PER/PBR 지원 개발은 범위 밖이다.

## 현재 경로의 안전성 차단과 최소 개발 대상

근거 코드는 모두 조사 SHA [258ee8d](https://github.com/byungho-cho/roxstock/tree/258ee8d06db93d171d6ed71504f5dc9198f4daae)에 고정한다.

1. [dart-repository.ts](https://github.com/byungho-cho/roxstock/blob/258ee8d06db93d171d6ed71504f5dc9198f4daae/backend/src/collector/dart-repository.ts#L180)에서 REVIEW_REQUIRED와 SUCCESS는 자동 task 선택 대상이 아니다. R1은 승인된 정확한 task를 PENDING으로 바꾸면 현재 회사 backfill 선택 조건에 들어간다. Q1은 SUCCESS 해제와 격리를 같은 승인 operation으로 관리해야 한다. 실제 선택 순서/이번 야간 내 완료는 보장할 수 없다.
2. [saveFiling](https://github.com/byungho-cho/roxstock/blob/258ee8d06db93d171d6ed71504f5dc9198f4daae/backend/src/collector/dart-repository.ts#L244)은 receipt unique와 저장 identity를 검사한다. 다른 period면 STORED_FILING_CONFLICT로 보존하며, 같은 identity는 과거 accountSources와 병합한다. isWithdrawn 변경만으로 unique receipt가 풀리지 않는다. 따라서 격리 후 일반 수집만 호출하면 안전한 교체가 되지 않는다.
3. [dart-manual-refresh.ts](https://github.com/byungho-cho/roxstock/blob/258ee8d06db93d171d6ed71504f5dc9198f4daae/backend/src/collector/dart-manual-refresh.ts#L111)의 normalizationVersion>=3 shortcut과 collector의 stored receipt shortcut은 후보를 건너뛸 수 있다. 31개 후보가 version3이다. **정상 skip은 통화·실제 기간·종목 namespace·연결/별도·정정 chain·sourceValidation까지 검증된 동일 자료에 한정**하고 어떠한 필드도 덮어쓰지 않아야 한다. 승인 recovery만 기존 shortcut에서 분기하며 일반 중복 차단은 유지한다.
4. [stored-analysis.ts](https://github.com/byungho-cho/roxstock/blob/258ee8d06db93d171d6ed71504f5dc9198f4daae/backend/src/domain/stored-analysis.ts), financial-statements/securities/value-analysis 조회와 보충 계산 모두에서 격리 filing 및 직접/검토 확정된 파생 참조를 제외하는 공통 eligibility가 필요하다. 현재 별도 quarantine model이 없어 isWithdrawn을 가짜 철회로 사용하지 않는다. PeriodValuation을 그대로 두면 filing만 제외해도 오래된 지표가 노출된다.
5. [valuation-supplement.ts](https://github.com/byungho-cho/roxstock/blob/258ee8d06db93d171d6ed71504f5dc9198f4daae/backend/src/collector/valuation-supplement.ts#L19)의 기존 SUCCESS 지표 shortcut도 승인된 영향 범위에 한해 재계산 경로가 필요하다. Q2/Q3 차액, 연간-Q3=Q4, 전년 비교, 다음 연도 ROE/기초자본, 연간 대체값과 주식수 참조를 확인한다. [period-valuation.ts](https://github.com/byungho-cho/roxstock/blob/258ee8d06db93d171d6ed71504f5dc9198f4daae/backend/src/domain/period-valuation.ts)의 달력 기간 가정 때문에 짧은 회계기간은 기간 수정만으로 안전한 계산을 보장하지 못한다.
6. 최소 범위는 append-only recovery ledger/백업 참조, 대상 allowlist·기대 상태 비교·1회 예산, 조회/계산 격리, 검증 후 receipt 보존 교체/승격, 관련 지표·캐시의 범위 제한 재생성이다. 작업 attempts를 0으로 초기화하지 않는다. 기존 [dart-policy.ts](https://github.com/byungho-cho/roxstock/blob/258ee8d06db93d171d6ed71504f5dc9198f4daae/backend/src/collector/dart-policy.ts)의 3회/5회 제한을 누적 이력과 분리된 승인 operation의 1회 budget으로 우회 없이 제어해야 한다. 실패 후 자동 무한 재선택 방지도 지속 저장해야 한다.

이 기능이 구현·검증되기 전에는 R1도 승인 후 1회 예산을 안전하게 보장하는 실행 경로가 없어 바로 초기화할 수 없다. 정상 종료 46개는 개발 대상에서 제외한다. D0 원문 판정과 Q1 영향 범위 판정은 데이터 검토이며 자동 날짜 보정 개발로 대체하지 않는다.

## 승인 후 실행할 프로필과 원복 계획

이 절은 실행하지 않은 계획이다. 대상별 기대 값과 식별자는 plan-actions.csv를 사용한다. 기존 전체 백업 경로는 source-provenance에 연결했으며 실행 직전 새 승인 백업이 필요하다.

**공통 사전 조건:** 개발 담당이 대상·기간·통화·정정·영향 행을 승인하고 exact allowlist를 고정한다. runtime SHA와 operation ID를 기록한다. 실행 직전 task 상태/attempts/lastAttempt, filing hash/receipt/namespace(codeRevision·collectionSymbol 포함), 파생 참조·계산 입력을 다시 대조한다. 자동 수집이 바꾼 대상이면 중단하고 재검토한다. 기존 잠금을 정상 획득하며 강제 해제하지 않는다. 완료 회사나 비활성/제외 회사의 backfillStarted/Completed를 임의 초기화하지 않는다.

**R1:** 해당 task 전체 오류·diagnostics·시도·nextAttempt·상태 및 item/run 이력을 변경 전 append-only ledger에 보존한다. 기존 items는 수정하지 않는다. 승인 operation의 지속 1회 예산을 설치한 뒤 정확한 6개 중 승인된 task만 PENDING, errorCode/errorMessage/diagnostics는 보존 후 active 오류 값만 비우고 REVIEW 대기를 해제한다. 누적 attempts는 유지하며 nextAttempt는 기존 지연보다 앞당기지 않고 기존 허용 창 이후로 설정한다. 최초/최신 과거 시도는 ledger에 남기며 새 시도는 별도 기록한다. 같은 작업 정상 filing이 새로 생겼으면 검증 후 skip한다. 외화·기간/정정 실패는 재설정 없이 REVIEW_REQUIRED, nextAttempt=null로 유지하고 operation budget 소진으로 중복 재선택을 막는다.

**Q1:** 해당 filing, 연결 accountSources 및 실제 참조하는 파생 행/주식수/관련 캐시의 백업과 hash를 보존한다. 먼저 별도 quarantine 상태를 만들고 모든 조회·계산·supplement 경로에서 해당 근거를 제외하며 범위 한정 캐시 revision/무효화를 완료한다. 정상 다른 기간 자료나 구조적 인접 행을 일괄 삭제하지 않는다. 영향 확정 지표만 격리/보류하고 합의되지 않은 참조는 승인 보류한다. 이 선행 격리와 같은 operation 하에서만 task를 R1처럼 PENDING으로 전환한다. 날짜·금액을 직접 수정하지 않고 검증 응답을 staging에 받는다. 통화 KRW, 실제 회계기간·정정 허용 관계·CFS/OFS·namespace 검증을 통과해야 승격한다. 동일 receipt의 과거 자료는 별도 archive로 보존하고 승인된 recovery transaction에서 active identity를 교체하는 경로를 사용한다. unique guard를 일반 수집에서 해제하지 않는다. 검증 실패 시 원래 suspect 자료는 격리 상태 유지, task REVIEW 대기, 자동 반복 금지다.

**격리 영향:** CSV direct keys는 receipt 기반 실제 참조이고 potential keys/neighbor filing은 검토 범위다. Q1/Q2/Q3/YTD 차액, Q4 연간 차액, YoY, 다음 연도 기초자본·ROE, 연간 fallback, valuation share references를 입력 lineage로 확정한다. 이전값을 다른 정상 값으로 무조건 대체하지 말고 근거 부족 출력은 계산 불가로 처리한다. portfolio/target-arrival/페이지의 공유 재무 조회와 캐시도 격리 반영이 필요하다. 계좌·거래 테이블은 변경 대상으로 포함하지 않으며 실행 권한/manifest도 재무·DART 대상 표로 제한한다. 계좌 데이터에 무영향이라고 모든 출력 지표의 변화까지 보장하는 것은 아니다; 재무 근거가 바뀌면 표시 지표는 달라질 수 있다.

**큐·호출 정책:** R1 6개는 관측 시 활성 미완료 company queue에 있어 PENDING이면 기존 선택 가능하다. Q1의 자동 선택 가능 여부는 각 CSV 필드로 확인하고 false인 대상은 별도 승인 recovery queue 기능이 필요하다. 전체 회사 큐/다른 task를 재설정하지 않는다. 기존 일반 backfill 야간 18시 창 및 기존 우선 lane 16시 정책·종료 창·호출 한도·요청 지연을 그대로 따른다. 계좌 우선 lane 판정은 조사하지 않았으므로 새 priority를 부여하지 않는다. quota/window pause와 nextAttempt를 앞당기지 않으며 기존 동시성/잠금을 유지한다.

**대표→확대:** (1) 구현 검증과 백업 복원 연습 후 R1 task114461 1건, 성공 시116133 1건을 각각 관측한다. 요청/반환 receipt·period·currency·실행 SHA, 작업/실제 저장 상태, 중복0, 정상 기존 자료 불변을 확인한다. (2) Q1 대표 판타지오 CFS/양지사 OFS를 별도 승인하고 1건씩 격리→staging→승격→파생·캐시 비교한다. 같은 receipt 충돌과 normalization shortcut이 해결되는지 확인한다. (3) 짧은 기간·내용/첨부 정정은 개발 판정 통과 후 별도 대표로 검증한다. (4) 통과한 동일 유형만 한 야간 최대 5개 승인 batch로 확대하고 batch마다 실패·쿼터·잠금·자동 수집 영향 관측 후 다음 batch를 승인한다. 307개 전체 확대 승인은 없다.

**백업·전후 비교·원복:** 실행 직전 secure 저장소의 전체 DB 백업+대상 row snapshot/hash, 참조 manifest, ledger를 생성한다. 공개 Git에는 원본 백업이나 계좌/금액을 올리지 않는다. transaction 완료 전/후 task와 receipt unique, 정상 비대상 hash, quarantine 조회0, 파생 입력/출력·캐시 revision을 비교한다. 문제가 생기면 해당 recovery operation만 중단하고 정상 잠금을 종료한다. operation ID와 기대 hash로 compare-and-swap 원복하여 중간 자동 수집의 새 정상 자료를 덮어쓰지 않는다. R1은 승인 전 상태/재시도 예약을 ledger로 복원하되 새 검증 실패 이력은 보존한다. Q1은 staging/새 승격 자료와 지표만 되돌리고 의심된 기존 자료는 격리 유지한다. 과거 의심 자료를 자동으로 다시 계산에 노출하는 원복은 금지하며 개발 판정·별도 승인이 필요하다. 전체 DB를 과거 시점으로 덮어쓰지 않는다.

## 팀장 보고용 남은 작업

- 종료: 기존 실패 46개 성공 전환. 재개발/복구 목록에서 제외.
- 최소 개발: 지속 recovery budget/이력·대상 큐, 격리의 조회·계산 일관성, receipt 충돌/shortcut 처리와 staging 승격, 범위 제한 파생·캐시 처리 및 원복.
- 별도 데이터 검토: R1 6개와 Q1 307개의 조건부 선정/안전성, GRT 저장 후보 17개의 통화·노출 판정.
- 개발 원문 판정: D0 13개와 cache periodError/짧은 기간/정정 chain.
- 미확인: U379(자동 유지225/검토 대기154), GRT 대상 통화 미확인30, 과거 runtime SHA와 정확 최초 시도, sourceValidation 없는 후보324. 외부 자료 수집이나 실제 복구는 승인된 후속 작업으로 남긴다.
