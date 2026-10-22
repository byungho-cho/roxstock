# 수동 매수 404 분석·수정 (2026-10-22 KST)

기준 main: 616d2b8445e099461d1e37ef1cd5d6cbb5bd573e (운영 애플리케이션 1.2.7). 별도 브랜치 fix/manual-buy-transaction-scope-20261022. 최종 패치 버전 1.2.9. 거래·잔고·계좌 자료의 삭제나 보정은 하지 않는다.

## 원인과 요청 구분
Android 종목목록 수동 매수의 기존 요청은 POST /api/buy-trades다. 입력에는 본인 accountId, 공유 securityId, 매수일·수량·단가와 선택적 requestId가 포함된다. 수동 요청은 임의 UUID, 알림 경유 요청은 보관함 원본 ID를 requestId로 사용한다. 둘 다 같은 서버 거래 계약이며 알림 이벤트 ID나 연결 매수 Lot을 요구하지 않는다. 연결 매수 Lot은 매도에만 사용한다. 프론트 진입 경로와 폼을 이번 수정에서 바꾸지 않는다.

기존 사용자 소유권 ORM 래퍼가 cashTransaction.create의 buyTradeId를 검증할 때 전역 unscoped DB 연결로 부모 매수 Lot을 조회했다. 부모 Lot은 현재 serializable 트랜잭션에서 막 생성되어 아직 commit 전이므로 별도 연결에서는 보이지 않는다. 따라서 실제로 생성된 Lot에도 404 NOT_FOUND / ‘항목을 찾을 수 없습니다’가 발생한다. 이는 최근 알림 자동 입력이 수동 요청에 새 필수 필드를 요구해서 발생한 문제가 아니다.

운영과 격리한 MariaDB에서 실제 로그인 세션·CSRF·인증 guard·소유권 wrapper와 같은 POST 경로로 2026-10-22, 5주, 단가 300,000원 요청을 재현했다. 수정 전 404 NOT_FOUND를 재현했고 오류 이후 매수 Lot·예수금 원장·요청 이력·계좌 잔액이 전부 실행 전 상태임을 확인했다. 이 테스트는 소유권 guard를 생략하는 기존 route fixture와 달리 실제 인증 경계를 사용한다.

## 변경
부모 소유권 검증을 현재 DB 클라이언트(target)로 실행한다. 일반 요청은 일반 연결, interactive transaction은 동일 transaction 연결을 사용한다. 기존 userId 소유권 where 조건과 권한 검증은 그대로 유지한다. 이를 통해 commit 전 본인 부모를 검증하면서 다른 사용자의 기존 부모 연결은 계속 404로 차단한다.

트랜잭션의 lock·serializable 격리·원장 연결·멱등 requestId·잔액 부족 검사·보유 평균단가 계산은 유지한다. 인증 DB 회귀 테스트를 필수 backend CI에 추가했다. 단순 네트워크 API mock으로 저장을 성공 처리하는 UI 테스트만으로 서버 소유권/트랜잭션 결함을 검증한 것으로 간주하지 않는다.

## 로컬 검증
- backend TypeScript 통과. backend 단위 테스트 148 통과 / 1 skip.
- 실제 인증 MariaDB 통합 테스트: 수정 전 404 재현, 수정 후 201 확인.
- 신규 첫 매수(5주 × 300,000원) → 추가 매수(5주 × 400,000원): 보유수량 10주·평균단가 350,000원·예수금 6,500,000원(초기 테스트 예수금 10,000,000원) 확인.
- 알림 ID 형식의 신규 종목 매수 및 동시 재전송: Lot·원장 1회만 생성.
- requestId가 없는 구형 수동 요청 성공. 알림 ID와 연결 매수 Lot은 요구하지 않음.
- 잔액 부족·다른 사용자 계좌·다른 사용자 Lot 직접 연결·다른 내용의 동일 requestId는 차단.
- Lot·잔액·원장을 모두 쓴 다음 강제 실패시켜 전체 롤백 확인.
- 로그 진단 필터 테스트 통과: 고정 경로별 HTTP 상태 건수만 출력하고 원본 요청 ID·헤더·본문·사용자/계좌 식별자는 출력하지 않음.

