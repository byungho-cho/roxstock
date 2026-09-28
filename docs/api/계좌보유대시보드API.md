# RoxStock 계좌·보유종목·대시보드 API v0.2

## 0. 계좌 목록·추가·변경

```http
GET /api/accounts
POST /api/accounts
PATCH /api/accounts/{accountId}
```

생성·변경 요청은 `name`, `brokerName`, 선택값 `accountNumber`, `isDefault`를 사용합니다. 첫 활성 계좌는 자동으로 기본 계좌가 됩니다. 기본 계좌를 다른 계좌로 변경하면 기존 기본 계좌는 같은 트랜잭션에서 해제됩니다.

계좌번호는 공백·탭·하이픈을 제거해 정규화하며 `brokerName + normalizedAccountNumber`가 같은 계좌는 중복 등록할 수 없습니다. 계좌번호가 없는 계좌는 중복 번호 검사를 적용하지 않습니다. 중복 시 `409 ACCOUNT_ALREADY_EXISTS`, 현재 기본 계좌를 대체 계좌 없이 해제하면 `409 DEFAULT_ACCOUNT_REQUIRED`를 반환합니다.

### 테스트용 계좌 데이터 초기화

```http
POST /api/accounts/{accountId}/reset
Content-Type: application/json

{ "confirmation": "초기화" }
```

`ENABLE_ACCOUNT_DATA_RESET=true`인 환경에서만 실행됩니다. 계좌 자체와 계좌 설정, 공통 종목·시세, 계좌 공통 관심·추천 목록은 유지하고 다음 계좌 종속 데이터를 단일 트랜잭션으로 삭제합니다.

- 매수·매도와 현금 거래
- 배당
- 일별 계좌·보유종목 스냅샷
- 복리 계획과 목표
- 현재 예수금(0원으로 변경)

보유 종목 분류는 다른 계좌의 잔여 Lot까지 확인한 뒤 재계산합니다. 비활성 환경은 `403 ACCOUNT_RESET_DISABLED`, 확인 문구 불일치는 `400 RESET_CONFIRMATION_MISMATCH`, 같은 API 프로세스의 중복 실행은 `409 ACCOUNT_RESET_IN_PROGRESS`입니다.

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
