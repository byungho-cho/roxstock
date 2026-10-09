# RoxStock 계좌·보유종목·대시보드 API v0.2

## 15차 변경 요구 · 2026-10-09 · 구현 계약 (운영 반영은 배포 결과 별도 확인)

[15차 정본](../handoff/20261009-phase15-accounts-cash-ratio.md) 및 [검증 계획](../qa/accounts-cash-ratio15.md)을 따른다. 아래 계약은 15차 구현에 맞춰 갱신했다.

- 추가·수정의 name/brokerName/accountNumber 모두 필수. 정규화 후 빈 계좌번호도 차단하고 증권사+정규화 번호 중복 검사(자기 제외). 스키마/기존 데이터 검증 후 NOT NULL 이행 여부 기록.
- 계좌 전체의 연결 데이터 유무를 서버에서 제공하고 조회실패를 데이터 없음으로 표시하지 않는다.
- 삭제는 대상·연결 데이터 없음 재검증과 계좌 완전 삭제를 원자적으로 처리. 검증 후 동시 데이터 추가도 방어.
- 사용중/기본 계좌 삭제 후 남은 활성 계좌로 전환, 마지막 삭제 후 계좌 없음. 실제 응답·오류코드·삭제 경로는 아래 구현 상세를 따른다.
- 초기화는 계좌명 일치 확인, 계좌 삭제는 이름 재입력 없는 취소/삭제 확인 팝업으로 구분.
- 현재예수금은 [12차 최신 등록 세후예수금 기준](../development/cash-v05.md) 유지.
- 색상은 예수금/(주식평가액+예수금)의 반올림 전 비율을 공통 판정.30% 이상 주식 녹색/현금 노랑,20% 이상~30% 미만 주식 빨강/현금 파랑,20% 미만 주식 파랑/현금 빨강. 비율 계산 불가는 null/—로 구분하고 금액0으로 대체하지 않는다.

## 0. 계좌 목록·추가·변경

```http
GET /api/accounts
POST /api/accounts
PATCH /api/accounts/{accountId}
```

생성·변경 요청은 `name`, `brokerName`, 필수값 `accountNumber`, `isDefault`를 사용합니다. 첫 활성 계좌는 자동으로 기본 계좌가 됩니다. 기본 계좌를 다른 계좌로 변경하면 기존 기본 계좌는 같은 트랜잭션에서 해제됩니다.

계좌번호는 공백·탭·하이픈을 제거해 정규화하며 `brokerName + normalizedAccountNumber`가 같은 계좌는 중복 등록할 수 없습니다. 정규화 후 빈 계좌번호는 저장을 거부합니다. 수정 시 자기 자신은 기존 복합 고유키로 제외합니다. 중복 시 `409 ACCOUNT_ALREADY_EXISTS`, 현재 기본 계좌를 대체 계좌 없이 해제하면 `409 DEFAULT_ACCOUNT_REQUIRED`를 반환합니다.

### 테스트용 계좌 데이터 초기화

```http
POST /api/accounts/{accountId}/reset
Content-Type: application/json

{ "confirmation": "대상 계좌명과 정확히 같은 문자열" }
```

`ENABLE_ACCOUNT_DATA_RESET=true`인 환경에서만 실행됩니다. 계좌 자체와 계좌 설정, 공통 종목·시세 및 전역 과거 분류 자료는 유지하고 다음 계좌 종속 데이터를 단일 트랜잭션으로 삭제합니다.

- 매수·매도와 현금 거래
- 배당
- 일별 계좌·보유종목 스냅샷
- 복리 계획과 목표
- 계좌별 보유·관심 목록과 거래 요청 멱등성 기록
- 현재예수금의 기준 내역(초기화 후 null/—; 계좌 캐시 필드는 0)

다른 계좌의 자료와 공통 종목 분류는 변경하지 않습니다. 비활성 환경은 `403 ACCOUNT_RESET_DISABLED`, 확인 문구 불일치는 `400 RESET_CONFIRMATION_MISMATCH`, 같은 API 프로세스의 중복 실행은 `409 ACCOUNT_RESET_IN_PROGRESS`입니다.

## 1. 계산 기준