## 운영 대조와 배포
아직 이 보고서 작성 시점에는 수정 코드의 CI·병합·운영 배포 전이다. main 반영 직후 읽기 전용 Manual Buy Incident Audit가 교체 전 서버의 최근 요청 로그를 HTTP 상태 건수로 집계하고, 해당 날짜/종목/수량/단가에 맞는 Lot-원장 연결을 건수로만 확인한다. 원본 로그는 runner 임시 파일로만 사용하고 삭제하며 공개 artifact에는 집계만 남긴다. 운영 DB 조회는 count만 사용하고 계좌/사용자/거래 원문은 출력하지 않는다.

기존 서버 로그는 API 응답 본문과 오류 code를 보관하지 않으므로 실제 사건의 사용자·계좌·종목 ID와 응답 code를 원본 로그만으로 복원했다고 주장하지 않는다. 원본 요청의 개별 사용자 귀속은 미확인이다. 코드 경로·오류 문구·인증 DB 재현 결과와, 이후 운영 로그/연결 집계 결과를 구분하여 보고한다.

필수 검증 통과 후 기존 SHA 고정 배포로 backend를 교체하고 운영 버전 1.2.9 및 healthy를 확인한다. 새 migration과 Android 네이티브 변경은 없으므로 APK 재빌드는 필요하지 않다. 운영 계정으로 허위 거래를 생성하거나 사용자 거래를 자동 재시도하지 않는다. 운영 실제 수동 등록 성공은 사용자의 재시도로 별도 확인해야 한다. 복구는 이전 backend 이미지로 복귀하며 기존 DB·거래·원장 자료는 유지한다.


## 운영 진단 및 실제 적용 재확인
읽기 전용 운영 진단 run 39734676004가 성공했다. 교체 전 backend의 bounded 최근 로그에서 POST /api/buy-trades 404 응답 3건을 확인했다. 2026-10-22 KST·005380·5주·300,000원 조건의 matchingBuys / withoutLedger / linkedLedger / unlinkedLedgerCandidates는 모두 0이었다. 원본 응답 code와 개별 사용자 귀속은 기존 로그에 없으며, 404 NOT_FOUND code는 동일 코드 경로의 인증 DB 재현 결과로 확인했다. 운영 요청 식별자가 정상이라고 원본 로그에서 직접 검증했다고 주장하지 않는다.

PR #302의 최초 배포 run 39734213077은 workflow success였지만 실제 backend 적용 로그에 Superseded deployment skipped가 있었다. 진단 설정 PR #303의 main 선행 병합으로 SHA 검증에서 건너뛴 것이므로 1.2.8 운영 적용 완료로 간주하지 않는다. 최신 main 기반 1.2.9로 재배포하며, 이후에는 응답 code도 비밀값 없이 대조할 수 있도록 매수 POST 거절만 고정 event/HTTP 상태/API code로 로깅한다. 사용자·계좌·요청 본문은 로그에 추가하지 않는다. 최종 버전·이미지 healthy를 확인한 뒤 배포 완료로 보고한다.


## 최종 실제 배포 완료
- 코드/진단 PR #302·#303·#304 병합 완료. 실제 운영 적용 커밋: 340f7f817dc6bd1bbb4ef747a4ea63fa3e13e900.
- 최종 배포: https://github.com/byungho-cho/roxstock/actions/runs/39735720602 — completed / success.
- backend Deploy 로그에서 서버 비공개 백업 검증, No pending migrations to apply, Database schema is up to date, Healthy backend deployed 및 해당 SHA의 container healthy를 확인했다. 건너뛴 이전 배포와 구분했다.
- 외부 https://newrox.cafe24.com/api/version 응답은 {"data":{"version":"1.2.9"}}로 직접 확인했다.
- 최종 소스의 backend CI, 실제 인증 매수 회귀, 기존 소유권/세션 검증, 단위 테스트, 28차를 포함한 실행 대상 회귀 및 PR Gate가 통과했다. 배포용 backend test/build/image/실제 서버 적용도 통과했다.
- frontend/collector/Android에는 이번 backend 변경을 적용할 필요가 없어 해당 배포 단계는 skipped였다. APK 재설치나 재빌드가 필요하지 않다.
- 운영 원장 재수집·거래 자동 재등록·개인 자료 보정은 하지 않았다. 실제 사용자 계좌에 테스트 매수를 생성하지 않았으므로 Android 개인 계좌의 재시도 성공은 사용자 확인이 남아 있다. 오류 전 데이터 미변경은 인증 DB의 재현/강제 롤백과 운영 사건 조건의 저장 0건 집계로 검증했으며, 기존 로그에 없는 사용자별 원본 ID/응답 본문을 확인한 것으로 주장하지 않는다.
