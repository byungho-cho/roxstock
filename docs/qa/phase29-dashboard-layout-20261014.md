# 29차 홈 평가손익·대시보드 자산추이

기준 main: 28차 PR #216 병합 `50aeb7d64f62b800eee6d0c1e9f313bf1829462d`.
28차 필수 PR Gate 통과 및 [배포 시작](https://github.com/byungho-cho/roxstock/actions/runs/38494810427)을 확인하고 작업 브랜치를 생성했다.

- 홈의 공통 평가손익 카드: 상하 8px, 제목·각 행 20px, 간격 4px. 전일 대비는 20px 두 줄과 4px 간격. 전체 예상 높이 174→158px이며 화면 검사에서 측정한다. 숫자·색상·계산 함수와 통합 홈 API 유지.
- 대시보드에서 평가손익 카드 제거. 도넛 아래, 종목별 비중 위에 기존 `AssetTrendChart`를 재사용했다. 기존 1개월 조회 범위, `view=trend`, 금액 변환, 일 단위 날짜, 터치·툴팁·Esc/외부 클릭 닫기, `/assets` 상세보기 유지.
- 차트 위아래 `#25344D` 구분선. 동적 차트와 도넛·범례는 기존 API 기반 렌더링을 유지한다. Figma의 정적 예시 벡터로 대체하지 않는다.
- 갱신 시각은 종목별 비중 아래 일반 문서 흐름에 놓았다. 카드 높이는 내용에 맞춰 확장하며 656/698px 최소 높이로 로딩 중 레이아웃을 유지한다. 차트의 날짜 행을 포함하고 숨김/잘림은 적용하지 않는다.
- 홈 API에 차트 조회를 다시 추가하지 않았다. 대시보드는 기존 `useDashboard`와 캐시·배치 읽기를 사용하며 계좌별 조회 키 및 중단 신호를 유지한다. 주요 요약을 먼저 표시한 뒤 차트 조회를 시작해 느린 차트가 비중·요약을 막지 않도록 했다. 홈 목록의 로딩 예약 높이를 기존 4px 여백의 실제 행 높이에 맞추고, 태블릿 대시보드의 보유 목록 본문은 남은 높이를 사용해 마지막 행과 푸터가 겹치지 않게 했다.

## Figma 대조 기준

[커버 평가손익](https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3852-2), [태블릿 평가손익](https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3852-189), [커버 자산구성](https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=2830-71), [태블릿 자산추이](https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3866-242)의 디자인 컨텍스트와 렌더를 읽어 기존 React/MUI 컴포넌트에 적용했다. 정적 예시의 잘리는 차트 컨테이너를 복제하지 않고 기존 날짜 행·상세보기 링크를 포함하는 높이로 배치한다.

## 검증 및 화면 증거

`Phase29 Dashboard Layout` CI는 370×465, 725×396, 430×932, 1024×768에서 다음을 검사하고 PNG·trace·JSON 측정값을 `phase29-screen-evidence` artifact로 제공한다.

1. 홈 8/20/4px 및 158px 카드, 금액·색상·전일 대비 두 줄.
2. 도넛·차트·비중·갱신 시각 순서, 구분선, 단일 조회·조회 범위, 비중 토글·상세보기·캐시.
3. 실제 Chromium 터치 이벤트, 툴팁 표시·화면 경계·Esc·바깥 클릭 닫기, 계좌 전환.
4. 차트 로딩·빈 상태·오류·재시도 시 종목별 비중 유지 및 높이 안정성.
5. 동일 fixture의 28차 main 전후 전체 화면·카드 캡처.

PNG 파일: `home-before/after`, `performance-before/after`, `dashboard-before/after`, `composition-before/after`, `dashboard-chart-after`, `chart-tooltip-after`, `chart-empty-after`. 검증 결과와 artifact 링크는 PR 본문에 기록한다. 전체 화면은 원래 viewport에서 캡처하고, 개별 카드 PNG는 같은 너비에서 세로 viewport만 확장해 스크롤 컨테이너로 인한 캡처 잘림을 방지한다. 운영 계좌 자료가 아닌 통제한 API fixture를 사용한다.

실제 Fold·Android WebView·Safari·글꼴 확대는 미검증. 배포는 시작 확인만 수행하고 완료·운영 적용 확인은 하지 않는다.

## 최종 병합·배포 시작 기록 · 2026-10-14

최종 head `2086264f3e0b41f9a541dfdf765d87953d20f08e`: 이전 Phase20의 삭제 평가손익/차트 제목 검사를 최신 구성으로 갱신하고, 로딩 자산구성 높이1px 차이를 보완했다. PR 워크플로30개 종료·실패0(범위 밖 skipped 포함), PR Gate 통과. PR #217 병합 `e7265940fea33312703ca1789bc55b0420bd6ffd`, [Production Deploy 시작](https://github.com/byungho-cho/roxstock/actions/runs/38512193321). 배포 완료·운영 적용 확인은 생략했다.
