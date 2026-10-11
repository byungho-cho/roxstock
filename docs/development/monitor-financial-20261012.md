# 2026-10-12 모니터링·재무제표 개선

기준 main f16cd801236d5247358ee45c4bc7341de90dab1e (#191). 열린 PR #170(Android), #128(KRX 키 운영등록)은 앱 범위가 겹치지 않는다. #137은 소통 문서이며 병합하지 않는다. 기존 부분 로딩(#191)을 유지한다. 별도 브랜치 codex/monitor-financial-estimates-20261012. DART 접수번호 불일치/재시작 분석·수집기 변경·대량 재수집·저장값 덮어쓰기·DB 마이그레이션 없음.

## 변경 계약

- 실행 이력 콘텐츠 기존 96px→240px, 대상별 상태 기존 120px→300px (각 2.5배). 두 뷰포트는 기존 같은 고정 높이였다. 글자/행 크기는 유지. 상세 본문/영역 내부 스크롤로 접근한다. 오류 상세 음수 마진 중첩을 제거해 실행시각과 분리했다.
- DART 저장 실행 항목의 `symbol:사업연도:보고서코드` 또는 수동 `securityId:사업연도:period`를 읽어 연간/1분기/반기/3분기/4분기로 표시한다. 항목을 중복 제거하지 않는다. 저장 메타가 없는 항목에 연도/보고서를 임의 추정하지 않는다.
- 종목목록과 재무제표는 StockSearchFrame(높이36px, 공통 색상/여백/라운드, 전체 focus-within)을 공유한다. 재무제표 자동포커스 없음, 명시 검색/Enter 실행 후 input.blur, 조합 중 Enter/229 차단. 시장/연도/검색어 기억 유지.
- 재무제표 제목/조건/열 이름, 상세 표 항목/기간/카드 틀 즉시 표시. 값만 200ms 지연 표시기로 처리. 미확정 총계는 —, 초기 실패는 조회 실패. 같은 쿼리 갱신 데이터 유지. 조건이 다른 응답의 혼입은 Query key/AbortSignal로 차단.

## 저장 데이터·불일치 원인

운영 조회로 삼성전자 005930의 2026 목록 차이를 재현했다. 재무제표 API는 period_valuations에서 ANNUAL만, 가치분석은 선택연도 전체 기간(ESTIMATE 포함)을 조회했다. 자본도 재무제표는 해당 연도만, 가치분석은 이전 연간 결산을 포함했다.

두 목록은 storedAnalysisInclude/selectStoredAnalysis를 공유한다. 기존 combinedValuation·fairPrice·weight 및 EPS/현재가 비율의 Decimal 계산을 그대로 사용한다. 선택연도 ESTIMATE는 2026E/연간 추정, 중간 보고서는 실제 보고 기간으로 표시한다. 저장 경로는 period_valuations.values/provenance와 supplemental.manualSource/estimateFinancials, valuation_metrics, financial_statements, dart_financial_filings다. 네이버 연간 원천 financials는 수집 파서에서 억원→원 변환된 저장값이다.

- 자본은 기존 가치분석과 같은 최신 연간 결산(선택연도 이하)의 저장값이며 실제 연도/결산/출처를 별도 제공한다. 선택연도 실적인 것처럼 표시하지 않는다.
- 당기순이익은 선택연도 연간 실제 저장값 또는 동일 연도·연간 추정·CFS/OFS·네이버/FnGuide 원천이 확인된 supplemental.estimateFinancials.netIncome만 사용한다. 과거 순이익/분기 누계/지배순익/계산 EPS×주식수로 대체하지 않는다.
- API metricBasis/capitalBasis/netIncomeBasis/missingReasons를 제공한다. KRW/추정/실적/연결·별도/기준연도·출처를 표시한다. 미수집/원천 미제공/추정 기준 미확인/가치 계산 기준 미확인/현재가 미수집은 서로 구분한다. 실제 0은 보존한다.
- 기존 가치분석의 연도 내 중간 지표와 과거 결산 선택 규칙을 변경하지 않는다. 재무제표 목록을 그 기준에 일치시킨다. 재무제표 연간·분기 상세 원본/누계 변환 정책은 유지한다.

## 검증·배포 기록

로컬 API/집계 회귀 18개 통과. TypeScript/빌드 및 CI 화면검사 결과/병합·운영 SHA는 작업 PR에 기록한다. 로컬 Chromium CDN ZIP 손상으로 설치 실패 후 반복 중단. GitHub Chromium에서 370×465/725×396 검사 및 기준 main/변경 후 높이를 DOM boundingBox로 각각 측정하도록 준비했다. heights.json 및 화면/실패 trace는 CI artifact에 보관한다.

실제 Android 키보드/WebView·실기기 검증은 이 환경에서 미확인. 브라우저 input focus/blur/합성 composition 검사는 실제 한글 키보드 검증과 구분한다. 운영 배포 코드의 SHA는 Actions 이미지/원격 배포 단계로 확인하고 공개 API 숫자 대조로 동작을 재확인한다. 수집 원인 분석은 웹서버 담당 범위로 남긴다.
