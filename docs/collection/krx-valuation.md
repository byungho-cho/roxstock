# 수집·오류 개선: DART / KRX / 연간 예상치

10차 UI PR과 분리된 백엔드 작업. 운영 환경변수 및 기존 데이터는 유지한다.

## 서버 키 등록과 삼성전자 검증 순서

- 개발: Git에서 제외된 `backend/.env`의 `KRX_API_KEY`. 파일 권한 600. 프런트용 `VITE_*`에 등록하지 않는다.
- 운영: 서버의 기존 `backend/.env.production`에 운영자가 `KRX_API_KEY` 한 항목만 비밀값으로 등록한다. 개발 `.env` 전체를 복사하지 않는다. 배포 시 기존 파일은 유지되며 backend/dart-collector가 같은 env_file을 사용한다.
- 이 PR은 운영 키를 자동 등록하거나 로컬 DB를 운영에 복사하지 않는다.
- KRX HTTP/HTTPS 허용 도메인: `data-dbg.krx.co.kr`. 공시 보충: `opendart.fss.or.kr`. 기존 공공데이터 경로: `apis.data.go.kr`.
- 승인 서비스: `stk_bydd_trd`, `ksq_bydd_trd`, `stk_isu_base_info`, `ksq_isu_base_info`. 인증은 요청 헤더 `AUTH_KEY`, 조회 인자는 `basDd=YYYYMMDD`.
- 사용자가 확인한 이용기간: 2026-10-08~2027-01-07. 실제 인증/서비스 권한 검증은 별개이며 만료 전에 갱신해야 한다.
- `KRX_VALIDATED_SYMBOLS=005930` 기본값. 삼성전자 실조회·주당 기준 검증 후 보유 → 관심 → 매매 이력 순서로 목록을 확대한다. DART 기존 전체 수집 범위는 유지한다.

서버/내부 개발 환경의 backend 디렉터리에서 실행:

```sh
npm run verify:krx:samsung
npm run supplement:valuations -- --apply --sources --symbol=005930
```

첫 명령은 DB 쓰기 없이 최근 거래일, 2025·2015년 말부터 검증하고 2015~2025년 저장 공시와 대조한다. 시스템 오류가 발생하면 나머지 연도 API 호출을 중단하고 `NOT_ATTEMPTED`로 구분한다. 실제 API 시도는 `LIVE`, 실패는 `LIVE_FAILED`; 공급자 인증 검증이 성공했다는 뜻으로 해석하면 안 된다. 두 번째 명령은 공유 DB 락 아래 이미 저장된 재무제표의 주식수/종가/지표만 보충하며 기존 공시를 재저장하지 않는다. 기본 EPS·지배주주 자본이 부족하면 동일 접수번호의 기초계정을 독립적으로 조회해 supplemental.accounts에 저장한다. `--sources` 없는 기본 명령은 계산만 수행하는 dry run이다.

## 데이터·계산 기준

- DART 공시 저장 성공과 가치지표 보충 성공을 분리한다. 보충 실패가 공시 SUCCESS를 취소하지 않는다. 실패·미공시로 기존 값이나 공시를 삭제하지 않는다.
- DART 호출 한도는 DART 요청에만 적용한다. KRX/FSC 종가 조회에 DART 예산을 차감하지 않는다.
- KRX 키가 있으면 KRX를 우선 사용하고 실패를 FSC/현재가로 숨기지 않는다. 키가 없으면 기존 FSC 경로를 유지한다.
- KRX는 시장·날짜·서비스별 최대 64개 응답 캐시와 진행 중 Promise를 공유한다. 실패 응답은 캐시하지 않는다. 명시적인 빈 시장 응답에만 직전 날짜를 탐색한다. 종목 불일치·인증·권한·통신·파싱 오류는 휴장일이 아니다.
- 연말/기간말 이전 7일의 실제 종가만 허용한다. 2015년 하한 유지. PER=종가/EPS, PBR=종가/BPS. 현재가 대체/임의 0 없음.
- EPS는 해당 공시 기본 EPS, BPS는 동일 공시 보통주 유통주식수와 CFS 지배주주 자본 또는 OFS 자본을 사용한다. 우선주가 있으면 배분 근거 없는 BPS는 계산하지 않는다.
- KRX 비수정 종가의 PER/PBR은 주당 기준 검증을 요구한다. 연말과 공시일 종목기본정보의 ISIN·보통주·액면가·상장주식수 일치 및 동일 공시 주식수 자료를 확인한다. 우선주 발행사는 EPS의 보통주 표시도 필요하다. 기준 변화/자료 부족은 미산출이며, 근거 없이 분할배수를 적용하지 않는다.
- 기존 보충에서 재무제표 전체를 다시 받아 정규화하던 동작을 제거했다. 오래된 정규화 자료에는 동일 접수번호의 EPS·지배주주 자본을 별도로 보충할 수 있다. 이 요청이 실패하면 공시 원본과 정상 지표를 유지하고 accounts 오류를 표시한다.
- `PeriodValuation`의 values/reasons/supplemental/provenance(perMetric 포함)에 공시번호, 연결/별도, 기간, 수집·계산 시각, 가격 출처/거래일, 주식수 공시번호, 주당 기준 확인 출처/사유를 저장한다. 기존 정상 값의 출처는 유지한다.

오류 category: `AUTH`, `PERMISSION`, `RATE_LIMIT`, `COMMUNICATION`, `NO_DATA`, `PARSE`, `PROVIDER`. `errors.priceCode/priceCategory/priceProviderCode`와 `errors.sharesCode/basis`는 독립적이다. 요청 URL·인증 헤더·공급자 원문은 로그에 기록하지 않는다. 공급자 코드는 알려진 숫자/서비스 코드만 로그에 허용한다.