- 보유수량은 계좌와 종목별로 `매수수량 - 연결된 매도수량`을 합산합니다.
- 전량 매도된 Lot은 보유종목에서 제외합니다.
- 매입금액은 각 Lot의 `잔여수량 × 해당 매수단가` 합계입니다.
- 평가금액은 `보유수량 × 현재가`입니다.
- 평가손익은 `평가금액 - 매입금액`, 수익률은 `평가손익 ÷ 매입금액 × 100`입니다.
- API 프로세스의 실시간 캐시와 DB 가격 중 거래시각이 최신인 값을 사용합니다.
- 보유종목 가격이 하나라도 없으면 `pricingComplete=false`이며 주식평가액과 총평가자산은 `null`입니다. 가격 누락을 0원으로 간주하지 않습니다.
- 가격·수량·금액·비율은 부동소수점 오차 방지를 위해 문자열로 반환합니다.

## 2. 계좌별 보유종목

```http
GET /api/accounts/{accountId}/holdings
```

주요 응답 필드는 `securityId`, `symbol`, `name`, `marketType`, `quantity`, `purchaseAmount`, `averagePurchasePrice`, `currentPrice`, `previousClosePrice`, `marketValue`, `unrealizedProfitLoss`, `unrealizedReturnRate`, `priceChangeRate`, `priceUpdatedAt`, `marketStatus`입니다.

정렬은 평가금액 내림차순이며 가격이 없는 종목은 뒤에서 종목명순으로 반환합니다.

## 3. 계좌 대시보드

```http
GET /api/accounts/{accountId}/dashboard
```

응답은 계좌 정보, `cashBalance`, `purchaseAmount`, `stockValue`, `totalAssetValue`, `unrealizedProfitLoss`, `unrealizedReturnRate`, `pricingComplete`, `missingPriceSymbols`, `latestPriceUpdatedAt`, `holdings`와 다음 성과 필드를 포함합니다.

| 필드 | 단위 | 계산 기준 |
|---|---:|---|
| `previousDayChange` | 원(문자열) | 현재 총자산 - 한국시간 직전 달력일 최종 스냅샷 총자산(입출금 포함) |
| `previousDayChangeRate` | %(문자열) | `previousDayChange / 직전 달력일 총자산 * 100` |
| `dailyProfit` | 원(문자열) | 현재 총자산 - 한국시간 직전 달력일 최종 스냅샷 총자산 - 당일 입금 + 당일 출금 |
| `dailyProfitRate` | %(문자열) | `dailyProfit / 직전 달력일 총자산 * 100` |
| `stockMonthlyProfit` | 원(문자열) | 현재 주식평가액 - 전월 말일 스냅샷 주식평가액 |
| `cashMonthlyProfit` | 원(문자열) | 현재 예수금 - 전월 말일 스냅샷 예수금 |

매수·매도는 예수금과 주식 간 내부 이동이므로 일별손익에서 별도로 더하거나 빼지 않습니다. 따라서 당일 매수, 분할매도, 매도 실현손익과 수수료·세금은 현재 총자산 변화에 자연스럽게 포함됩니다. 입금·출금만 외부 현금흐름으로 제거하며 배당은 투자 손익으로 남깁니다. 월간 주식·예수금 변화액은 손익이 아니라 각 자산 구성요소의 변화이므로 해당 월의 매수·매도·입출금·배당 효과를 모두 포함합니다.

`performanceMeta`는 `timezone=Asia/Seoul`, `asOfDate`, `calculatedAt`, `previousDayBaselineDate`, `previousMonthEndBaselineDate`, 당일 입출금 합계, 각 필드의 계산 불가 사유와 `calculationMethod=NET_FLOW_ADJUSTED_SIMPLE`을 제공합니다. 금액·비율은 Decimal 문자열이며 계산 불가 값은 `0`이 아니라 `null`입니다.

계산 불가 사유는 다음과 같습니다.

- `CURRENT_PRICE_INCOMPLETE`: 보유종목 현재가 누락
- `PREVIOUS_DAY_SNAPSHOT_MISSING`: 직전 달력일 스냅샷 부재
- `PREVIOUS_DAY_ASSET_VALUE_ZERO`: 일별손익률 분모가 0원(일별손익 금액은 계산 가능)
- `PREVIOUS_MONTH_END_SNAPSHOT_MISSING`: 전월 말일 스냅샷 부재

