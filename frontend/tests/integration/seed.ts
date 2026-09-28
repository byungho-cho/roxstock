import { Prisma } from '../../../backend/src/generated/prisma/index.js';
import { prisma } from '../../../backend/src/lib/prisma.js';

// This script runs only against the disposable MariaDB service in CI.
const security = await prisma.security.upsert({
  where: { marketType_symbol: { marketType: 'KOSPI', symbol: '099999' } },
  create: { symbol: '099999', name: '통합테스트종목', marketType: 'KOSPI', securityType: 'STOCK' },
  update: { isActive: true },
});
await prisma.marketPrice.upsert({
  where: { securityId: security.id },
  create: { securityId: security.id, currentPrice: new Prisma.Decimal(1200), previousClosePrice: new Prisma.Decimal(1000), priceUpdatedAt: new Date() },
  update: { currentPrice: new Prisma.Decimal(1200), previousClosePrice: new Prisma.Decimal(1000), priceUpdatedAt: new Date() },
});
// No marketPrice row: verify that API mode displays the missing-price state.
await prisma.security.upsert({
  where: { marketType_symbol: { marketType: 'KOSPI', symbol: '099998' } },
  create: { symbol: '099998', name: '시세없는테스트종목', marketType: 'KOSPI', securityType: 'STOCK' },
  update: { isActive: true },
});
await prisma.$disconnect();
