# 예수금 내역·요약 API v0.1

기준 시간대는 `Asia/Seoul`이며 금액은 정밀도 손실을 막기 위해 문자열로 응답합니다.

## 예수금 변동 내역

`GET /api/accounts/{accountId}/cash-transactions`

선택 쿼리:

- `from`, `to`: `YYYY-MM-DD`, 양 끝 날짜 포함
- `types`: `BUY,SELL,DEPOSIT,WITHDRAWAL,DIVIDEND` 중 쉼표 구분
- `limit`: 기본 20, 최대 100
- `offset`: 기본 0

응답의 `data`는 거래일시와 ID의 역순입니다. `signedAmount`는 실제 잔액 증감액으로 매수는 `-(amount + feeTaxAmount)`, 매도는 `amount - feeTaxAmount`입니다. `summary`는 전체 필터 결과 기준이며 현재 페이지에만 한정되지 않습니다.

```json
{
  "data": [{
    "id": "31",
    "transactionType": "SELL",
    "transactionDate": "2026-09-28T05:30:00.000Z",
    "amount": "520000",
    "feeTaxAmount": "1040",
    "signedAmount": "518960",
    "balanceAfter": "3518960",
    "memo": null,
    "createdAt": "2026-09-28T05:30:01.000Z",
    "updatedAt": "2026-09-28T05:30:01.000Z"
  }],
  "summary": {
    "buy": "1150000", "sell": "520000", "deposit": "3000000",
    "withdrawal": "0", "dividend": "0", "netChange": "2368960"
  },
  "meta": { "accountId": "1", "count": 1, "total": 3, "limit": 20, "offset": 0, "timezone": "Asia/Seoul" }
}
```

## 예수금 화면 요약

`GET /api/accounts/{accountId}/cash-overview?year=2026&month=9&limit=10`

- `year`, `month`: 생략 시 한국 시간 현재 연월
- `limit`: 최근 변동 건수, 기본 10, 최대 100
- `account.currentBalance`: 계좌의 현재 예수금
- `monthly`: 선택 월의 입금·출금 합계
- `yearly`: 선택 연도의 입금·출금·배당 합계
- `recentTransactions`: 유형과 관계없는 최신 변동

월간 요약은 입금·출금만, 연간 요약은 입금·출금·배당만 집계합니다. 따라서 각 요약의 매수·매도 값은 항상 `0`입니다. 거래 수정·삭제로 과거 스냅샷을 자동 재계산하지 않는 기존 확정 규칙은 유지됩니다.

## 오류

| HTTP | 코드 | 조건 |
|---|---|---|
| 400 | `INVALID_INPUT` | 날짜, 유형, 연월, 페이지 값 오류 |
| 404 | `ACCOUNT_NOT_FOUND` | 활성 계좌가 없음 |
