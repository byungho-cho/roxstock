# 20차 후속: 화면별 부분 로딩 검증

2026-10-11 (Asia/Seoul). 비교 기준 main `458e17de3d1b41df6336518c1bbf66fb0ffb9b2c` / #188·#189 반영 확인. 별도 브랜치 `codex/phase20-screen-partial-loading`. PR #137 및 다른 draft는 포함하지 않는다.

## 화면별 변경

| 화면 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 매매일지 | 계좌 대기 시 선택 날짜/거래 카드 대체, 날짜 접근성 이름에 0건 | 6주 달력·선택 날짜·거래현황 유지, 거래 칩/금액/건수/3열 행만 대기 표시 |
| 계좌 관리 | 100px 단일 스켈레톤, 추가 버튼도 숨김, 편집 코드 의존 | 안내·추가 즉시 표시, 버튼 목록 위 고정, 실제 2줄 카드/61px 기본 행 |
| 자산분석 | 270px 성과 박스가 고정 레이블까지 가림, 금액은 대기 의미 없이 — | 고정 레이블·구분선 유지, 금액/비율/구성만 대기, 차트 224px 유지·지역 오류 |
| 종목목록 | 계좌 대기 중 탭/검색/정렬 숨김, 총 0개, 큰 카드/33px 행 표시기 | 모든 컨트롤 즉시 표시, 조회 전 건수 미확정, 유형별 카드/28px 컬럼별 행 |
| 평가자산 | 전체 요약/성과 카드 대체 | 공통 요약 카드의 부분 표시기와 성과 레이블·구성 틀 유지 |
| 예수금 | 변경내역 60px 큰 박스 | 실제 4컬럼/24px 행 표시기, 정책/계산/편집 유지 |
| 코드 대기 | 제목/컨트롤 대신 일반 76/148px 박스 | 우선 3개 화면의 가벼운 구조·사용 가능한 컨트롤, 다른 경로 작은 지연 아이콘 |

추가 점검: 투자금은 기존 18차 고정 차트/컨트롤을 유지한다. 복리계획은 기존 기본/계산 분리와 캐시를 유지한다. 가치분석·투자손익의 기존 별도 상세/목록 로딩은 이번 우선 화면 변경에 포함하지 않았으며, 모든 화면의 코드 대기에서 범용 큰 회색 박스는 제거했다. 홈의 API 순서(주요 조회 종료→최근 매수), 5행, 요약/차트 높이 및 계산식을 유지한다.

## 검증 환경과 구분

- React API 모드 / Vite / Playwright Chromium 153, 커버 370×465·태블릿 725×396 CSS px, 서울 시간대. API는 격리된 모의 응답이며 실제 DB/운영 계좌 검증과 구분한다.
- 최초 계좌 대기·빠른 응답·유효 캐시 재진입·기간 변경·빈 결과·부분 실패/지역 재시도·계좌 전환을 검사한다. 코드 모듈을 보류한 동안 검색/탭/기간을 조작하고 다운로드 후 같은 조건인지 확인한다.
- 로딩/정상 달력과 자산분석 차트의 실제 bounding box가 일치한다. 커버 종목 기본 행 139px/태블릿 28px, 계좌 기본 행 61px가 일치한다. 목록 개수/긴 텍스트에 따른 높이는 실제 콘텐츠 기준이며 가상의 계좌/종목/금액은 넣지 않는다.
- TypeScript·프론트 production build·20차 단위 검사 통과. 최종 브라우저/필수 CI 결과는 아래 기록 및 PR의 Checks로 확인한다.
- 실기기 Android/WebView, 실제 운영 DB 쓰기, 지연 상태의 전 기기 네트워크 측정은 미검증이다. 추가 조회 엔드포인트/폴링은 도입하지 않았고 캐시 재진입 요청 수와 기존 홈 후속 호출 검사로 회귀를 확인한다.

명령: `npm run typecheck:frontend`, `npm run build:frontend`, `node --import tsx --test frontend/tests/unit/phase20.test.ts`, `npm exec --workspace frontend -- playwright test --config playwright.phase20.config.ts`. 로컬 Chromium 실행 경로만 환경변수로 지정하며 패키지/잠금파일은 변경하지 않는다.

## 전후 캡처

같은 모의 API/선택 계좌/느린 계좌 조회 조건으로 기준 main과 수정 브랜치를 각각 촬영했다. 계좌 이름과 금액은 테스트 응답이며 제품의 고정 예시 값이 아니다. loading은 조회 보류, ready는 동일 조회가 완료된 상태다.