시세 누락 시 `dailyProfit`, `dailyProfitRate`, `stockMonthlyProfit`은 `null`이지만, 전월 말 스냅샷이 있으면 현재 예수금만으로 계산 가능한 `cashMonthlyProfit`은 정상 반환합니다. 초기 계좌처럼 기준 스냅샷이 없으면 대응 필드는 `null`입니다. 휴일도 직전 달력일 스냅샷을 사용하므로 기준일이 다른 날짜로 암묵적으로 늘어나지 않습니다.

`holdings`에는 계좌별 보유종목 API와 동일한 항목이 포함됩니다. 프론트엔드는 대시보드 최초 진입 시 이 API를 사용하고 이후 SSE 가격 메시지로 해당 종목을 갱신합니다.

## 4. 과거 자산 추이

```http
GET /api/accounts/{accountId}/asset-history?from=2026-01-01&to=2026-09-28
```

`from`, `to`는 선택값이며 한국 날짜 `YYYY-MM-DD` 형식이고 양 끝 날짜를 포함합니다. `data`는 일별 스냅샷의 `cashBalance`, `stockValue`, `totalAssetValue`, 직전 스냅샷 대비 `change`, `changeRate`, 최종 갱신시각을 날짜 오름차순으로 반환합니다.

`summary`는 조회 범위의 시작·종료 자산, 두 스냅샷 사이의 입금·출금, 순투입금, 자산증감, 순투입금을 제외한 손익과 단순 수익률을 반환합니다.

```text
순투입금 = 입금 - 출금
손익 = 종료자산 - 시작자산 - 순투입금
수익률 = 손익 / 시작자산 × 100
```

계산 방식은 `NET_FLOW_ADJUSTED_SIMPLE`로 명시합니다. 이는 TWR·MWR이 아니며, 스냅샷이 2개 미만이거나 시작자산이 0원이면 계산할 근거가 없으므로 `profitLoss`, `returnRate`를 임의의 `0` 대신 `null`로 반환합니다. 거래 수정·삭제로 과거 스냅샷을 자동 재계산하지 않는 규칙을 그대로 따릅니다.

## 5. 오류

- 잘못된 계좌 ID: `400 INVALID_INPUT`
- 없거나 비활성화된 계좌: `404 ACCOUNT_NOT_FOUND`


1001 전일 대비는 `previousDayChange`·`previousDayChangeRate`를 표시합니다. 일별손익과 별도 계산하며, 시세·직전 달력일 스냅샷 부재는 두 값 모두 null, 전일 총자산 0원은 비율만 null입니다. 갱신 시각은 계산 시각이 아닌 `latestPriceUpdatedAt`을 표시합니다.

## 15차 구현 상세

- `GET /api/accounts/{accountId}/data-state`: `{data:{hasData,counts}}`. 8개 직접 연결 테이블의 전 기간 건수를 확인합니다.
- `DELETE /api/accounts/{accountId}`: 빈 활성 계좌만 삭제, `{data:{accountId,nextAccountId}}`. 마지막 계좌면 nextAccountId=null. 연결 자료 있음은 409 ACCOUNT_HAS_DATA, 없는/비활성 계좌는 404 ACCOUNT_NOT_FOUND.
- 모든 계좌 행을 ID순 FOR UPDATE 잠금한 Serializable 트랜잭션에서 확인·삭제·기본 계좌 전환합니다. Restrict 외래키가 새 자식 추가와 삭제 간 충돌을 방어합니다. 연결 자료를 연쇄 삭제하지 않습니다.
- 사용자 2026-10-09 추가 결정: 개인 단독 사용이므로 로그인·계좌 소유권 검사는 이번 범위 제외, 후속 2차 검토. 이를 권한 검사 통과로 보고하지 않습니다.
- 기존 nullable 컬럼은 보존하며 API 필수 검증을 적용합니다. 운영 읽기 전용 점검에서 계좌 3건 모두 번호·정규화 값이 존재했습니다. NOT NULL 변경/DB 마이그레이션은 없습니다.
