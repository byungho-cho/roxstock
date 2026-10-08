# 10차 재무지표 화면 개선

## 2026-10-08 병합·배포 상태 갱신

#127·#129·#130·#131은 병합됐으며 최종 앱 SHA `292089a`의 [Production Deploy](https://github.com/byungho-cho/roxstock/actions/runs/37710401503)가 10:07:33 KST 성공했다. 아래 개발 당시 실행 계획은 과거 기록이다. 실제 KRX 공급자 조회·운영 키 등록/런타임 전달·컨센서스 경로 및 실기기 검증은 완료로 변경하지 않는다. [현재 현황](../개발현황.md)과 [10차 현행 명세](../handoff/20261008-phase10-current.md)를 함께 사용한다.

## 변경 범위와 수집 담당 분리

기준 main: a9bcf2e. 진행 작업 조회 API는 PR #127 (병합 e382871)에서 별도 제공한다. 수집 담당 PR #129의 파일 목록과 응답 계약을 대조했으며, 본 PR은 frontend와 이 화면 검증 문서만 변경한다. 수집기·계산·스키마·운영 키·원본 데이터는 변경하지 않는다. #129가 반환하는 counts를 우선 표시하고, 이전 서버의 results 기반 집계와 호환된다.

- 재무지표 제목 14px, 갱신 아이콘/Small 버튼, 연간·분기 28px 버튼.
- 연간 조회의 URL 기준을 centerYear로 변경. 중앙은 2016~현재 연도−1이며 전후 연도와 데이터 열을 정렬한다. 2015/현재 연도는 표시하지만 이동을 막는다. 기존 endYear는 −1, annualStart/startYear는 +1로 변환한 후 범위를 보정한다. 연간 API 자체는 기존 종료연도/시작연도 계약을 그대로 사용한다. 분기 시작기간과 종목 이동·스와이프를 유지한다.
- 공통 갱신 팝업의 기존 Small 폼·스크롤·접힌 상세를 유지. 서버 진행 작업 조회로 세션 없이 재진입한 작업을 발견한다. 기존 상세 상태는 3초 간격으로 조회하며 일시 오류는 완료로 간주하지 않는다. 완료/최종 실패에서 조회를 종료하고 관련 조회 캐시를 갱신한다. 닫힌 팝업 밖의 갱신 버튼에도 서버의 진행 상태를 표시한다.
- 각 차트의 상세보기는 기존 자산추이와 같은 MUI fullScreen Dialog 및 브라우저 이력을 사용한다. 2015~현재 연도 연간/분기 전체 기간을 기존 가치분석 API의 10개 이하 기간 요청으로 나누어 읽는다. 2026년 기준 연간 2회(10+2), 분기 5회(10+10+10+10+8), 순차 요청이며 수집을 실행하지 않는다. 지표와 범례·단위·우측 ROE 축을 유지하고 화면 높이, 터치 드래그, 가이드선과 값 툴팁을 제공한다.
- 유효한 값이 없으면 `내용이 없습니다.`. 지표별 최초 유효 데이터 이전만 상세 차트에서 표시용 0으로 연결한다. API 객체는 변경하지 않으며 툴팁에는 `데이터 없음`을 표시한다. 중간 누락은 선을 끊고 실제 0은 0으로 표시한다. 지표별 최초 제공 연도를 노란색으로 안내한다.
- 예상치는 API 행의 isEstimated:true에 한해 E/노란색/Bold를 표시한다. 현재 연도만으로 예상치를 추정하지 않는다. 수집 담당의 별도 annual-estimates 엔드포인트는 이 PR에서 재무 확정 행에 자동 병합하지 않는다. 실제 컨센서스 공급/차트 행 연동은 수집 담당 계약 확정 후 검증 대상이다.

## 검증

2026-10-08, 로컬 Vite API 모드, Chromium 153의 터치 지원 설정. 커버 370×465와 펼침 725×396 CSS px. 운영 수집은 실행하지 않았으며 아래 화면 검사는 API fixture 기반이다.

- 프론트 TypeScript 검사와 production 빌드 통과.
- 변경 화면 및 8·9·10차 기능 회귀: 고유 66개 화면 검사. 중앙 경계·기존 URL·종목 이동·양방향 스와이프·분기 유지, 차트 전체기간·터치 값 조회·두 종류 뒤로가기와 스크롤 복원, 누락/실제 0, 예상치 스타일, 세션 제거 후 작업 발견, 중복 POST 방지, 일시 조회 오류, 완료·최종 실패·미공시, 서버 counts 및 구형 응답 호환을 확인한다.
- 전체 검증 첫 실행에서 예상치 비활성 버튼의 기본 MUI 색상 덮임을 발견하여 수정했다. 해당 검사와 갱신 상태 영향 검사는 수정 후 재실행했다. 초기 실행 환경의 빈 Chromium 파일 및 SVG 선의 0폭 가시성 판정 문제는 유효한 기능 결과로 포함하지 않았다.
- 기존 가치분석·재무제표·복리계획 회귀 34개 통과. 전체기간/갱신 화면 검사는 playwright.financial-ui.config.ts, 기존 회귀는 playwright.financial-regression.config.ts. CI 기존 phase10 설정에도 새 검사를 등록한다.
- 실제 휴대폰 및 운영 진행 중 수집 작업은 미검증. 개발 모드의 기존 MainLoadingBar 렌더링 중 갱신 경고와 빌드의 기존 번들 크기 경고는 남아 있다. 공통 로딩바 변경은 이번 범위에서 제외한다.

## API 및 운영 반영

GET `/api/securities/:id/financial-refresh/active` → 없으면 data:null, 있으면 requestId/state/progress/results. GET `/financial-refresh/:requestId` → FINISHED에서 최종 결과와 새 counts를 표시. 기존 POST의 서버 중복 잠금/409는 유지한다. API #127을 먼저 반영하고 UI는 기존 필수 검사→자동 병합→배포 절차로 진행한다. 실제 실행 중 수집을 취소·재시작하거나 운영 데이터를 변경하지 않는다.

## 화면 확인 자료 (API fixture)

| 화면 | 커버 | 펼침 |
|---|---|---|
| 연간 전체기간 | [커버](financial-ui/cover-full-annual.png) | [펼침](financial-ui/tablet-full-annual.png) |
| 분기 전체기간 | [커버](financial-ui/cover-full-quarter.png) | [펼침](financial-ui/tablet-full-quarter.png) |
| 분기 헤더 | [커버](financial-ui/cover-quarter-header.png) | [펼침](financial-ui/tablet-quarter-header.png) |
| 공통 팝업 | [커버](financial-ui/cover-phase10-popup.png) | [펼침](financial-ui/tablet-phase10-popup.png) |
| 가치지표 안내 | [커버](financial-ui/cover-phase10-tooltip.png) | [펼침](financial-ui/tablet-phase10-tooltip.png) |
| 서버 작업 발견 | [커버](financial-ui/cover-discovered-job.png) | [펼침](financial-ui/tablet-discovered-job.png) |

## 11차 후속 변경

버튼 공통화, 중앙 연도의 텍스트 선택 목록, 제목/연도 sticky 및 연도 변경 스크롤 유지 규칙은 [11차 검증 문서](financial-ui11.md)를 우선한다. 수집/계산 및 전체기간 조회 계약은 그대로 유지한다.
