# RoxStock 계좌·보유종목·대시보드 API v0.2

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



## 5. 계좌 목록·생성·변경·비활성화 (v0.2)

응답의 기본 래퍼는 `{ "data": ... }`이다. 목록의 정렬은 `displayOrder ASC, id ASC`이며 `isActive`, `isDefault`를 포함한다. 일반 화면은 활성 계좌만 선택한다. 목록은 비활성 계좌도 반환하고 프론트는 이를 별도 관리 항목으로 구분한다.

| 작업 | 요청 | 주요 입력 | 결과 |
|---|---|---|---|
| 목록 | `GET /api/accounts` | 없음 | `200 {data: [{id,name,brokerName,accountNumber,isActive,isDefault,displayOrder,cashBalance,...}]}` |
| 생성 | `POST /api/accounts` | `name, brokerName, accountNumber, isDefault?` | `201 {data: {id,...,isDefault}}` |
| 변경 | `PATCH /api/accounts/{accountId}` | `name?, brokerName?, accountNumber?, isDefault?` | `200 {data: {id,...,isDefault}}` |
| 비활성화 | `DELETE /api/accounts/{accountId}` | 없음 | `204`; 데이터는 삭제하지 않고 `isActive=false` |
| 재활성화 | `PATCH /api/accounts/{accountId}` | `{ "isActive": true }` | `200`; 활성 계좌가 없으면 기본 자동 지정 |
| 기본 지정 | `PATCH /api/accounts/{accountId}` | `{ "isDefault": true }` | `200`; 이전 기본은 자동 해제 |

생성 시 `name`, `brokerName`, `accountNumber`는 필수이고 정규화 후 빈 번호는 `400 INVALID_INPUT`이다. 기존 NULL 번호를 가진 계좌는 번호 보완 전 조회할 수 있고 변경할 때는 번호 입력을 안내한다. 표시 번호에는 하이픈이 있어도 되며 중복 판단은 증권사 비교키와 공백·하이픈을 제거한 정규화 번호를 사용한다. 같은 계좌 ID에 대한 변경은 자기 자신을 중복으로 판정하지 않는다.

첫 활성 계좌는 자동 기본 지정된다. 활성 계좌가 있으면 항상 하나만 기본이다. 기본 계좌에 `isDefault:false`만 보내면 `409 DEFAULT_ACCOUNT_REQUIRED`; 다른 계좌에 `isDefault:true`를 보내면 같은 트랜잭션에서 기존 기본을 해제한다. 기본 비활성화 시 남은 활성 계좌 중 표시 순서→ID 첫 계좌를 기본 지정한다. 마지막 계좌 비활성화는 허용하며 기본이 없어지고 계좌 의존 API 요청을 중단한다. 비활성 계좌는 `PATCH`의 `isActive:true`로 재활성화할 수 있고 활성 계좌가 없으면 그 계좌를 기본 지정한다. 비활성 계좌와 같은 증권사·번호로 새 계좌를 만들 수 없다.

```json
{
  "error": {
    "code": "ACCOUNT_ALREADY_EXISTS",
    "message": "이미 등록된 증권사와 계좌번호입니다."
  }
}
```

| HTTP | 코드 | 상황 |
|---:|---|---|
| 400 | `INVALID_INPUT` | 필수 입력 누락, 번호 정규화 후 빈 값, 잘못된 ID |
| 404 | `ACCOUNT_NOT_FOUND` | 없는 ID·비활성 계좌에 대한 일반 변경 또는 계좌 의존 요청(재활성화 요청 제외) |
| 409 | `ACCOUNT_ALREADY_EXISTS` | 증권사+정규화 번호 중복, DB UNIQUE 충돌 포함 |
| 409 | `DEFAULT_ACCOUNT_REQUIRED` | 기본 계좌를 단독으로 해제하려는 요청 |
| 409 | `ACCOUNT_ALREADY_INACTIVE` | 이미 비활성화된 계좌 재비활성화 |

현재 구현 상태(2026-09-28): `GET /accounts`와 `POST /accounts`만 구현되어 있다. 현재 `POST`는 계좌번호를 선택사항으로 받으며 `isDefault`를 지원하지 않는다. 위 v0.2의 번호 필수화·기본 계좌·중복 제약·변경/비활성화는 **구현 목표**이며 배포 API에 반영되기 전 프론트가 완료로 표시하지 않는다.
