# RoxStock 종목 API 명세

- 버전: v0.1
- 기준일: 2026-09-28
- Base URL: `/api`
- ID와 금액은 JavaScript 정밀도 손실 방지를 위해 문자열로 전달합니다.
- 성공 응답은 `{ "data": ... }`, 실패 응답은 `{ "error": { "code", "message" } }` 형식입니다.

## 공통 타입

```ts
type MarketType = 'KOSPI' | 'KOSDAQ' | 'KONEX' | 'OTHER';
type SecurityType = 'STOCK' | 'ETF' | 'ETN' | 'REIT' | 'OTHER';
type ListType = 'WATCHLIST' | 'HOLDING' | 'RECOMMENDED';

interface SecurityItem {
  id: string;
  symbol: string;
  name: string;
  marketType: MarketType;
  securityType: SecurityType;
  listType: ListType | null;
  watchlistItemId: string | null;
  targetBuyPrice: string | null;
  priority: number | null;
  memo: string | null;
  currentPrice: string | null;
  previousClosePrice: string | null;
  priceUpdatedAt: string | null;
}
```

## 종목 검색 및 목록

### `GET /api/securities`

활성 종목을 검색하거나 관심·보유·추천 목록을 조회합니다.

| Query | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `query` | string | 아니요 | 종목명 또는 종목코드 부분 검색. `A005930` 입력도 지원 |
| `marketType` | MarketType | 아니요 | 시장 필터 |
| `listType` | ListType | 아니요 | 관심·보유·추천 분류 필터 |
| `excludeRegistered` | boolean | 아니요 | `true`이면 이미 분류된 종목 제외 |
| `limit` | integer | 아니요 | 최대 100, 검색 화면 권장값 20 |
| `offset` | integer | 아니요 | 시작 위치 |

기존 호출과의 호환성을 위해 `limit`과 `offset`을 모두 생략하면 조건에 맞는 전체 목록을 반환합니다. 종목 추가 검색 화면에서는 반드시 페이지 값을 지정합니다.

```http
GET /api/securities?query=삼성&marketType=KOSPI&excludeRegistered=true&limit=20&offset=0
```

```json
{
  "data": [
    {
      "id": "123",
      "symbol": "005930",
      "name": "삼성전자",
      "marketType": "KOSPI",
      "securityType": "STOCK",
      "listType": null,
      "watchlistItemId": null,
      "targetBuyPrice": null,
      "priority": null,
      "memo": null,
      "currentPrice": null,
      "previousClosePrice": null,
      "priceUpdatedAt": null
    }
  ],
  "meta": { "total": 1, "limit": 20, "offset": 0 }
}
```

목록 탭 호출 예시:

```http
GET /api/securities?listType=WATCHLIST
GET /api/securities?listType=HOLDING
GET /api/securities?listType=RECOMMENDED
```

## 관심·추천 종목 등록

### `POST /api/watchlist-items`

```json
{
  "securityId": "123",
  "listType": "WATCHLIST",
  "targetBuyPrice": "70000",
  "priority": 0,
  "memo": "분할 매수 검토"
}
```

- `listType`은 `WATCHLIST` 또는 `RECOMMENDED`만 허용합니다.
- `targetBuyPrice`는 0 이상의 문자열 또는 `null`입니다.
- `priority`는 0~65535 정수이며 생략 시 0입니다.
- `memo`는 최대 500자입니다.
- 같은 종목이 이미 분류되어 있으면 중복 등록하지 않고 `409`를 반환합니다.
- `HOLDING`은 이 API에서 직접 등록하지 않습니다. 매수 거래 생성 시 자동 적용됩니다.

성공: `201 Created`, 응답 `data`는 `SecurityItem`입니다.

## 관심·추천 분류 수정

### `PATCH /api/watchlist-items/:id`

`:id`는 `watchlistItemId`입니다. 전달한 필드만 변경합니다.

```json
{
  "listType": "RECOMMENDED",
  "targetBuyPrice": null,
  "priority": 10,
  "memo": "추천 분류로 변경"
}
```

- `securityId`는 변경할 수 없습니다.
- `HOLDING` 항목은 수동 수정할 수 없습니다.
- 성공 응답 `data`는 변경된 `SecurityItem`입니다.

## 관심·추천 종목 삭제

### `DELETE /api/watchlist-items/:id`

- 성공: `204 No Content`
- `HOLDING` 항목은 삭제할 수 없습니다. 매도 처리로 잔여수량이 0이 되면 거래 규칙에 따라 보유 상태가 해제됩니다.

## 오류 코드

| HTTP | 코드 | 의미 |
|---:|---|---|
| 400 | `INVALID_INPUT` | 쿼리 또는 필드 형식 오류 |
| 400 | `INVALID_LIST_TYPE` | 관심·추천 이외 분류를 직접 지정 |
| 400 | `IMMUTABLE_FIELD` | 수정할 수 없는 `securityId` 변경 시도 |
| 404 | `SECURITY_NOT_FOUND` | 활성 종목을 찾을 수 없음 |
| 404 | `WATCHLIST_ITEM_NOT_FOUND` | 분류 항목을 찾을 수 없음 |
| 409 | `WATCHLIST_ITEM_ALREADY_EXISTS` | 이미 관심 또는 추천으로 등록됨 |
| 409 | `HOLDING_MANAGED_BY_TRADES` | 보유 상태를 수동 변경·삭제하려 함 |
| 500 | `INTERNAL_SERVER_ERROR` | 처리되지 않은 서버 오류 |

```json
{
  "error": {
    "code": "WATCHLIST_ITEM_ALREADY_EXISTS",
    "message": "The security is already registered."
  }
}
```

## 프론트엔드 연동 규칙

1. 종목 추가 팝업은 `excludeRegistered=true&limit=20`으로 검색합니다.
2. 검색어 입력은 디바운스한 뒤 `query`로 전달합니다.
3. 관심/추천 등록 후 해당 탭을 다시 조회하거나 응답의 `SecurityItem`을 로컬 목록에 반영합니다.
4. 분류 변경과 삭제에는 `securityId`가 아니라 `watchlistItemId`를 사용합니다.
5. `currentPrice`가 `null`이어도 종목 검색과 관심·추천 등록은 허용합니다.
6. 보유 탭은 `listType=HOLDING`으로 조회하며 보유 여부를 프론트에서 임의 수정하지 않습니다.
