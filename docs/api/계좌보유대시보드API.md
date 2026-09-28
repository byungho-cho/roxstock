# RoxStock 계좌·보유종목·대시보드 API v0.1

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

응답은 계좌 정보, `cashBalance`, `purchaseAmount`, `stockValue`, `totalAssetValue`, `unrealizedProfitLoss`, `unrealizedReturnRate`, `pricingComplete`, `missingPriceSymbols`, `latestPriceUpdatedAt`, `holdings`를 포함합니다.

`holdings`에는 계좌별 보유종목 API와 동일한 항목이 포함됩니다. 프론트엔드는 대시보드 최초 진입 시 이 API를 사용하고 이후 SSE 가격 메시지로 해당 종목을 갱신합니다.

## 4. 오류

- 잘못된 계좌 ID: `400 INVALID_INPUT`
- 없거나 비활성화된 계좌: `404 ACCOUNT_NOT_FOUND`

