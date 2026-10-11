# 18차 로딩·성능 개선 명세 / 개발 / QA

기준 main: `4db9b65a5468bc34cb139449cb60dc45468fb442` (#181 반영). 작업 브랜치 `codex/phase18-loading-performance`. #181의 가치분석·종목요약 개선과 재무 스크롤 보존 수정은 유지한다. #137은 서버 진단 자료만 읽고 병합하지 않는다.

## 구현 계약

- 자산분석 차트 영역은 커버/태블릿 정상 높이 **224px** (그래프200+윗여백8+날짜16)로 고정한다. 로딩·빈 값·오류도 같은 영역. 차트 아래 성과 영역도 정상11행 높이270px를 유지하며 조회 대기/빈 값에 스냅샷 부족을 확정 표시하지 않는다. 조회키는 계좌+기간으로 분리하여 다른 조건 데이터는 표시하지 않는다. 동일 키 갱신은 기존 값과 ‘갱신 중’을 표시한다.
- 홈 추이 정상 높이 커버87/태블릿171px (그래프64/148+윗여백7+날짜16), 투자금 요약188px도 모든 상태에 적용한다. 확대 차트는 기존 flex 영역 유지.
- 홈 최초 요청: 계좌 → 대시보드·추이·목표가 병렬 → 세 조회의 성공/최종 실패 UI commit 이후 최근 매수. 고정 지연 없음. 최근 매수는 카드만 로딩하며 공통 로딩바 대상에서 제외. 동일 Query key 공유로 목표가 중복 호출 방지, 계좌별 키와 AbortSignal로 이전 요청 보호. 캐시: 대시보드/추이30초, 목표가/최근매수60초, 계좌는 기존 변경 후 무효화 정책.
- 홈 전용 `GET /accounts/:id/recent-buys?months=0`은 최초5건, 더보기는 기존 ‘최초5건 + 해당 월부터’ 합집합. 서버 account/date/index/order/take/select 사용. 기존 buy-lots 상세 API 유지. 총건수는 표시 범위 count, 전체건수 total, more는 범위 밖 유무. Decimal·실시간 시세 우선순위·잔여수량 손익 계산 동일. sold-out lot도 포함한다.
- 복리 `?view=basic`: 계획/목표/기존 연말 스냅샷/예상값 우선, 원장 기반 포트폴리오 계산 생략. 별도 compound-assets 조회로 현재 자산/진행률 보완. 저장 후 두 키 모두 무효화, 계좌별 키 분리. 설정 메뉴는 계좌 대기와 독립이며 공유 계좌 캐시의 불필요한 mount/focus 재조회 제거. 공통 헤더의 계좌 훅을 설정 모듈에서 분리해 설정 편집 코드의 초기 다운로드/실행을 줄인다. 로컬 production entry raw335794B, gzip 파일105033B(이전 운영364824B/113512B; 운영 재검증 예정).
- 투자손익 `GET /accounts/:id/investment-profit`: 연도별 indexed 거래·배당·연말 투자금 조회, 같은 날짜/종목/종류 이벤트 압축, 기존 Decimal 곱셈 후 8자리 정수 합산. 기존 전체 원장 API는 유지.

## 집계 / 무효화 / 배포

마이그레이션 `20261011010000_profit_year_aggregates`: account_profit_revisions와 investment_year_aggregates 실체 테이블. account/year PK, 계산 버전1, 기준일, source revision, DIRTY/VALID, payload 및 계산시각 관리. 일반 뷰가 아니다.

원장·배당·예수금·계좌/종목 스냅샷 INSERT/UPDATE/DELETE DB trigger가 revision을 변경하고 영향 연도 이후를 DIRTY 처리한다. 날짜/계좌 이동은 OLD/NEW 모두 처리. 매수 원가 보정은 연결 매도의 더 이른 연도도 포함하며, 매수 삭제는 해당 계좌의 저장 연도를 모두 보수적으로 무효화한다. 종목 이름 수정도 캐시 무효화. 배당의 cash 날짜와 received 날짜가 다르면 더 이른 연도부터 무효화한다. 올해는 저장 집계 없이 매번 최신 원본으로 계산하며 서버 cache5초, 모든 hit 전 revision 확인. 계좌별 singleflight, 메모리 cache 최대128개/8MiB.

미집계/버전불일치/DIRTY는 동일 계산 경로로 응답 후 과거 연도 결과 저장. 전체 계좌 batch 없음. 기존 자료는 첫 계좌 조회 때 연도별 생성하므로 큰 계좌의 첫 계산은 느릴 수 있다. 계산은 RepeatableRead snapshot, 저장은 짧은 ReadCommitted revision-row FOR UPDATE + CAS. 계산 중 변경된 결과는 저장하지 않고 재시도(최대3, 이후409). publish는 account 공유 잠금→revision→aggregate 순서로, account 잠금을 먼저 잡는 예수금 writer 및 FK 확인과 순서를 맞춘다. 운영 대량 사전계산 실행 금지. 재계산은 필요한 계좌의 정상 조회로 수행한다.

## 다른 API / 서버 진단

계좌는 작은 응답+공유 캐시, 대시보드는 summary+보유 목록이 실제 필요하며 금액 계산식 유지. 홈 추이는 기존 trend 전용 계약 사용. 목표가의 전용 조회/부분 오류와 자체 polling 유지. 느린 항목이 다른 카드까지 막지 않도록 통합 API는 추가하지 않았다. 계좌/포트폴리오/목표가의 DB select도 실제 계산에 필요한 lot·cash·price 필드로 축소했다. buy(account_id,bought_at) 기존 인덱스를 사용하며 검증 없는 새 인덱스/풀/서버 RAM 변경 없음.

서버 담당 [2026-10-11 09:48 KST 진단](https://github.com/byungho-cho/roxstock/blob/docs/collector-feedback-20261008-152215/docs/collector-feedback/20261011-094843-KST-home-server-performance-ram.md): 직접 내부 요청도 초 단위 지연, swap I/O와 I/O wait 동시 관측. RAM paging은 주요 후보지만 요청별 비용·GC·DB pool wait·lock attribution은 미확인. 메모리 누수/증설 효과/OOM으로 단정하지 않는다. OS/DB 설정과 collector 스케줄은 변경하지 않는다.

## 검증 기록

로컬 프론트/백엔드 TypeScript 및 production build 통과. backend 단위 회귀는 로그 기준. 실제 MariaDB migration+집계 무효화/CAS/동일 계산과 기존 원장 대비 최근매수 값·순서 대조는 Backend Check에 추가. 커버370×465·태블릿725×396 및 기존 큰 화면에서 phase18 slow-route 테스트와 홈 회귀 실행. CI 결과/배포/운영 수치는 확정 후 이 문서에 보완한다.

외부 API 전후 표본: `docs/qa/phase18-api-before.json`/after.json. 실행시각, base commit, HTTPS 포함 external환경, n3 각 round 병렬, median/min/max 및 decoded bytes 기록. 사용자 제공 오전 표본과 별도 표본이며 서버처리시간/화면성능과 혼합하지 않는다. 실제 화면 표시 시간은 별도 browser artifact. 모의 held-route UI 시간은 CI runner/fixture 측정이며 운영 개선 수치가 아니다.

배포 전/후 확인 항목: cold/warm 요청수와 주요/최근/전체 표시시간, 설정 기본/복리 기본/자산 계산 영역, 계좌 전환/페이지 이동/기간/오류/재시도, 집계 없는 과거 연도와 수정/삭제/이후 연도/CAS, 높이/버튼/하단위치. 운영 데이터 수정 테스트는 하지 않고 격리 DB에서 검증한다. 생산 API는 read-only 계산 대조만 한다.
