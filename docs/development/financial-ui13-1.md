# 13.1차 개발 기준 · 2026.10.08

기획: [상세 상단·검색](../planning/financial-ui13-1.md). 기준 main: 3d9c1cb10a3feb6f80671338a8df90179ff6883d. 브랜치: codex/financial-ui13-1-20261008.

- ValueAnalysisPage는 location.state.stockNavigation 존재로 목록 진입을 판단한다. 이웃 유무·API 로딩 상태로 내비게이션을 숨기지 않는다. 공통 StockNavigation과 PageHeader로 중앙 이름/아래 코드/좌우 버튼을 복원한다. 코드 10px/muted 및 disabled 경계 버튼 유지.
- 진입 계좌가 일치하는 원본 ID 순서만 사용한다. 로딩·계좌 불일치 중 다른 가치분석 목록 순서로 대체하지 않는다. move와 goView는 stockNavigation·returnTo·listEntryKey를 유지한다. 차트 뒤로가기는 현재 종목의 가치분석으로 전환하고 원본 목록 뒤로가기는 저장된 반환 경로로 이동한다.
- 목록에서 온 태블릿 상세는 단일 상세 영역, 가치분석에서 온 태블릿은 기존 검색/상세 분할이다. 선택 종목 제목은 공통 상단 한 줄, 중복 상세 제목 제거.
- LiveStockDetail의 가치분석/재무제표 링크도 원본 상태를 전달한다. 전용 useListNavigation(true)로 원본 반환 위치를 상속하며 거래수익 화면의 기존 내비게이션은 유지한다. Mock 링크도 상태를 전달한다.
- 검색 form submit을 confirmSearch로 통일한다. trim한 입력 DOM 값을 읽고 마지막 확정 query ref와 비교한다. 조합 ref 및 native isComposing/229를 확인하고 확정 후 blur한다. 이름·코드 OR 검색을 지원하는 기존 API는 변경하지 않는다.
- 재무지표 차트 컴포넌트·수집 API·계산·스케줄 변경 없음. 13차 화면 동작 유지.

검사: npm run typecheck:frontend, npm run build:frontend. PR CI playwright.phase10.config.ts에 financial-ui13-1.spec.ts를 추가하고 370×465·725×396·430×932·1024×768에서 실행한다. 13차 테스트와 기존 목록 이동/복원 회귀도 함께 실행한다.
