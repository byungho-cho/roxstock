# 13차 재무지표·가치분석 화면 개선 · 2026.10.08

기준 main: c61abf12f4912a89087f5691c4307a7a1ffcb92b (12차 예수금 PR #141 병합 후).
작업 브랜치: codex/financial-ui13-20261008. 동일 항목의 과거 화면 지시보다 본 구현을 우선한다.

- 가치분석·재무지표 상세 상단 뒤로가기·두 줄 내비게이션 제거. 종목명 (코드)를 한 줄 왼쪽 정렬. 긴 이름은 말줄임하고 코드 공간 유지. 목록 화면 뒤로가기, 하단 메뉴와 전체화면 차트 뒤로가기는 유지한다. 종목 상세 스와이프는 유지한다.
- 가치분석 갱신 버튼은 현재가 오른쪽 8px 임시 위치, 공통 Small을 사용한다. 재무지표 갱신은 기존 제목 행 유지. 갱신 API·진행 상태·수동 실행 로직은 변경하지 않는다.
- 불투명 sticky 제목·갱신·모드·기간 영역 유지. 기간 아래 padding/margin 0, 공통 borderStrong 회색 1px 구분선.
- 카드 차트 툴팁과 브라우저 SVG title 툴팁 제거. 노란 세로 가이드선·선택점·선택 기간 수치 전체 노란색 표시. 기간 제목 수집 상태 색상과 계열 색상 유지.
- 카드 제목·범례·수치표·차트 데이터 영역 밖 클릭/터치로 초기화. document pointerdown capture로 외부 입력을 감지하고 차트 pointer 이벤트 전파와 종목 스와이프 간섭을 차단. pan-y로 세로 스크롤 허용.
- 흰색 focus outline 제거는 이 재무지표 SVG에만 한정. 다른 버튼·입력 포커스 스타일 유지. SVG 방향키 선택 유지.
- 수치표 column gap 8→4px, row gap 8→0px, margin top 4→0px. 기간 헤더 열 간격도 4px로 맞춘다. 항목 왼쪽·값 오른쪽 정렬 유지.
- 카드 제목바: 제목 왼쪽/범례 전체 너비 중앙/상세보기 오른쪽. 범례 공통 9px 글자·4px 점·4px 항목 간격. 카드 하단 범례 제거. 전체화면 하단 범례 유지.
- 전체화면 툴팁 190→133px, box-sizing border-box, padding 4px, 항목/값 간격 4px. 기간 제목·계열색·단위·데이터 없음·미제공 안내 유지, 값 끝선 오른쪽 정렬. 외부 입력으로 툴팁·가이드선·선택점 초기화. 전체 기간 조회·진입/복귀 유지.

수집·계산·스케줄·DB·12차 예수금은 수정하지 않는다. #137 임시 소통 브랜치는 병합하지 않는다.

검증: `npm run typecheck:frontend`, `npm run build:frontend`, `cd frontend && npx playwright test -c playwright.financial-ui13.config.ts`, 기존 PR 회귀는 `playwright.phase10.config.ts`.
