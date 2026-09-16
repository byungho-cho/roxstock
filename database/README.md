# Database

MariaDB 스키마, 마이그레이션 및 초기 데이터 관련 파일을 관리합니다.

## Prisma

- 스키마: `prisma/schema.prisma`
- 데이터베이스 공급자: `mysql` (MariaDB 호환)
- 연결 문자열: `DATABASE_URL`

```bash
npx prisma format --schema database/prisma/schema.prisma
npx prisma validate --schema database/prisma/schema.prisma
```

## 애플리케이션 검증 규칙

Prisma 스키마만으로 표현하기 어려운 아래 규칙은 API 서비스와 테스트에서 검증합니다.

- 매수·매도 수량과 단가는 0보다 커야 합니다.
- 한 매도는 반드시 하나의 매수 Lot에만 연결합니다.
- 한 매수 Lot은 여러 번 나누어 매도할 수 있지만, 누적 매도 수량은 매수 수량을 넘을 수 없습니다.
- 매도가 연결된 매수 건을 삭제할 때는 사용자 확인 후 해당 매도와 매수를 하나의 트랜잭션으로 삭제합니다.
- 매수·매도·배당 입력 시 예수금은 최초 입력 시점에만 반영하고 이후 거래 수정·삭제와 자동으로 재연동하지 않습니다.
- 거래비용은 `cash_transactions.fee_tax_amount`에 수수료와 세금을 합산해 저장합니다.
- 현재 예수금은 `accounts.cash_balance`, 변동 시점의 잔액은 `cash_transactions.balance_after`에 저장합니다.
- 수집하지 못한 현재가는 `market_prices`에서 사용자가 직접 입력하거나 수정할 수 있습니다.
- 복리 목표의 연간 적립금은 첫해부터 반영합니다.

