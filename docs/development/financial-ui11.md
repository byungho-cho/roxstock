# 11차 재무지표 UI 구현

기준 main c037ffd. 이번 작업은 frontend와 UI/개발/검증 문서만 변경한다. 수집·계산, PER/PBR 보충, 인증키, 운영 데이터, DB 및 API 계약은 변경하지 않는다.

## 공통 Small 버튼

기존 Common.ActionButton에 size=small 규격을 추가하고 갱신/연간/분기를 연결한다. 다른 컴팩트 화면에서 사용하던 28px 높이, 8px 라운드, 좌우 8px 패딩, 11px 글자와 기존 색상 토큰을 재사용한다. 선택(primary)·비선택(muted)·비활성 색을 공통 처리하고 아이콘은 16px이다. 일반 크기의 기존 버튼 규격은 유지한다. 갱신 버튼은 진행 중에도 팝업을 열어 실제 상태를 볼 수 있으며 접수/폴링 코드는 기존 것을 유지한다.

## 연도 선택과 sticky

FinancialPeriodHeader를 차트 컴포넌트에서 페이지의 제목/모드 영역으로 이동한다. 데이터와 같은 94px + repeat 열, 8px gap, 16px inset으로 열의 중앙을 정렬한다. 중앙 선택은 텍스트 Button + MUI Menu/MenuItem이며 listbox/option, aria-selected/expanded, 선택/외부 클릭/Esc 닫기와 기본 키보드 탐색을 제공한다. 선택 후 포커스가 유지되도록 연간 세 슬롯의 React key는 인덱스로 고정한다.

sticky top=0은 본문 main scroll container 기준이므로 고정 전역 헤더 바로 아래에 붙는다. canvas 불투명 배경과 z-index 10, 기존 MUI 선택 목록/갱신 Dialog 계층을 사용한다. 분기 시작기간과 분기 열도 같은 sticky 영역 안에 유지한다. 연간 기간 헤더는 선택 연도로 즉시 표시하고 차트는 새 응답 전까지 기존 데이터를 유지한다.

## 스크롤 유지

usePageScrollRestoration에서 data-financial-chart가 있는 화면만 centerYear/annualStart/endYear를 스크롤 키에서 제외한다. 연간 data-list-condition은 종목/모드만 사용하며 다른 화면과 분기 조건의 기존 키는 유지한다. 연도 변경 시 기존 위치를 조회하고 콘텐츠가 짧으면 scrollHeight-clientHeight까지만 보정한다. 이전 기간 안내는 높이가 고정된 제목 줄 안에서 말줄임으로 표시하며 원문은 title에 보존한다. 안내를 차트 본문에 삽입하지 않아 정상 조회 중 높이 변화를 줄인다. chartDetail 제외 및 전체화면 브라우저/화면 뒤로가기 복원은 유지한다.

기존 중앙 범위 2016~현재 연도−1, 양끝 2015/현재 연도 비활성, URL 보정/호환, 종목 이동 선택 유지 규칙은 변경하지 않는다.

검증·캡처: [11차 화면 QA](../qa/financial-ui11.md).
