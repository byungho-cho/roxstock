# DART 수집 실패 원인 분석

- 작성: 2026-10-09 07:50 KST (운영 DB 주요 집계 기준: 2026-10-09 07:15:45 KST)
- 범위: 운영 DB SELECT/Prisma 조회, 컨테이너 로그·이미지 메타데이터, 배포 커밋 코드, 격리 합성 DB 재현.
- 운영 데이터 수정·삭제, 수집/재수집, 배포, 자동 수집 정책 변경은 실행하지 않았다. 실제 코드 수정도 하지 않았다.
- 기록 브랜치: `docs/collector-feedback-20261008-152215`. [PR #137](https://github.com/byungho-cho/roxstock/pull/137)은 초안으로 유지하며 main에 병합하지 않는다.

## 결론 및 확실성

현재 반복 실패를 설명하는 직접 코드 결함은 **기업코드 미매핑 상태를 DB에 기록할 때 오류 코드 길이가 컬럼 한도를 초과하는 것**이다. 운영 `dart_backfill_tasks.error_code`는 VARCHAR(20), SQL 모드는 STRICT_TRANS_TABLES이다. 기업코드 갱신 직후 경로는 `NOT_DART_LISTED_EQUITY`(21자), 이후 회사별 미매핑 경로는 `DART_CORP_CODE_NOT_MAPPED`(24자)를 제한 없이 저장한다.

배포 이미지와 같은 MariaDB 11.8.9/Prisma를 사용한 격리 재현에서 두 값 모두 **PrismaClientKnownRequestError, P2000, column_name=error_code**를 발생시켰다. 현재 운영 매핑 0건, 미완료 작업 존재, 회사 확인 직후 작업 항목 없이 실패하는 DB 기록과 일치한다.

다만 운영 로그는 예외 종류·메시지·스택을 버리고 UNKNOWN만 기록한다. 따라서 P2000은 **동일 배포 코드·스키마의 격리 재현에서 직접 확인한 예외**이며, 당시 운영 예외 원문을 복구한 것은 아니다. 같은 문구로 남은 모든 과거 실행에 동일 원인을 일괄 적용할 수 없다.

기업코드 매핑이 0건이 된 선행 원인은 현재 기록만으로 확정할 수 없다. 빈/오류 XML을 성공으로 처리하고 기존 매핑을 빈 목록으로 교체할 수 있는 방어 누락은 확인했다. 인증키 문제나 호출 한도 초과는 당시 원문 응답이 없어 확정하지 않는다.

## 1. 배포 및 발생 실행

실행 중인 `roxstock-dart-collector`:
- 이미지: `newrox/roxstock-backend:sha-b7b74700cc05346185f5b335e04dd36448d48e3b`
- 이미지 revision: `b7b74700cc05346185f5b335e04dd36448d48e3b`
- 컨테이너 시작: 2026-10-08 21:43:18.496 KST.
- 커밋 시각: 2026-10-08 21:37:33 KST, Merge pull request #144.
- [분석 기준 배포 코드](https://github.com/byungho-cho/roxstock/tree/b7b74700cc05346185f5b335e04dd36448d48e3b)

서버 기본 체크아웃 HEAD는 d2b64cd, 배포 작업 트리 HEAD는 3d2a324로 실제 이미지와 달랐다. 분석은 git show로 실제 이미지 revision의 코드를 읽고 컨테이너 내 해당 모듈로 검증했다. 체크아웃 HEAD를 운영 버전으로 간주하지 않았다.

| 실행 ID | 시작(KST) | 종료(KST) | 방식/상태 | DB 성공/실패/건너뜀 | 실행 항목 |
| --- | --- | --- | --- | --- | --- |
| 548 | 10-09 00:00:25.450 | 00:00:27.405 | 자동 BACKFILL / FAILED | 0 / 1 / 0 | 0 |
| 549 | 10-09 00:01:25.386 | 00:01:25.837 | 자동 BACKFILL / FAILED | 0 / 1 / 0 | 0 |
| 550 | 10-09 00:02:25.462 | 00:02:25.958 | 자동 BACKFILL / FAILED | 0 / 1 / 0 | 0 |
| 982 | 10-09 07:13:44.460 | 07:13:46.076 | 자동 BACKFILL / FAILED | 0 / 1 / 0 | 0 |
| 983 | 10-09 07:14:44.731 | 07:14:46.437 | 자동 BACKFILL / FAILED | 0 / 1 / 0 | 0 |
| 984 | 10-09 07:15:44.297 | 07:15:45.352 | 자동 BACKFILL / FAILED | 0 / 1 / 0 | 0 |

jobType=dart-financial-statements、provider=OPEN_DART、metadata.phase=BACKFILL。자동 worker는 60초마다 실행하며 수동 경로의 MANUAL_PROTOTYPE 메타데이터와 구별된다. 위 반복 실패는 공시별 작업 실행 전 실패하여 처리 항목 0건이다. failureCount=1은 최상위 catch가 강제로 기록한 **주기 실패 표시**이며 실패 종목/분기 1건을 뜻하지 않는다. processedCount 컬럼은 없다.

집계 시점까지 가려진 문구의 실패 실행은 총 438건이다. 최소 실행은 #520(2026-10-06 21:19:15.046 시작, 10-07 06:00:01.071 종료)이다. #520에는 실행 항목 10,217건이 있어 현재의 처리 전 실패와 다르다. 최상위 catch가 successCount=0/failureCount=1로 덮어쓰므로 이 값으로 당시 처리 실적을 판단하면 안 된다. #520의 배포 커밋 및 실제 예외는 미확인이다.

참고로 배포 후 수동 #546은 10-08 22:07:36.069~22:11:05.140, PARTIAL, 성공23/실패0/건너뜀1, 실행 항목24건이었다. 대상 securityId=244, 2021~2026/ALL이며 이 가려진 오류와 별개이다. 이번 분석에서 이를 재실행하지 않았다.

## 2. 실패 단계와 근거

### 현재 반복 실패 흐름

1. 기업코드 동기화 시각은 2026-10-09 00:00:25.368 KST, 현재 `dart_corp_mappings`는 0건.
2. 갱신 직후 `markUnmappedTasksNotApplicable`은 미매핑 종목의 PENDING/FAILED 작업에 21자 오류 코드를 저장한다.
3. 다음 주기부터 `markCompanyChecked` 뒤 미매핑 분기에서 `markAllSecurityTasksNotApplicable`이 24자 코드를 저장한다. 이 호출은 작업별 try/catch 바깥이다.
4. 기업별 확인 기록의 최신 행은 securityId=424, 종목 012330(현대모비스), BACKFILL, 10-09 00:01:25.822 KST. #549 종료는 00:01:25.837이며 공시 작업 항목은 0건이다. 해당 종목에는 2018 ANNUAL FAILED 작업이 남아 있어 업데이트 대상이 존재한다.
5. 최상위 catch에서 DB 예외를 일반 문구로 가리고 로그 code=UNKNOWN으로 남긴다. 실패 실행/상태 저장은 성공했다. 실패 후에도 같은 미매핑 분기를 다시 만나 약 1분마다 반복된다.

단계 분류는 **기업코드 갱신의 빈 결과 수용 → 미매핑 작업 상태 DB 저장 실패**이다. 현재 반복 주기의 공시·재무자료 요청, 재무 정규화, 재무자료 저장까지 도달했다는 근거는 없다. 단순히 DB 전체 연결이 끊긴 문제도 아니다. 실제 조회와 실패 실행·상태 저장은 정상 동작한다.

| 코드 근거(배포 revision 기준) | 내용 |
| --- | --- |
| backend/src/collector/dart-provider.ts:294 | fetchCorporations는 XML 오류 status를 판별하지 않고 파서 결과를 반환 |
| dart-provider.ts:93,129 | 원문 XML도 수용; list가 없는 XML은 [] |
| backend/src/collector/dart-repository.ts:64~89 | syncCorporations는 빈 결과 검증 없이 매핑 전체 삭제 후 교체, syncedAt 갱신 |
| dart-repository.ts의 markUnmappedTasksNotApplicable | NOT_DART_LISTED_EQUITY(21자) 저장 |
| dart-repository.ts의 markAllSecurityTasksNotApplicable | 전달 code 길이 검증/제한 없이 저장 |
| backend/src/collector/dart-collector.ts:77,101~104 | 갱신 직후 일괄 처리와 회사별 미매핑 처리가 작업별 예외 처리 바깥 |
| dart-collector.ts:225~231 | 일반 예외의 종류/코드/스택 폐기, 고정 실패 건수 및 UNKNOWN 기록 |
| database/prisma/schema.prisma의 DartBackfillTask.errorCode | @db.VarChar(20); 운영 information_schema에서도 20 확인 |

[수집기](https://github.com/byungho-cho/roxstock/blob/b7b74700cc05346185f5b335e04dd36448d48e3b/backend/src/collector/dart-collector.ts#L225), [저장소 함수](https://github.com/byungho-cho/roxstock/blob/b7b74700cc05346185f5b335e04dd36448d48e3b/backend/src/collector/dart-repository.ts), [기업코드 파서](https://github.com/byungho-cho/roxstock/blob/b7b74700cc05346185f5b335e04dd36448d48e3b/backend/src/collector/dart-provider.ts#L294)

안전한 운영 로그 발췌(UTC 원본을 KST로 변환):
```text
2026-10-09 00:00:27.414 KST DART collector cycle failed code=UNKNOWN
2026-10-09 00:00:27.417 KST DART collector cycle finished status=FAILED errorCode=COLLECTOR_ERROR
2026-10-09 00:01:25.840 KST DART collector cycle failed code=UNKNOWN
2026-10-09 00:02:25.974 KST DART collector cycle failed code=UNKNOWN
```

격리 재현 스택(운영 스택이 아님):
```text
PrismaClientKnownRequestError
code=P2000
meta.modelName=DartBackfillTask
meta.column_name=error_code
at ei.handleRequestError (.../generated/prisma/runtime/library.js:125:7268)
at ei.request (.../generated/prisma/runtime/library.js:125:6300)
at async PrismaDartRepository.markAllSecurityTasksNotApplicable
  (.../backend/dist/collector/dart-repository.js:343:17)
```

### 빈 매핑의 선행 원인과 한계

합성 정상 XML은 파싱 1건, 합성 status=020 오류 XML은 예외 없이 0건을 반환했다. 이는 오류 XML을 정상 빈 목록으로 오인할 수 있다는 검증이다. **운영 응답이 020이었다는 증거는 아니다.**

일 사용량:
- 10-08 KST: API 10,000 / 회사 확인374 / NO_DATA838 / 오류9.
- 10-09 KST: API 1 / 회사 확인1 / NO_DATA0 / 오류0 (집계 시점).

전날 한도 도달은 별도 사실이다. 새날 반복 실패는 API 1건 상태에서 계속 발생했고 기업코드 XML 경로는 오류 상태 집계 자체를 우회한다. 이를 근거로 인증키나 DART 한도 문제가 최초 원인이었다고 단정할 수 없다. 원본 응답·파싱/매칭 건수 로그가 없어 빈 XML, 오류 XML, 필터링 결과 0건 등을 구분할 수 없다.

## 3. 영향 범위 및 보존

- 수집 계획: 2015~2026, Q1/Q2/Q3/ANNUAL. 특정 연도·분기의 자료 문제라기보다 공통 미매핑 처리 경로에서 주기가 중단된다.
- 현재 작업 집계: PENDING92,515 / SUCCESS26,640 / NO_FILING4,753 / FAILED460 / PROCESSING0. 현재 계획 총124,368건.
- 기업코드 매핑 0건으로 자동 수집의 진행이 막혀 있으며, 수동 수집도 미매핑 검증에서 영향을 받을 수 있다. 전체 종목별 재현은 실행하지 않았다.
- `dart_financial_filings` 26,640건 존재. 마지막 collectedAt=10-08 22:11:04.991 KST. 확인한 실패 경로는 재무자료 삭제를 호출하지 않는다.
- **재무자료는 현재 존재하지만 기업코드 매핑은 보존되지 않은 상태**다. 매핑 전체 교체 함수에는 빈 결과 시 삭제가 가능한 결함이 있다. 이 삭제는 기존 운영 코드가 실행할 수 있는 동작이며 이번 분석이 수행한 변경이 아니다.
- 재현 DB의 합성 작업은 P2000 이후 PENDING/attempts0/errorCode=null로 유지됐다. 운영 기존 재무자료의 전후 바이트 단위 동일성은 비교하지 않아 완전한 무변경 보증은 하지 않는다.
- #520처럼 일부 저장 후 최상위에서 실패한 주기는 성공 실적이 덮어써질 수 있다. 실패 표시가 곧 전체 롤백/자료 손실을 뜻하지 않는다.

## 4. 재현과 재시도

실제 배포 이미지와 동일한 MariaDB 버전의 임시 컨테이너를 네트워크 none, 운영 볼륨 공유 없이 생성했다. 별도 임시 앱 컨테이너는 그 임시 DB의 네트워크만 공유했다. 합성 작업1건과 VARCHAR(20) 스키마에 배포된 markAllSecurityTasksNotApplicable 함수를 호출하여 P2000을 확인했다. 21자 코드도 동일했다. 검증 후 임시 DB 컨테이너를 종료했다. 운영 DB에 UPDATE/DELETE/INSERT 또는 수집 함수는 실행하지 않았다.

재현 조건:
- 기업코드 없음.
- PENDING 또는 FAILED 작업이 적어도 1건 존재.
- 20자 컬럼에 길이 제한 없는 21/24자 오류 코드를 저장.
- strict SQL 모드.

현재 상태에서 단순 자동 재시도는 같은 오류를 반복한다. 인증키 교체나 일일 한도 초기화만으로 컬럼 길이 결함은 해결되지 않는다. 작업/기존 재무자료를 삭제하거나 전체 재수집할 필요가 있다는 근거는 없다. 원인 수정과 정상 매핑 검증 후 제한된 재개 검증은 가능하지만 이번에는 실행하지 않았다.

## 5. 수정 제안과 최소 진단 보완

실제 변경은 별도 작업 브랜치·PR로 분리한다. 이 문서는 수정 승인/배포 요청이 아니다.

1. **오류 코드 저장 계약**: 미매핑 코드의 명시적 20자 이내 매핑을 사용하거나 코드 체계를 검토해 컬럼을 확장한다. 임의 truncation만 적용하면 코드 의미/분류 충돌이 생길 수 있다. 21/24자 외 모든 code 저장 경로를 점검하고 코드 최대 길이 계약 테스트를 추가한다.
2. **기업코드 응답 검증**: ZIP/XML 파싱 전후 오류 status와 목록 유효성 검증. 빈 parsed/mapped 결과는 기존 매핑을 보존하고 안전한 DartApiError를 발생시킨다. 기존 매핑 대비 급감 검증도 검토한다. 정상 검증을 통과한 결과만 원자적 교체한다.
3. **최소 관측 필드**: runId, 배포 revision, phase, stage, 작업이 있으면 symbol/year/report, exceptionClass, 안전한 code, 허용된 DB meta(model/column), 프로젝트 파일/함수/행 번호만 남긴 스택 프레임. 단계는 CORP_FETCH/CORP_PARSE/CORP_SYNC/PLAN/TASK_QUERY/MARK_UNMAPPED/LIST/FETCH/NORMALIZE/SAVE/RUN_FINISH/STATE_UPDATE 등으로 식별한다.
4. **민감정보 처리**: raw Error.message/stack, Prisma 쿼리·파라미터·data, URL, 헤더, 환경변수 원문을 그대로 로그에 넣지 않는다. DartApiError는 허용 코드·통제된 메시지, Prisma는 Pxxxx와 허용 meta, 나머지는 클래스와 안전한 원인 분류만 기본 기록한다. 메시지가 꼭 필요하면 별도 제한적 scrubber와 합성 비밀정보 테스트를 통과한 요약만 사용한다.
5. **예외 경계**: 작업별 backfill catch는 dartFailure(stage)를 사용하지만 미매핑 상태 저장·계획/조회는 바깥 catch로 가며, phase2 catch도 일반 오류를 COLLECTOR_ERROR로 축약한다. worker tick catch 역시 WORKER_TICK_FAILED만 남긴다. 예상 API 오류, DB 오류, 파싱/정규화, 내부 오류를 동일 문구로 뭉개지 않게 분류한다.
6. **원래 오류 보존**: 최상위에서는 안전한 최초 오류 정보를 먼저 기록하고 finishRun/updateStateError/releaseLock의 2차 실패를 구분한다. 완료된 작업 실적을 0/1로 덮어쓰지 않도록 누적 실적을 보존하거나 기록 항목 기반으로 산정한다.
7. **운영 설정**: 현재 증거로 키/한도/자동 정책을 변경할 이유는 확정되지 않았다. sql_mode 완화는 긴 코드가 잘려 분류가 깨질 수 있어 해결책으로 제안하지 않는다.

검증:
- 격리 DB에서 두 미매핑 경로가 P2000 없이 완료되고 기존 SUCCESS/NO_FILING 및 재무자료를 보존하는지 확인.
- 합성 정상 ZIP/XML, 오류 XML(010/011/020), 빈 XML, malformed ZIP, 정상 목록이지만 매칭0건 케이스에서 실패 구분과 매핑 보존 확인.
- DB P2000/P202x, 파싱 예외, 네트워크 오류, 상태 갱신 실패 각각에서 단계·예외 분류가 남는지 확인.
- 합성 키·인증 헤더·URL·환경변수·중첩 cause를 포함한 예외를 주입해 로그/DB/응답 어디에도 원문이 남지 않는지 확인.
- 통합 검증 후 별도 승인된 운영 범위에서 작은 대상만 재개 확인. 전체 재수집/자동 정책 변경은 별도 지시가 필요하다.

## 6. 확인하지 못한 사항

- 사용자 화면에서 본 정확한 실행 ID/발생 시각: 입력에 없으므로 현재 운영 반복과 과거 동일 문구 집계를 함께 분석했다.
- 당시 원본 기업코드 응답과 매핑 0건의 최초 외부 원인.
- 운영 P2000 원문 및 최초 실패 스택: UNKNOWN 로그로 소실. 재현 스택과 구분해야 한다.
- #520 및 다른 과거 동일 문구 실행의 개별 원인/당시 배포 버전.
- 모든 종목의 영향, 기존 자료 전후 전체 무결성 비교.
- 수정 후 운영 회복: 코드 수정·배포·수집 재개를 실행하지 않았다.

인증키·전체 요청 URL·인증 헤더·비밀 환경변수 원문은 이 문서에 포함하지 않았다.
