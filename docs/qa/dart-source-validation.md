# DART source v2 검증·운영 관측 — 2026-10-12

> 최종 배포·11회 실제 DART·보존·미확인 사항은 [최종 결과](dart-source-validation-deployment-20261012.md)에 기록했습니다. 두 야간 창 관측은 미완료입니다.

## 완료 상태

- 로컬 TypeScript·backend build 및 backend 단위/회귀 201개, 안전한 로그 필터 2개: 통과.
- 원인 보고서의 공개 응답 식별 fixture: GRT 연간/Q1/Q2/Q3 기간, GRT 반기 API receipt, CJ 원/첨부정정 분리, 삼성 정상 대조 통과.
- 12/3/6/9월 결산, 결산월 변경, 근거 부족, 원/기재/첨부/추가/철회, 동일일 여러 공시, 혼합 receipt, 잘못된 기업/연도/보고서/기간, 외화 차단: 통과.
- 기존 수집 창/한도/지연/CFS→OFS 및 독립 PER/PBR 회귀: 기존 검사에 포함.
- 실제 MariaDB: Backend Check에서 격리 `roxstock_dart_recovery_test` migration 이후 실행. 저장 source/선택 번호, 실제 일자, KRW 원단위/YTD, duplicate receipt, 잘못된 저장 충돌 거절, SUCCESS·미완료·기존 금액·오류 이력 보존 검사. CI 결과는 PR에 기록한다. 두 DB 검사 파일은 순차 실행하여 fixture 간 간섭을 막는다.
- 운영 대표 DART·제한 재시도: 배포 후 전용 workflow 결과/사용량/대상·저장 결과를 기록한다. 배포 전 fixture 통과를 운영 재시도 완료로 표시하지 않는다.
- 최소 2회 정상 야간 창 장기 관측: 아직 미완료. 아래 기준을 마련했으며 배포 완료와 구분한다.

## 운영 대표 검사 결과 기록 기준

전용 `DART Receipt Representative Verification` workflow artifact의 JSONL에 SHA에 맞는 실제 runtime 실행, 사전 read-only audit, 일일 counter, maxCalls=12, 각 보고서 검증 사유/출처, 저장 여부, 변경 전후 상태·시도, 최종 호출 수/runId와 post audit가 기록된다. 원문 금액/인증정보는 기록하지 않는다. 한 버전의 결과 marker가 존재하면 추가 API 요청 없이 종료한다. 미완료 marker 재시도는 자동 초기화하지 않는다.

대표 후보는 GRT 2024 반기와 CJ대한통운 2024 연간뿐이다. 검증 불가·외화·기존 기간 충돌은 재무자료를 저장하지 않는다. 해당 대표 실패의 이전 오류는 실행 항목에 보존하고 신규 사유·시도만 기록한다. GRT 다른 분기와 삼성 대조군은 읽기만 수행한다. 기존 성공값을 변경하지 않는다. 전체 458건 해결/성공을 결론내리지 않는다.

## 2회 정상 야간 창 비교

Asia/Seoul 기준 기존 설정의 정상 창을 그대로 사용한다. 우선 10월 12일→13일, 13일→14일 창이 후보지만 배포 시각/휴일/한도 중단 여부로 실제 완료 창을 확정한다. 중간 배포·프로세스 교체·한도 조기 종료·잠금 실패가 있으면 정상 창으로 세지 않는다. 관측 간격 최소 48시간을 확보하고 실제 시작/끝과 runId를 기록한다.

각 창 시작 직전과 끝 직후 같은 `audit` 명령을 실행해 API 호출 0인 JSONL을 보관한다. 대표 검사 사용량은 별도 runId/calls로 제외/설명한다. 자동 재수집 범위를 늘리지 않는다.

| 비교 항목 | 기준/분모 |
| --- | --- |
| 신규 불일치 | 해당 창 신규 FAILED 실행 항목의 originalCode=RECEIPT_MISMATCH, task/runId·attempt로 중복 로그 제거 |
| 신규 검토 대기 | 해당 창 변경된 REVIEW_REQUIRED 작업, originalCode 및 validationResult 별; 기존 누적과 구분 |
| 성공·실패·NO_FILING/NO_DATA | 자동 BACKFILL/CURRENT run의 정산 카운터와 상태 전환, 수동/대표 run 제외 |
| 하위 원인 | CLOSING_MONTH_UNAVAILABLE/CHANGED, RECEIPT_NOT_IN_EXPECTED_PERIOD, CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION, MIXED_RECEIPTS, NON_KRW_STORAGE_UNSUPPORTED, STORED_FILING_CONFLICT 등; UNKNOWN 누락 수 기록 |
| 보존/중복 | receipt unique 중복 0, 기존 SUCCESS/PENDING 대상 ID 존속, 기존 금액/일자에 승인되지 않은 변경 0; 서로 다른 정정 receipt는 중복 자료로 제거하지 않음 |
| 사용량 | KST 일별 apiCallCount delta, noData/error delta, 대표 calls 별도; 공급자 API 오류와 도메인 검증 오류 구분, 외부 키 전체 사용량 미확인 명시 |
| 운영 상태 | 실제 runtime SHA, 각 창 시작/끝 이미지·container ID·health·restartCount; 컨테이너 교체와 restartCount 증분 구분 |

안전한 진단 필터는 DART task/phase2/manual source 이벤트의 허용 context만 남긴다. PROCESS_RESTARTED finishedAt을 실제 종료 시각으로 비교하지 않는다. 과거 종료 원인/네트워크 1건/458건 전체 하위 원인/기간 복구 대상의 원문 확인은 별도 미확인 사항이다.

완료 판정은 (1) CI/DB 저장 통과 (2) 병합·배포·대표 결과 확인 (3) 두 정상 창의 장기 운영 관측으로 각각 기록한다. 1·2 완료 시 3을 완료로 간주하지 않는다.

## 09:01 KST 실제 대표 결과와 후속 수정

첫 배포031c0bd / 검증 run4782는 실제 DART9회(목록3+재무6), 일일 앱 카운터5065→5074였다. CJ대한통운 2024 연간만 신규 저장/작업 SUCCESS 전환(31548→31549, FAILED459→458), 삼성 대조는 검증만 했으며 저장하지 않았다. GRT 연간/Q1/반기는 접수번호/기간이 맞아도 외화로 차단했고, 반기 실패는 원래 오류를 보존한 채 DART_SOURCE_REVIEW로 검토 대기에 남겼다. GRT Q3의 실제 응답은 2024.03/20240530000884였다. 최초2025.03 후보는 회귀이므로 후속 PR에서 각 보고서 월이 API 요청 연도에 머물도록 수정한다. 이 반례도 fixture에 추가했다.

기존 자료 제목과 저장 일자의 불일치 후보324건을 SELECT-only로 식별했다. 324건이 모두 잘못된 자료라는 결론/일괄 UPDATE는 하지 않았다. 원문·연결/별도·실제 기간 확인과 복구안의 별도 검토가 필요하다. 중복receipt0, PENDING89492·NO_FILING5807·NOT_APPLICABLE182는 변경되지 않았다. 외부 키 전체 사용량은 여전히 미확인이다.

추가 운영 모드 grt-q3는 최대2회(목록1+기존 확인 CFS1)만 호출한다. 어떤 financial/task/SUCCESS도 갱신하지 않으며 별도 검증 run과 사용량만 기록한다. 누적대표 DART는 최대11회이며 최초9회를 다시 실행하지 않는다. 최종 배포/이2회 결과/두 정상 야간 창의 관측 상태를 별도로 기록한다.
