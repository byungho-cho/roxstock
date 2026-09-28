# RoxStock 거래 API v0.1

## 공통 규칙

- 금액과 수량은 문자열로 반환합니다.
- 거래일의 일별 집계 기준 시간대는 `Asia/Seoul`입니다.
- 한 매수 Lot에는 여러 분할매도를 연결할 수 있지만, 하나의 매도가 여러 매수 Lot을 합치지는 않습니다.
- 실현손익은 `매도수량 × (매도단가 - 연결된 매수단가)`로 계산합니다.

## 거래 통합 조회

```http
GET /api/accounts/{accountId}/trades?from=2026-09-01&to=2026-09-30&securityId=262
```

`from`, `to`, `securityId`는 선택값입니다. `from`과 `to`는 한국 날짜 `YYYY-MM-DD` 형식이며 양 끝 날짜를 모두 포함합니다.

응답의 `data`는 매수와 매도를 거래시각 내림차순으로 합친 목록입니다. 매도 항목에는 원본 Lot 식별자인 `buyTradeId`와 `realizedProfitLoss`가 포함됩니다. `summary`는 조회 범위의 매수금액, 매도금액, 실현손익 합계입니다. `daily`는 매매일지 달력에 사용할 날짜별 매수·매도 건수와 금액입니다.

## 매도 가능 Lot 조회

```http
GET /api/accounts/{accountId}/buy-lots?securityId=262&remainingOnly=true
```

- `securityId`를 생략하면 계좌의 모든 매수 Lot을 반환합니다.
- `remainingOnly` 기본값은 `true`이며 잔여수량이 있는 Lot만 반환합니다.
- `remainingOnly=false`이면 전량 매도된 Lot과 연결된 분할매도 목록도 함께 확인할 수 있습니다.

프론트엔드 매도 입력 화면은 이 API에서 하나의 Lot을 선택한 뒤 `POST /api/sell-trades`에 해당 `buyTradeId`를 전달합니다.

## 매수 등록

```http
POST /api/buy-trades
```

필수값은 `accountId`, `securityId`, `boughtAt`, `quantity`, `unitPrice`이며 `feeTaxAmount`, `memo`는 선택값입니다. 예수금에서 `수량 × 단가 + 거래비용`을 즉시 차감합니다.

## 분할매도 등록

```http
POST /api/sell-trades
```

필수값은 `buyTradeId`, `soldAt`, `quantity`, `unitPrice`이며 `feeTaxAmount`, `memo`는 선택값입니다. 선택한 Lot의 잔여수량을 초과하면 `409 QUANTITY_EXCEEDS_REMAINING`을 반환합니다.
