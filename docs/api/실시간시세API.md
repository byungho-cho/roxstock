# 실시간 시세 API · 현행 2026.11.01

원본: `backend/src/routes/live-quotes.ts`, `backend/src/realtime/kis-live.ts`, `shared/src/domain/live-quotes.ts`. [현행 화면·저장 정책](../current-state-20261101.md).

## 신규 실시간 화면 계약 · v1.2.54

모든 경로는 로그인 사용자 범위다. 계좌를 지정할 때 소유권을 검증하며 쓰기는 기존 CSRF 정책을 따른다.

| 메서드·경로 | 입력·응답·동작 |
|---|---|
| GET `/api/live-quotes/list` | 선택 `accountId`. `data: {ids, version, stocks}`. 종목별 보유/관심/거래·평가 및 기존 KRX 초기값 포함 |
| GET `/api/live-quotes/candidates` | `accountId`, `q`, `tab=search/holding/watch/trade`, `cursor`. 100개씩 후보와 `hasMore`, `nextCursor` 반환 |
| PUT `/api/live-quotes/list` | `{ids: string[], version: string}`. 종목 ID 순서를 일괄 저장, 버전 불일치 409 `LIST_CONFLICT`. 사용자 설정의 다른 값 보존 |
| GET `/api/live-quotes/stream` | `market`, `symbols`. 등록한 종목만 허용. SSE `quotes` 이벤트, 약 1000ms 반영, 변경 없으면 heartbeat, 재연결 안내 3000ms, 세션 재확인 15000ms |

시장 TOTAL/NXT/KRX를 분리한다. 표시 최대 50과 KIS 공유 실제 구독 41을 구분한다. 별도 틱 테이블·주기 DB 쓰기는 없다. 서버 수신 공유와 브라우저 SSE를 구분하고 연결 종료 시 구독을 반환한다. 초기 KRX 저장값의 통합 참고 표시는 시장 출처·원래 시각을 유지하며 NXT에 대입하지 않는다.

## 기존 평가·주기 수집 API 기록

이하 `/api/prices` 및 내부 수집 계약은 기존 수집 경로다. 60초·100종목·세션 시간은 신규 `/live-quotes`의 구독 한도나 한투 최신 정책 설명이 아니다. 기존 세부 기록은 코드와 대조해 사용한다.

## 1. 공통 기준

- 외부 공개 경로는 `/api` 접두사를 사용합니다.
- 종목코드는 `A` 접두사 없이 6자리 문자열로 반환합니다.
- 가격은 부동소수점 오차를 피하기 위해 문자열로 반환합니다.
- `observedAt`은 공급자가 제공한 거래시각을 ISO 8601로 반환합니다.
- 보유·관심·추천 종목은 합쳐서 최대 100개까지 처리합니다.
- 기본 장중 수집주기는 60초이며, 각 정상 수집 결과를 DB에도 반영합니다.
- 수집 세션은 Asia/Seoul 기준 NXT 프리마켓 08:00~08:50, KRX 정규장 09:00~15:30, NXT 애프터마켓 15:40~20:00입니다.
- `marketStatus`는 NXT 가격일 때 `NXT_PRE_MARKET` 또는 `NXT_AFTER_MARKET`을 반환합니다.

## 2. 최신 가격 조회

```http
GET /api/prices/latest?symbols=005930,005380
```

`symbols`를 생략하면 현재 보유·관심·추천 종목의 최신 가격을 반환합니다. 지정할 때는 최대 100개의 6자리 종목코드를 쉼표로 구분합니다.

```json
{
  "data": [
    {
      "securityId": "1",
      "symbol": "005930",
      "name": "삼성전자",
      "currentPrice": "70000",
      "previousClosePrice": "69000",
      "observedAt": "2026-09-28T01:00:10.000Z",
      "marketStatus": "OPEN"
    }
  ],
  "meta": {
    "realtime": true
  }
}
```

API 메모리 캐시와 DB 가격을 합친 뒤 `observedAt`이 더 최신인 값을 반환합니다. API가 재시작되어 캐시가 비어도 DB의 마지막 정상 가격을 반환합니다.

## 3. 실시간 가격 스트림

```http
GET /api/prices/stream?symbols=005930,005380
Accept: text/event-stream
```

연결 직후 `snapshot` 이벤트로 현재 가격 묶음을 보내고 이후 변경은 `prices` 이벤트로 전송합니다. 15초마다 heartbeat 주석을 보내며 재연결 권장 간격은 5초입니다.

```text
retry: 5000

event: snapshot
data: {"prices":[...]}

event: prices
data: {"prices":[...]}
```

React에서는 화면마다 연결을 만들지 않고 애플리케이션 공통 `EventSource` 하나를 공유합니다. SSE 연결 오류 시 `/api/prices/latest`를 10초 간격으로 조회하고 SSE 재연결 성공 시 폴링을 중지합니다.

## 4. 내부 수집기 전달

```http
POST /internal/realtime-prices
Authorization: Bearer {COLLECTOR_INTERNAL_TOKEN}
Content-Type: application/json
```

이 경로는 Docker 내부의 `realtime-collector`만 사용하며 Caddy 외부 공개 대상에 포함하지 않습니다. 토큰이 없거나 다르면 `401`을 반환합니다.

```json
{
  "prices": [
    {
      "securityId": "1",
      "symbol": "005930",
      "name": "삼성전자",
      "currentPrice": "70000",
      "previousClosePrice": "69000",
      "observedAt": "2026-09-28T01:00:10.000Z",
      "marketStatus": "OPEN"
    }
  ]
}
```

정상 응답:

```json
{
  "data": {
    "accepted": 1
  }
}
```

가격이 0이거나 형식이 잘못되었거나 현재 캐시보다 오래된 응답은 승인 건수에서 제외합니다.

## 5. 프론트엔드 표시 기준

- `currentPrice > previousClosePrice`: 상승색(적색)
- `currentPrice < previousClosePrice`: 하락색(청색)
- 동일: 보합색(흰색)
- `observedAt`을 마지막 시세 갱신시각으로 표시합니다.
- 스트림이 끊겨도 마지막 정상 가격을 0원이나 빈 값으로 바꾸지 않습니다.