## 올해 예상치 및 확정 전환

네이버 이용약관/공개 경로를 확인했으나 재사용 가능한 승인된 컨센서스 API와 응답은 확보하지 못했다. 이를 확보했다고 표시하거나 임의 스크래핑을 연결하지 않는다. 실제 2026년 예상 EPS/BPS/ROE는 모두 미확보다.

`CONSENSUS_ENABLED=false`가 기본값이다. 이용 조건과 실제 응답을 검증한 제공기관의 HTTPS 어댑터만 `CONSENSUS_PROVIDER_URL`, `CONSENSUS_TERMS_URL`, `CONSENSUS_TERMS_APPROVED=true`로 연결한다. 필요한 키는 서버의 `CONSENSUS_API_KEY`이며 요청/로그/PR에 노출하지 않는다. 네이버 원본 엔드포인트가 아니라 다음 정규화 계약을 제공하는 승인된 어댑터이다:

```json
{"symbol":"005930","fiscalYear":2026,"kind":"ANNUAL_ESTIMATE","asOf":"ISO timestamp","source":"licensed provider","sourceUrl":"https://source/evidence","division":"CFS","ownership":"OWNERS_OF_PARENT","shareClass":"ORDINARY","shareBasisDate":"YYYY-MM-DD","eps":"decimal or null","bps":"decimal or null","netIncome":"decimal or null","openingEquity":"decimal or null","closingEquity":"decimal or null"}
```

OFS는 ownership=TOTAL. TTM·확정 실적은 예상치로 받지 않는다. 주당 기준일과 최신 주가 기준일 일치를 확인한 경우에만 예상 PER/PBR을 계산한다. 예상 ROE는 동일 귀속 기준 예상 이익/평균 예상 자본이다. 주당 기준일이 다른 날의 최신 주가에 분할 여부를 추정하지 않는다.

`annual_consensus_snapshots`는 원본 예상 데이터와 출처/asOf를 보존하고 중복 asOf 저장을 막는다. 최근 1시간 내 스냅샷이면 재수집을 생략한다. 가격 변경은 조회 시 최신 저장 가격으로 반영하고, 이익/자본 변경은 새 스냅샷으로 ROE에 반영한다. 현재 연도는 Asia/Seoul 기준이다.

다음 해 수집 작업에서 연말 실제 KRX 종가를 먼저 `frozenClose`에 고정한다(확정 공시 없이도 가능). 확정 EPS/BPS와 고정 종가의 PER/PBR 계산이 성공하면 state=FINALIZED, 원본 예상 data는 보존하며 finalValues/provenance를 별도로 기록한다. 기존 데이터에 고정 종가가 있으면 다시 덮어쓰지 않는다. 예상치 실패가 DART 수집을 취소하지 않는다.

`GET /api/securities/:id/annual-estimates?year=2026`은 ESTIMATED/FINALIZED/UNAVAILABLE을 구분한다. FINALIZED는 isEstimated=false, 원본 예상치는 estimateArchive에 남는다. 경로 미설정은 CONSENSUS_NOT_CONFIGURED로 응답한다.

## UI 담당용 진행 상태 계약

기존 POST `/api/securities/:id/financial-refresh` 및 GET `/:requestId` 계약에 다음 필드를 추가한다. 기존 필드는 유지한다.

- requestId: 지속 저장된 작업 ID. state=QUEUED/PROCESSING/FINISHED. status는 RUNNING/SUCCESS/PARTIAL/FAILED/SKIPPED.
- progress: currentYear, currentPeriod, stage=DISCLOSURE/FINANCIALS/VALUATION/REPORT_DONE, completed, total. 실제 저장된 보고서 처리 상태이며 시간 추정치가 아니다.
- counts: processed, disclosureCompleted, valuationCompleted, noDisclosure, disclosureFailed, supplementFailed. 보고서별 1건 집계; supplementFailed는 공시 성공 중 지표 PARTIAL/FAILED/INSUFFICIENT/미확정 보고서 수다. 한 보고서의 여러 누락 지표를 여러 건으로 세지 않는다.
- results: fiscalYear/period/status/code/valuationStatus/valuationReasons, 추가 valuationErrors.priceCode/priceCategory/sharesCode/basis. 공시 status SUCCESS를 PER/PBR 완료로 표시하지 않는다.
- `GET /api/securities/:id/financial-refresh/active`: 진행 중 요청 ID/state/progress/counts 또는 data=null. 기존 종목별 중복 enqueue 방지와 작업 ID 복원을 유지한다.
- 일시적인 GET 실패는 서버 작업 종료를 뜻하지 않는다. 완료 state 확인 전까지 UI의 3초 조회를 유지한다.

## 마이그레이션·운영

추가 테이블 migration `20261008003000_annual_consensus_snapshots`만 적용한다. 기존 테이블/값을 삭제하지 않는다. 내부 DB는 덤프 백업 후 migrate deploy 적용·검증했다. 운영은 기존 `deploy-production-component.sh`의 서버 로컬 검증된 사전 백업 → migrate deploy → 상태 확인 절차를 사용한다. 키/네트워크가 미검증인 상태에서 수집 대상을 확대하지 않는다.

공식 참고: [KRX 일별매매정보](https://openapi.krx.co.kr/contents/OPP/USES/service/OPPUSES002_S2.cmd?BO_ID=JvJFzlAENzZlPBDNGAWC), [KRX 종목기본정보](https://openapi.krx.co.kr/contents/OPP/USES/service/OPPUSES002_S2.cmd?BO_ID=PiwgMdTwmsenXhmqqxuj), [네이버 이용약관](https://policy.naver.com/policy/service.html).
