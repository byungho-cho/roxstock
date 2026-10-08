# 진행 중 재무 갱신 조회

GET `/api/securities/:id/financial-refresh/active`

기존 CollectorRun의 `dart-financial-statements` / RUNNING / MANUAL / securityId 조건으로 최근 진행 작업을 읽는다. 작업이 없으면 `{data:null}`. 작업이 있으면 requestId, state, status, startYear, endYear, fiscalYear, period, progress, results, startedAt, finishedAt을 기존 상세 상태 API와 같은 형식으로 반환한다.

화면 재진입 시 이 API로 진행 작업을 발견하고, 기존 `/financial-refresh/:requestId`를 3초 간격으로 조회한다. FINISHED 확인 후 조회를 종료하고 관련 화면 쿼리를 무효화한다. 일시적인 조회 실패는 완료로 취급하지 않는다. 서버가 중단되어 RUNNING 작업이 남아 있으면 작업 상태 그대로 표시하며, 화면이 시간 경과만으로 실패를 만들지 않는다.

기존 POST의 enqueue lock과 DART_REFRESH_IN_PROGRESS(409)를 유지한다. 이 변경은 수집기, 계산, 저장 규칙, 인증키, DB 스키마를 변경하지 않으며 새 작업을 생성하지 않는다. 프론트 연동 PR보다 먼저 배포해야 한다.

검증: 백엔드 TypeScript·빌드, 전체 117개 테스트 통과. 새 API는 DB 메서드를 대체한 응답 테스트로 종목별 분리·진행 상태·작업 없음·종료 작업 제외를 확인했다. 기존 POST 중복 방지 테스트도 통과했다. 운영 DB·실제 수집 작업은 이 로컬 검증에서 실행하지 않았다.

수집 오류 개선 PR에서 counts(공시 완료·지표 완료·미공시·보충 실패)를 추가한다. 의미는 [수집 상태 계약](../collection/krx-valuation.md)을 따른다. 기존 필드는 유지한다.
