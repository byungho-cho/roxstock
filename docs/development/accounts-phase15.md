# 15차 계좌 관리·예수금 색상 구현

기준 main: ca24ffa (15차 기획 PR #148 포함). 별도 codex/phase15-accounts-cash-colors 브랜치.

## 범위와 데이터 보존

개인 단독 사용이라는 사용자 추가 지시에 따라 로그인·계좌 소유권은 후속 2차 과제다. 이번 삭제는 대상 활성 계좌 검증과 연결 데이터 없음 검증을 수행한다. 운영 계좌 초기화·삭제·자료 정정은 실행하지 않는다. 수집·손익·현재예수금 산정은 변경하지 않는다.

accountConnections는 buy_trades, cash_transactions, dividends, daily_account_snapshots, daily_position_snapshots, compound_growth_plans, account_watchlist_items, trade_requests 전체를 검사한다. sell_trades와 compound_growth_goals는 각각 매수·계획을 통해 간접 연결된다. 화면 기간 조건은 적용하지 않는다. 초기화는 위 자료 및 간접 자료를 단일 트랜잭션에서 삭제한다. Account 자체, 내부 설정 JSON, 공통 securities·가격·재무자료와 전역 legacy watchlist는 유지한다. 빈 계좌 삭제 시에는 Account 행과 그 내부 설정만 제거한다.

Serializable + 계좌 ID 순 FOR UPDATE로 확인/삭제/기본 계좌 변경을 묶는다. Restrict FK의 부모 잠금은 동시 자식 삽입을 기다리게 하고, 삭제가 먼저 완료되면 삽입은 실패한다. 자식 삽입이 먼저 완료되면 삭제는 ACCOUNT_HAS_DATA로 거부된다. 데이터 있음 검사를 우회하는 cascade 삭제는 없다. 기본 계좌가 없어지면 남은 활성 계좌 중 정렬상 첫 계좌를 기본으로 지정한다. 선택 상태는 프론트에서 삭제 성공 후에만 전환한다.

계좌번호 컬럼은 기존 nullable 스키마를 보존한다. 신규/수정 API는 세 필드를 검증하고 공백·하이픈 정규화 후 빈 번호를 거부한다. 기존 brokerName+normalizedAccountNumber 고유키를 재사용한다. 읽기 전용 운영 점검: 계좌 3건, 번호/정규화 누락 0건. DB 마이그레이션 없음.

## 공통 색상 (15차 당시 기록)

현재 색상은 [15.1차 최종 3안 구현](asset-composition15-1.md)을 우선한다. 아래는 당시 기록이다.

cashAllocation(stockValue,cashBalance,pricingComplete) 하나로 판정한다. 분모는 주식평가액+최신 등록 세후예수금이며 표시 반올림 전 값이다. 30% 이상 녹색/노랑, 20% 이상 빨강/파랑, 미만 파랑/빨강. 분모 0 또는 누락/조회 실패는 중립색과 —, 확인 금액은 유지한다. 홈·평가자산 카드/구성·자산분석·예수금·계좌 카드가 재사용한다. 계좌 카드별 dashboard query key를 분리하며 기존 포트폴리오 무효화와 30초 갱신을 따른다.

## 실행 방법

```sh
npm run typecheck --workspaces
npm run build --workspaces
npm test --workspace backend
node --import tsx --test frontend/src/utils/cashAllocation.test.ts
# DATABASE_URL은 loopback *_phase15_test 전용 DB여야 함
node --import tsx backend/tests/prepare-accounts-phase15.ts
node --import tsx --test backend/tests/accounts-phase15.integration.ts
cd frontend
npx playwright test -c playwright.phase15.config.ts
```

실제 로컬 MariaDB 13.0.2에서 입력·중복·초기화 오류 롤백·삭제·동시 FK 추가·기본/마지막 계좌를 검증했다. CI는 MariaDB 11.8.9로 재검증한다. 브라우저 검사는 모의 API이며 실기기·운영 쓰기 검증이 아니다. 캡처와 결과는 QA 기록 참조.
