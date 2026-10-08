# 11차 재무지표 화면 검증

2026-10-08 · main c037ffd 기준 별도 작업 브랜치. 수집·계산·API·인증키·DB·운영 데이터는 변경하지 않는다. PER/PBR의 수집 오류와 계산 근거 부족은 별도 후속 작업이다.

## 변경 결과

- 기존 공통 ActionButton과 스타일 토큰을 사용한 28px Small 갱신/연간/분기 버튼. 선택/비선택/비활성 상태, 8px 라운드, 패딩과 아이콘 규격 통일. 갱신 실행/진행 상태 코드는 유지한다.
- 데이터와 같은 열 구조로 연도 텍스트를 열 중앙에 정렬. 중앙 상시 셀렉트/테두리/배경/화살표를 제거하고 터치/클릭/키보드로만 선택 목록을 연다. 현재값 표시, 선택/Esc/외부 클릭 닫기, 포커스 반환, 화면 경계 보정. 기존 범위·URL 호환·종목 이동·예상치 표시를 유지한다.
- 제목/버튼/기간 헤더 하나의 sticky(top=0) 영역. 본문 main의 시작점이 고정 헤더 바로 아래이며 canvas 배경과 모달 계층을 사용한다. 연도만 바꾸면 기존 스크롤 키를 공유하며 로딩 중 데이터는 유지한다. 이전 데이터 안내는 제목 줄 안에 표시하여 본문 높이가 늘지 않는다. 짧아진 콘텐츠는 최대 위치로 보정한다.

구현 세부사항: [개발 문서](../development/financial-ui11.md). 공통 UI 가이드의 11차 항목을 해당 부분에 한해 우선한다.

## 검사

Chromium 153, API fixture, 터치 지원. 커버 370×465 및 펼침 725×396 CSS px. 운영 데이터를 수정하거나 수집을 실행하지 않았다.

- frontend TypeScript 검사와 production 빌드 통과.
- 11차 12개 검사 통과: 버튼 규격, 데이터 열 중앙과 1px 이내 정렬, 불투명 sticky와 고정 헤더 위치, 터치/키보드/선택값/Esc/외부 클릭/포커스, 선택 목록 경계 및 갱신 Dialog 겹침, 중간/하단에서 좌우 이동·중앙 선택, 지연 응답 중 위치 유지, 데이터 교체 후 유지, 짧아진 콘텐츠의 최대 위치 보정, 전체화면 및 두 뒤로가기.
- 기존 갱신/재무지표 32개, 가치분석·재무제표·복리 관련 회귀 34개. 고유 총 78개 검사 통과. 기존 회귀 첫 실행의 2개 이전 데이터 안내 검사는 안내를 제목 줄로 보존한 뒤 재실행하여 통과했다. 연도 선택 후 버튼 재생성에 따른 포커스 문제도 고정 슬롯 key로 수정하고 11차 전체를 재실행했다.
- 검사 설정: playwright.financial-ui11.config.ts(12), playwright.financial-ui.config.ts(32), playwright.financial-regression.config.ts(34). 기존 CI phase10 설정에 11차 검사를 추가했다.
- 화면 캡처는 선택 목록/팝업 전환 애니메이션 완료 후 촬영했다. 전체화면 복귀 검사는 진입 링크를 화면 중앙으로 가져온 뒤 pointerdown 시점의 실제 진입 위치를 기록하고 두 뒤로가기 후 비교한다. 펼침 화면의 테스트 자동 가시성 스크롤(21px)을 복원 오류로 세지 않도록 진입 직전 위치를 측정했다.

## 화면 확인

| 대상 | 커버 | 펼침 |
|---|---|---|
| 본문 중간 sticky | [커버](financial-ui11/cover-sticky-middle.png) | [펼침](financial-ui11/tablet-sticky-middle.png) |
| 연도 선택 목록 | [커버](financial-ui11/cover-year-options.png) | [펼침](financial-ui11/tablet-year-options.png) |
| 갱신 팝업 계층 | [커버](financial-ui11/cover-refresh-over-sticky.png) | [펼침](financial-ui11/tablet-refresh-over-sticky.png) |

## 남은 사항

실제 Galaxy Z Fold 및 운영 수집 중 상태는 이번 검증에서 실행하지 않았다. 기존 MainLoadingBar의 개발 모드 render-phase 경고와 약 1MB 번들 경고는 남아 있다. PER/PBR 근거/수집 오류 및 실제 예상치 공급 연동은 범위 밖이다. PR 필수 검사 → 자동 병합 → 변경 범위에 따른 기존 배포 절차로 반영한다.
