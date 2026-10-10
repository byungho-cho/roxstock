# 복리 카드·실현자산 차트 QA (2026-10-09)

아래는 PR #171 당시 검사 기록이다. 현재 색상·진행 막대 기준과 후속 검증은 [17차 후속 QA](phase17-followup.md)를 따른다.

화면 API는 Playwright 모의 응답이다. 실제 운영 데이터·실기기 검증과 구분한다. 기준 main 65f4f58, Chromium, Asia/Seoul, 커버 370×465·태블릿 725×396·큰 화면 1280×800 CSS px.

| 검사 | 결과 및 범위 |
| --- | --- |
| 프론트 TypeScript / 빌드 | 통과. 기존 번들 크기 경고 유지 |
| 백엔드 TypeScript / 빌드 / 회귀 | 통과, 164건. 백엔드 구현 변경 없음 |
| 금액 판정 단위 검사 | 2건 통과: 90%/100% 직전·동일·직후, 반올림 경계, 정수 정밀도 초과, 0/음수/누락/미수집 |
| 복리 브라우저 회귀 | 20건 통과. 기존 8건과 카드·차트·캐시·이력·응답 검증 12건 |
| 기존 분석·차트·탐색 회귀 | 공통 모의 응답에 새 복리 조회 API를 추가하고 기존 기간·터치·로딩·뒤로가기 기준을 유지 |
| 기존 운영 개선 카드 회귀 | 1건 통과. 새 복리 조회 API와 현재 자산 의미를 반영한 모의 응답 |
| 자산분석·종목 입력 회귀 | 커버·태블릿에서 18건 통과. 새 오류 카드의 재시도 접근성 이름은 기존 자산 이력 재시도와 구분 |
| 격리 실제 DB | 기존 CI Compound Function Check가 MariaDB 11.8.9를 생성하여 `backend/tests/compound-growth.integration.ts` 실행. 정확한 12/31·12/30 제외·다른 계좌 제외·실제 0·올해 현재 자산·기본 목표 동시 변경을 검증. 해당 PR Actions 결과를 최종 기준으로 확인 |

복리 브라우저 검사는 실제 React Query·라우터·폼을 사용하고 API만 격리했다. 거래·예수금·현재가 저장 후 기존 무효화 흐름을 거쳐 복리 현재 자산·최종 목표 기준 진행률·올해 실현금액·색상이 갱신됨을 확인한다. 느린 재조회 중 이전 내용 유지, 빠른 계좌 전환 후 늦은 응답 격리, 서울 12/31 23:59:59→1/1 00:00:01 재조회도 검사한다.

카드의 실제 계좌/계획/기본 목표 ID 직접 이동, 기간/조회 조건/분석 스크롤 복원, 일반 입력 반복 열기·브라우저 뒤로가기·X·취소·목표 스크롤 복원을 확인한다. URL 입력은 공통 로컬 팝업 이력을 추가하지 않는다. 저장 요청이 늦게 완료되는 동안 뒤로가기로 먼저 닫아도 목표 이력을 두 번 소비하지 않음을 검사한다. 삭제·기본 목표 확인창의 기존 동작은 기존 회귀로 유지한다.

차트 실현금액 경로는 누락마다 `M`으로 분리되고 실제 0/고립된 올해 금액은 점으로 표시된다. 범례·툴팁·표 값이 일치한다. 마우스 이동, 터치 탭, 키보드 초점·좌우/Home/End/Escape, 툴팁 폭 제한, `touch-action:pan-y`와 터치 이동의 preventDefault 없음, 긴 계획명·18자리 금액의 화면 폭을 확인한다. 세로 제스처의 실제 OS/실기기 동작은 미검증이다.

## 화면 캡처

| 화면 | 커버 370×465 | 태블릿 725×396 | 큰 화면 1280×800 |
| --- | --- | --- | --- |
| 자산분석 요약 카드 | [커버](compound-goal-cards-chart/analysis-370.png) | [태블릿](compound-goal-cards-chart/analysis-725.png) | [큰 화면](compound-goal-cards-chart/analysis-1280.png) |
| 목표 상세 요약·기간 | [커버](compound-goal-cards-chart/summary-370.png) | [태블릿](compound-goal-cards-chart/summary-725.png) | [큰 화면](compound-goal-cards-chart/summary-1280.png) |
| 실현금액 차트·툴팁 | [커버](compound-goal-cards-chart/chart-370.png) | [태블릿](compound-goal-cards-chart/chart-725.png) | [큰 화면](compound-goal-cards-chart/chart-1280.png) |
| 일반 입력 | [커버 전체 화면](compound-goal-cards-chart/input-370.png) | [태블릿 팝업](compound-goal-cards-chart/input-725.png) | [큰 화면 팝업](compound-goal-cards-chart/input-1280.png) |

재현: `node --import tsx --test frontend/tests/unit/compound-achievement.test.ts`, `npm run typecheck:frontend`, `npm run build:frontend`, `npm --workspace backend test`, frontend에서 `npx playwright test --config=playwright.compound.config.ts --workers=2`. 기존 회귀는 `playwright.targets.config.ts`에서 analysis-v04·stock-inputs-v04를 선택한다. CI는 `compound-goal-qa` 아티팩트로 캡처를 보관한다.

미검증: 실제 OS 모바일 시스템 뒤로가기·실기기 세로 스와이프·운영 계좌에서 변경 후 확인·운영 배포 후 확인. 운영 데이터 쓰기/정정, 수집 로직 및 스케줄 변경 없음. 해당 작업 당시 운영 확인은 수행하지 않았다. 17차 후속 작업은 배포 완료와 운영 확인을 별도 기록한다.
