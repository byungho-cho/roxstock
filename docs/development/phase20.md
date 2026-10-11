# 20차 구현

- `DelayedSkeleton`이 MUI 크기·sx·표시 공간을 보존하고 표시만 200ms 늦춘다. 타이머는 unmount 시 취소한다. API/렌더링/콘텐츠 표시 시간은 변경하지 않는다. 모든 기존 스켈레톤 사용처가 이 공통 컴포넌트를 사용한다. 코드 Suspense 역시 동일 기준을 사용한다.
- `MorePage`, `SettingsPage`만 정적 import. 더보기의 가벼운 `SettingsOverview`를 `MoreScreens`에서 분리해 계좌 편집·제세금·수집 상세가 초기 메뉴에 끌려오지 않도록 한다. 상세 Suspense는 패널 내부에 남는다.
- 매수 폼의 기존 `allBuyLots(accountId, securityId)` 조회를 재사용하며 `remainingOnly=false` 및 AbortSignal을 전달한다. 서버는 accountId/securityId로 필터링한다. `latestBuy`는 일시와 정확한 BIGINT ID로 직전 기록을 선택하며 API 반환 배열을 변형하지 않는다.
- 계좌·유형·종목·거래 변경 시 폼 key가 바뀌어 입력/초기화 플래그를 격리한다. 입력 변경·포인터·키보드 조작 후에는 늦은 자동 입력과 포커스를 실행하지 않는다. 수정에는 초기값·포커스 규칙을 적용하지 않는다.
- 태블릿 팝업의 배경 종목 탭 동기화는 실제 화면 경로와 배경 경로가 같을 때만 실행한다. 팝업을 배경 탭 URL로 덮어 닫지 않게 한다.
- 가치분석의 성공 데이터 보존은 동일 계좌에 한정한다. 계좌가 바뀌면 이전 계좌의 retained list/detail을 사용할 수 없다.
- DB 스키마·백엔드·계산식·자동 수집 스케줄 변경 없음. PR 필수 검사 후 자동 병합하고 기존 운영 배포 경로 사용. 운영 배포 완료 대기는 기존 사용자 지시에 따라 별도 상태로 보고한다.

검사: `npm run typecheck:frontend`, `npm run build:frontend`, `node --import tsx --test frontend/tests/unit/phase20.test.ts`, `npm exec --workspace frontend -- playwright test --config playwright.phase20.config.ts`.

홈 후속: DashboardPage가 기존 history query 데이터를 직접 읽고, 신규 API 없이 차트의 summary 의존을 제거한다. HomeListCard stable 옵션은 홈의 290px/5행 공간만 고정한다. AssetSummaryCards loading 옵션은 홈만 활성화한다. 상세 페이지의 기본 옵션과 계산 로직은 유지한다. 지역 재시도는 해당 query의 refetch를 사용한다.