| 화면 | 커버 전 → 후 (로딩) | 태블릿 전 → 후 (로딩) | 완료 후 |
| --- | --- | --- | --- |
| 매매일지 | [전](assets/phase20-screens/before/journal-cover-loading.png) · [후](assets/phase20-screens/after/journal-cover-loading.png) | [전](assets/phase20-screens/before/journal-tablet-loading.png) · [후](assets/phase20-screens/after/journal-tablet-loading.png) | [커버](assets/phase20-screens/after/journal-cover-ready.png) · [태블릿](assets/phase20-screens/after/journal-tablet-ready.png) |
| 계좌 관리 | [전](assets/phase20-screens/before/accounts-cover-loading.png) · [후](assets/phase20-screens/after/accounts-cover-loading.png) | [전](assets/phase20-screens/before/accounts-tablet-loading.png) · [후](assets/phase20-screens/after/accounts-tablet-loading.png) | [커버](assets/phase20-screens/after/accounts-cover-ready.png) · [태블릿](assets/phase20-screens/after/accounts-tablet-ready.png) |
| 자산분석 | [전](assets/phase20-screens/before/analysis-cover-loading.png) · [후](assets/phase20-screens/after/analysis-cover-loading.png) | [전](assets/phase20-screens/before/analysis-tablet-loading.png) · [후](assets/phase20-screens/after/analysis-tablet-loading.png) | [커버](assets/phase20-screens/after/analysis-cover-ready.png) · [태블릿](assets/phase20-screens/after/analysis-tablet-ready.png) |
| 종목목록 | [전](assets/phase20-screens/before/stocks-cover-loading.png) · [후](assets/phase20-screens/after/stocks-cover-loading.png) | [전](assets/phase20-screens/before/stocks-tablet-loading.png) · [후](assets/phase20-screens/after/stocks-tablet-loading.png) | [커버](assets/phase20-screens/after/stocks-cover-ready.png) · [태블릿](assets/phase20-screens/after/stocks-tablet-ready.png) |

기준 main의 ready 캡처도 before 디렉터리에 보존한다. CI `Phase20 Input and Loading` artifact에는 지연/실패 추적과 captures를 보관한다.

## 검사 기록

- 초기 탐색 검사에서 출력 디렉터리 공유 충돌을 분리했고, 코드 대기→실제 화면/첫 계좌 전환 시 검색·정렬 메뉴·선택값 유실을 수정했다. API 응답 이후 검사용 일시 정지 시계를 재개하도록 보정했다. 실패를 통과로 집계하지 않는다.
- 최종 로컬 화면별 검사 32개 통과(2.0분), 정렬/화면 교체 경계는 커버·태블릿·큰 화면에서 각 3회 반복해 9개 통과. 추가 코드 대기/계좌 대기/시계 검사 8개 통과. 전체 회귀는 최종 PR Checks에서 재확인한다.
- `ab78cc4`의 20차 CI 114개 통과 후 별도 4차 회귀에서 코드 전환의 기간 선택 유실을 추가 발견하여, 대기 틀/실제 페이지의 기간 메모리를 통일했다. 기간·뒤로가기·계좌 전환과 코드 대기 검사를 커버·태블릿·큰 화면에서 반복해 10개 통과했다. 수정 커밋의 최종 전체 CI 결과는 PR Checks를 확인한다.
- 전체 20차 CI에는 기존 홈·18차·16차·가치분석 회귀를 포함한 114개 검사를 사용한다. 최종 상태는 [PR #190 Checks](https://github.com/byungho-cho/roxstock/pull/190/checks)를 기준으로 하며, 모든 필수 검사 통과 전에는 병합하지 않는다.
- 구조 조기 표시를 위해 공통 Select/화면 틀을 초기 번들에 포함한다. 기준 main의 entry gzip 109.14kB → 수정 build 139.75kB (+30.61kB). 실제 기기 다운로드/paint 시간은 미측정이며 화면 본체·편집기는 lazy loading을 유지한다.

## 병합·운영

작업 PR 필수 검사 및 충돌 확인 후 기존 자동 병합·배포 절차를 사용한다. 운영 결과는 완료 상태와 배포 커밋 확인 후 별도 보고하며 미확인 상태를 완료로 표시하지 않는다.
