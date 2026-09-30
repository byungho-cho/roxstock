import { expect, test } from '@playwright/test';
import { Prisma } from '../../../backend/src/generated/prisma/index.js';
import { prisma } from '../../../backend/src/lib/prisma.js';

test('stock screens use persisted analysis, category, and price data', async ({ page, request }) => {
  const symbol = String(100000 + Math.floor(Math.random() * 800000));
  const created = await request.post('/api/securities', { data: { symbol, name: '화면검증종목', marketType: 'OTHER', listType: 'WATCHLIST' } });
  expect(created.status()).toBe(201);
  const stock = (await created.json()).data;
  const id = stock.id as string;
  const saved = await request.patch(`/api/securities/${id}/analysis`, { data: {
    operatingProfit: '3000000000000', controllingProfit: '2500000000000',
    issuedShares: '100000000', treasuryShares: '1000000',
    assets: '50000000000000', liabilities: '20000000000000',
    equity: '30000000000000', previousEquity: '28000000000000',
    dividend: '5000', memo: '실제 저장된 메모',
  } });
  expect(saved.ok()).toBeTruthy();
  const priced = await request.patch(`/api/securities/${id}/price`, { data: { currentPrice: '10000' } });
  expect(priced.ok()).toBeTruthy();
  const analysis = (await (await request.get(`/api/securities/${id}/analysis`)).json()).data;
  expect(analysis.fundamentals.issuedShares).toBe('100000000');
  expect(analysis.statements[0].operatingProfit).toBe('3000000000000');
  expect(Number(analysis.valuation.bps)).toBeGreaterThan(300000);
  expect(Number(analysis.valuation.roe)).toBeGreaterThan(8);
  const account = await request.post('/api/accounts', { data: { name: `종목 화면 검증 ${Date.now()}`, brokerName: 'CI' } });
  expect(account.status()).toBe(201);
  const accountId: string = (await account.json()).data.id;
  await page.setViewportSize({ width: 400, height: 640 });
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('roxstock-selected-account-id', value), accountId);
  await page.goto(`/stocks/${id}`);
  await expect(page.getByText('실제 저장된 메모')).toBeVisible();
  await page.getByRole('button', { name: '현재가 수정' }).click();
  await page.getByRole('textbox', { name: '변경할 현재가' }).fill('12000');
  await page.getByRole('button', { name: '변경', exact: true }).click();
  await expect(page.getByText('12,000원').first()).toBeVisible();
  expect((await (await request.get(`/api/securities/${id}/analysis`)).json()).data.security.currentPrice).toBe('12000');
  await page.getByRole('button', { name: '재무지표' }).click();
  await expect(page.getByText('영업이익')).toBeVisible();
  await page.getByRole('button', { name: '연간 ↕' }).click();
  await expect(page.getByText('등록된 분기 재무 데이터가 없습니다.')).toBeVisible();
  await page.goto(`/stocks/${id}/edit`);
  await expect(page.getByRole('textbox', { name: '발행주식수' })).toHaveValue('100000000');
  await page.getByRole('textbox', { name: '메모' }).fill('변경된 메모');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('변경된 메모')).toBeVisible();
  await page.getByRole('button', { name: '관심종목 ›' }).click();
  await page.getByRole('button', { name: '추천종목' }).click();
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page).toHaveURL(/stocks\?tab=recommended/);
  expect((await (await request.get(`/api/securities/${id}/analysis`)).json()).data.security.listType).toBe('RECOMMENDED');
  await page.setViewportSize({ width: 816, height: 616 });
  await page.goto('/stocks?tab=recommended');
  await page.getByRole('button', { name: '화면검증종목 상세보기' }).click();
  await expect(page.getByRole('button', { name: '전체 상세보기 ›' })).toBeVisible();
  await page.getByRole('button', { name: '표로 돌아가기' }).click();
  await expect(page.getByRole('table', { name: '추천종목' })).toBeVisible();
});

test('viewport panel is opt-in, updates on resize, and does not expand the document', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 640 });
  await page.goto('/journal');
  const panel = page.getByRole('complementary', { name: '뷰포트 측정값' });
  await expect(panel).toHaveCount(0);
  const normalSize = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
  await page.goto('/journal?viewport=1');
  await expect(panel).toContainText('400 × 640');
  await expect(panel).toContainText('visualViewport scale');
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual(normalSize);
  await page.setViewportSize({ width: 816, height: 616 });
  await expect(panel).toContainText('816 × 616');
  await page.goto('/journal?viewport=0');
  await expect(panel).toHaveCount(0);
});

test('trade details: edit sell and confirm cascading buy deletion without cash recalculation', async ({ page, request }) => {
  const accountResponse = await request.post('/api/accounts', { data: { name: `거래 수정 ${Date.now()}`, brokerName: 'CI' } });
  expect(accountResponse.status()).toBe(201);
  const accountId: string = (await accountResponse.json()).data.id;
  const securities = await (await request.get('/api/securities?query=099999&limit=20')).json();
  const securityId: string = securities.data[0].id;
  const at = new Date().toISOString();
  await request.post('/api/cash-transactions', { data: { accountId, transactionType: 'DEPOSIT', transactionDate: at, amount: '20000' } });
  const buy = await (await request.post('/api/buy-trades', { data: { accountId, securityId, boughtAt: at, quantity: '2', unitPrice: '1000', feeTaxAmount: '0' } })).json();
  const sell = await (await request.post('/api/sell-trades', { data: { buyTradeId: buy.data.id, soldAt: at, quantity: '1', unitPrice: '1500', feeTaxAmount: '0' } })).json();
  await page.goto('/');
  await page.evaluate((id) => localStorage.setItem('roxstock-selected-account-id', id), accountId);
  for (const [width, height] of [[400, 640], [725, 396]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/trade?type=sell&edit=${sell.data.id}&stock=${securityId}&return=journal`);
    await expect(page.getByText('연결 매수 Lot')).toBeVisible();
    await expect(page.getByText('수정과 삭제는 현재 예수금')).toBeVisible();
    await page.getByRole('textbox', { name: '단가' }).fill('1600');
    await page.getByRole('button', { name: '수정', exact: true }).click();
    await expect(page).toHaveURL(/journal/);
    expect(Number((await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data.cashBalance)).toBe(19500);
  }
  const sellDetail = await (await request.get(`/api/sell-trades/${sell.data.id}`)).json();
  expect(sellDetail.data.unitPrice).toBe('1600');
  await page.goto(`/trade?type=buy&edit=${buy.data.id}&stock=${securityId}&return=journal`);
  await expect(page.getByText('매도 1건이 연결되어 있습니다.')).toBeVisible();
  await page.getByRole('button', { name: '삭제' }).first().click();
  await expect(page.getByText('연결된 매도 1건도 함께 삭제됩니다.')).toBeVisible();
  await page.getByRole('button', { name: '삭제' }).last().click();
  await expect(page).toHaveURL(/journal/);
  // The route changes while deletion is in flight; wait for the API commit.
  await expect.poll(async () => {
    const report = await (await request.get(`/api/accounts/${accountId}/trades`)).json();
    return report.data.length;
  }).toBe(0);
  expect(Number((await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data.cashBalance)).toBe(19500);
});

test('isolated account: dashboard → stocks → journal → cash/buy/sell/withdrawal', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const accountResponse = await request.post('/api/accounts', { data: { name: '프론트 통합테스트 전용', brokerName: 'CI' } });
  expect(accountResponse.status()).toBe(201);
  const accountId: string = (await accountResponse.json()).data.id;
  const securityResponse = await request.get('/api/securities?query=099999&limit=20&offset=0');
  expect(securityResponse.ok()).toBeTruthy();
  const securityId: string = (await securityResponse.json()).data[0].id;

  await page.goto('/');
  await page.evaluate((id) => localStorage.setItem('roxstock-selected-account-id', id), accountId);
  await page.reload();
  await expect(page.getByText('보유종목이 없습니다.')).toBeVisible();
  await expect(page.getByText('데이터 없음', { exact: true })).toBeVisible();
  await expect(page.getByText('과거 자산 추이 데이터가 없습니다.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('01-empty-dashboard.png') });
  await page.getByText('평가자산', { exact: true }).first().click();
  await expect(page).toHaveURL(/detail\/assets/);
  await expect(page.getByText('자산구성', { exact: true })).toBeVisible();
  await expect(page.getByText('표시할 자산 데이터가 없습니다.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('01-empty-assets.png') });

  await page.goto('/stocks?tab=holding');
  await expect(page.getByText('보유중 0')).toBeVisible();
  await expect(page.getByText('표시할 종목이 없습니다.')).toBeVisible();
  await page.setViewportSize({ width: 400, height: 640 });
  await expect(page.getByText('표시할 종목이 없어요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '목 데이터 다시 보기' })).toHaveCount(0);
  await page.setViewportSize({ width: 816, height: 616 });
  await page.goto('/journal');
  await expect(page.getByText('총 0건')).toBeVisible();

  await page.goto('/detail/cash');
  await page.getByRole('button', { name: '예수금 등록' }).click();
  await page.getByRole('textbox', { name: '금액' }).fill('20000');
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByText('20,000원', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('최근 변경')).toBeVisible();
  await page.getByRole('button', { name: '월간 연간 전환' }).click();
  await expect(page.getByRole('button', { name: '월간 연간 전환' })).toHaveText('연간');
  await page.getByRole('button', { name: '월간 연간 전환' }).click();
  await page.setViewportSize({ width: 370, height: 465 });
  await page.screenshot({ path: testInfo.outputPath('120-cash-api-370x465.png') });
  await page.setViewportSize({ width: 725, height: 396 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('120-cash-api-725x396.png') });
  await page.setViewportSize({ width: 816, height: 616 });
  const missingBaseline = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(missingBaseline.dailyProfit).toBeNull();
  expect(missingBaseline.dailyProfitRate).toBeNull();
  expect(missingBaseline.stockMonthlyProfit).toBeNull();
  expect(missingBaseline.cashMonthlyProfit).toBeNull();
  expect(missingBaseline.performanceMeta.dailyProfitUnavailableReason).toBe('PREVIOUS_DAY_SNAPSHOT_MISSING');
  const previousDay = new Date(`${new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}T00:00:00.000Z`);
  await prisma.dailyAccountSnapshot.create({ data: { accountId: BigInt(accountId), snapshotDate: previousDay, cashBalance: new Prisma.Decimal(10_000), stockValue: new Prisma.Decimal(0), totalAssetValue: new Prisma.Decimal(10_000) } });
  const withBaseline = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(Number(withBaseline.dailyProfit)).toBe(-10_000);
  expect(Number(withBaseline.dailyProfitRate)).toBe(-100);
  expect(withBaseline.stockMonthlyProfit).toBeNull();
  expect(withBaseline.cashMonthlyProfit).toBeNull();
  await page.setViewportSize({ width: 370, height: 465 });
  await page.goto('/detail/assets');
  await expect(page.getByText('-10,000원').first()).toBeVisible();
  await expect(page.getByText('-100.0%').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('110-daily-performance-370x465.png') });
  for (const [width, height] of [[400, 640], [725, 396], [816, 616]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByText('-10,000원').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`110-daily-performance-${width}x${height}.png`) });
  }
  const secondAccountResponse = await request.post('/api/accounts', { data: { name: '손익 격리 계좌', brokerName: 'CI' } });
  expect(secondAccountResponse.status()).toBe(201);
  const secondAccountId: string = (await secondAccountResponse.json()).data.id;
  await page.evaluate((id) => { localStorage.setItem('roxstock-selected-account-id', id); }, secondAccountId);
  await page.reload();
  await expect(page.getByText('-10,000원')).toHaveCount(0);
  await expect(page.getByText('-100.0%')).toHaveCount(0);
  await page.evaluate((id) => { localStorage.setItem('roxstock-selected-account-id', id); }, accountId);
  await page.reload();
  await expect(page.getByText('-10,000원').first()).toBeVisible();
  const cashAfterDeposit = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(Number(cashAfterDeposit.cashBalance)).toBe(20_000);

  await page.goto(`/trade?type=buy&stock=${securityId}`);
  await expect(page.getByText('통합테스트종목').filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('textbox', { name: '매수수량' }).fill('2');
  await page.getByRole('textbox', { name: '매수가격' }).fill('1000');
  await page.getByRole('button', { name: '매수', exact: true }).click();
  await expect(page).toHaveURL(/stocks\?tab=holding/);
  await expect(page.getByText('통합테스트종목').filter({ visible: true }).first()).toBeVisible();
  const lotsBeforeSell = (await (await request.get(`/api/accounts/${accountId}/buy-lots?securityId=${securityId}`)).json()).data;
  expect(lotsBeforeSell).toHaveLength(1);
  expect(Number(lotsBeforeSell[0].remainingQuantity)).toBe(2);
  const afterBuy = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(Number(afterBuy.cashBalance)).toBe(18_000);
  expect(Number(afterBuy.totalAssetValue)).toBe(20_400);
  await page.goto('/');
  await expect(page.getByText('20,400원')).toBeVisible();
  await expect(page.getByText('18,000원')).toBeVisible();
  await page.goto('/detail/assets');
  await expect(page.getByText('20,400원')).toBeVisible();
  await expect(page.getByText('2,400원').first()).toBeVisible();
  await expect(page.getByText('400원', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '주식 11.8%, 예수금 88.2%' })).toBeVisible();
  await expect(page.getByRole('img', { name: '종목별 자산 구성 도넛' }).getByText('2,400원')).toBeVisible();
  await expect(page.getByText('통합테스트종목').first()).toBeVisible();
  await expect(page.getByText('현대자동차')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('02-after-buy-assets.png') });
  await page.setViewportSize({ width: 370, height: 465 });
  await page.screenshot({ path: testInfo.outputPath('02-after-buy-assets-370x465.png') });
  await page.setViewportSize({ width: 725, height: 396 });
  await page.screenshot({ path: testInfo.outputPath('02-after-buy-assets-725x396.png') });
  await page.setViewportSize({ width: 816, height: 616 });
  await page.goto('/journal');
  await expect(page.getByText('총 1건')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-after-buy-journal.png') });

  await page.goto(`/trade?type=sell&stock=${securityId}&lot=${lotsBeforeSell[0].id}`);
  await page.getByRole('textbox', { name: '매도수량' }).fill('1');
  await page.getByRole('textbox', { name: '매도가격' }).fill('1500');
  await page.getByRole('button', { name: '매도', exact: true }).click();
  await expect(page).toHaveURL(/stocks\?tab=holding/);
  const afterSell = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(Number(afterSell.cashBalance)).toBe(19_500);
  expect(Number(afterSell.holdings[0].quantity)).toBe(1);
  const report = await (await request.get(`/api/accounts/${accountId}/trades`)).json();
  expect(report.data).toHaveLength(2);
  expect(report.data.find((entry: { type: string }) => entry.type === 'SELL').buyTradeId).toBe(lotsBeforeSell[0].id);
  expect(Number(report.summary.realizedProfitLoss)).toBe(500);
  await page.goto('/journal');
  await expect(page.getByText('총 2건')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('03-after-sell-journal.png') });

  await page.goto('/detail/cash');
  await page.getByRole('button', { name: '예수금 등록' }).click();
  await page.getByRole('button', { name: '출금' }).click();
  await page.getByRole('textbox', { name: '금액' }).fill('500');
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByText('19,000원', { exact: true }).first()).toBeVisible();
  const afterWithdrawal = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(Number(afterWithdrawal.cashBalance)).toBe(19_000);
  await page.screenshot({ path: testInfo.outputPath('04-after-withdrawal.png') });

  const unpricedResponse = await request.get('/api/securities?query=099998&limit=20&offset=0');
  const unpricedId: string = (await unpricedResponse.json()).data[0].id;
  await page.goto(`/trade?type=buy&stock=${unpricedId}`);
  await page.getByRole('textbox', { name: '매수수량' }).fill('1');
  await page.getByRole('textbox', { name: '매수가격' }).fill('1000');
  await page.getByRole('button', { name: '매수', exact: true }).click();
  await expect(page).toHaveURL(/stocks\?tab=holding/);
  await expect(page.getByRole('button', { name: '시세없는테스트종목 상세보기' }).getByText('미수집')).toBeVisible();
  const unpricedDashboard = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(unpricedDashboard.pricingComplete).toBe(false);
  expect(unpricedDashboard.totalAssetValue).toBeNull();
  await page.goto('/');
  await expect(page.getByText('가격 미수집 종목이 있어 평가자산을 계산할 수 없습니다.')).toBeVisible();
  await expect(page.getByText('0.0%', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('05-unpriced-holding.png') });
  await page.goto('/detail/assets');
  await expect(page.getByText('가격 미수집 종목이 있어 자산구성을 계산할 수 없습니다.')).toBeVisible();
  await expect(page.getByText('20,400원')).toHaveCount(0);
  await page.goto('/stocks?tab=holding');
  await page.setViewportSize({ width: 400, height: 640 });
  await expect(page.getByText('시세 미수집')).toBeVisible();
  await page.setViewportSize({ width: 816, height: 616 });

  // A failed live request must show an error, never previously rendered or bundled mock figures.
  await page.route('**/api/accounts/*/dashboard', (route) => route.fulfill({ status: 503, body: '{"error":{"message":"temporary failure"}}' }));
  await page.goto('/');
  await expect(page.getByText('대시보드를 불러오지 못했어요.')).toBeVisible();
  await expect(page.getByText('20,400원')).toHaveCount(0);
});

test('170 settings: account API create, update, requery and guarded reset across both viewports', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const unique = `설정 통합 ${Date.now()}`;
  await page.setViewportSize({ width: 400, height: 640 });
  await page.goto('/more');
  await page.screenshot({ path: testInfo.outputPath('170-cover-more.png') });
  await page.getByRole('button', { name: '설정' }).click();
  await page.screenshot({ path: testInfo.outputPath('170-cover-settings.png') });
  await page.getByText('계좌 관리', { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('170-cover-account.png') });
  await page.getByRole('button', { name: /계좌 추가/ }).click();
  await page.screenshot({ path: testInfo.outputPath('170-cover-add.png') });
  await page.getByLabel('계좌명').fill(unique);
  await page.getByLabel('증권사').fill('CI 증권');
  await page.getByLabel('계좌번호').fill('123-789');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.getByText(unique, { exact: true })).toBeVisible();
  const accounts = (await (await request.get('/api/accounts')).json()).data as { id: string; name: string; accountNumber: string }[];
  const created = accounts.find((account) => account.name === unique);
  expect(created?.accountNumber).toBe('123-789');
  await page.getByRole('button', { name: '계좌 정보 수정' }).click();
  await page.getByLabel('계좌명').fill(`${unique} 수정`);
  await page.getByRole('button', { name: '변경', exact: true }).click();
  await expect(page.getByText(`${unique} 수정`, { exact: true })).toBeVisible();
  const changed = (await (await request.get('/api/accounts')).json()).data as { id: string; name: string }[];
  expect(changed.find((account) => account.id === created?.id)?.name).toBe(`${unique} 수정`);
  const deposit = await request.post('/api/cash-transactions', { data: { accountId: created!.id, transactionType: 'DEPOSIT', transactionDate: new Date().toISOString(), amount: '10000', memo: '초기화 검증' } });
  expect(deposit.status()).toBe(201);
  expect(Number((await (await request.get(`/api/accounts/${created!.id}/dashboard`)).json()).data.cashBalance)).toBe(10000);
  await page.getByRole('button', { name: /계좌 데이터 초기화/ }).click();
  await page.getByRole('textbox', { name: '계좌명 입력' }).fill('틀린 계좌명');
  await expect(page.getByRole('button', { name: '계좌 데이터 초기화', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '계좌명 입력' }).fill(`${unique} 수정`);
  await page.screenshot({ path: testInfo.outputPath('170-cover-reset-confirm.png') });
  await page.getByRole('button', { name: '계좌 데이터 초기화', exact: true }).click();
  await expect(page.getByText(/초기화 완료/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('170-cover-reset-success.png') });
  const accountAfterReset = (await (await request.get('/api/accounts')).json()).data as { id: string; cashBalance: string }[];
  expect(accountAfterReset.find((account) => account.id === created!.id)?.cashBalance).toBe('0');
  const reportAfterReset = await (await request.get(`/api/accounts/${created!.id}/trades`)).json();
  expect(reportAfterReset.data).toHaveLength(0);
  const holdingsAfterReset = (await (await request.get(`/api/accounts/${created!.id}/holdings`)).json()).data;
  expect(holdingsAfterReset).toHaveLength(0);
  const cashAfterReset = await (await request.get(`/api/accounts/${created!.id}/cash-transactions`)).json();
  expect(cashAfterReset.data).toHaveLength(0);
  const overviewAfterReset = (await (await request.get(`/api/accounts/${created!.id}/cash-overview`)).json()).data;
  expect(overviewAfterReset.account.currentBalance).toBe('0');
  expect(overviewAfterReset.recentTransactions).toHaveLength(0);
  const historyAfterReset = await (await request.get(`/api/accounts/${created!.id}/asset-history`)).json();
  expect(historyAfterReset.data).toHaveLength(0);
  expect(historyAfterReset.summary.returnRate).toBeNull();
  await page.goto('/detail/cash');
  await expect(page.getByText('예수금 내역이 없습니다.')).toBeVisible();
  await expect(page.getByText('0원', { exact: true }).first()).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('과거 자산 추이 데이터가 없습니다.')).toBeVisible();
  await expect(page.getByText('데이터 없음', { exact: true })).toBeVisible();
  await expect(page.getByText('0.0%', { exact: true })).toHaveCount(0);
  for (const [view, filename] of [['cash', 'cash'], ['collection', 'collection'], ['theme', 'theme']] as const) {
    await page.goto(`/detail/settings?view=${view}`);
    await page.screenshot({ path: testInfo.outputPath(`170-cover-${filename}.png`) });
  }

  await page.setViewportSize({ width: 816, height: 616 });
  for (const [view, filename] of [['/more', 'more'], ['/detail/settings?view=account', 'account'], ['/detail/settings?view=edit', 'edit'], ['/detail/settings?view=cash', 'cash'], ['/detail/settings?view=collection', 'collection'], ['/detail/settings?view=theme', 'theme']] as const) {
    await page.goto(view);
    await page.screenshot({ path: testInfo.outputPath(`170-tablet-${filename}.png`) });
  }
  await page.goto('/detail/settings?view=account');
  await page.getByRole('button', { name: /계좌 데이터 초기화/ }).click();
  await expect(page.getByRole('textbox', { name: '계좌명 입력' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('170-tablet-reset-confirm.png') });
});

test('cash history reveals one calendar month at a time in API mode', async ({ page, request }) => {
  const created = await request.post('/api/accounts', { data: { name: '월별 내역 계좌', brokerName: 'CI' } });
  expect(created.status()).toBe(201);
  const accountId: string = (await created.json()).data.id;
  const current = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const [year, month] = current.slice(0, 7).split('-').map(Number);
  const previousDate = new Date(Date.UTC(year, month - 2, 15)).toISOString().slice(0, 10);
  for (let i = 0; i < 12; i++) {
    const response = await request.post('/api/cash-transactions', { data: {
      accountId, transactionType: 'DEPOSIT',
      transactionDate: new Date(`${i === 0 ? previousDate : current}T12:00:00+09:00`).toISOString(),
      amount: String(i + 1), memo: null,
    } });
    expect(response.status()).toBe(201);
  }
  await page.addInitScript((id) => localStorage.setItem('roxstock-selected-account-id', id), accountId);
  await page.goto('/detail/cash');
  await expect(page.getByText('최근 10개')).toBeVisible();
  await page.route('**/api/accounts/*/cash-overview?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.getByRole('button', { name: '이전 기간' }).click();
  await expect(page.getByText('최근 10개')).toBeVisible();
  await expect(page.getByText('예수금 내역을 불러오는 중입니다.')).toHaveCount(0);
  await page.getByRole('button', { name: '이전 한 달 더보기' }).click();
  await expect(page.getByText('최근 11개')).toBeVisible();
  await page.getByRole('button', { name: '이전 한 달 더보기' }).click();
  await expect(page.getByText('최근 12개')).toBeVisible();
  await expect(page.getByRole('button', { name: '이전 한 달 더보기' })).toHaveCount(0);
});

test('cash period navigation uses adjacent cache and retains card on failed requests', async ({ page, request }) => {
  const created = await request.post('/api/accounts', { data: { name: `예수금 선조회 ${Date.now()}`, brokerName: 'CI' } });
  expect(created.status()).toBe(201);
  const accountId: string = (await created.json()).data.id;
  const current = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const [year, month] = current.slice(0, 7).split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const previousMonth = previous.getUTCMonth() + 1;
  const previousYear = previous.getUTCFullYear();
  const requests: string[] = [];
  const responses: string[] = [];
  await page.route(`**/api/accounts/${accountId}/cash-overview?*`, async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${url.searchParams.get('year')}-${url.searchParams.get('month')}`);
    await route.continue();
  });
  page.on('response', (response) => {
    if (response.url().includes(`/api/accounts/${accountId}/cash-overview?`) && response.ok()) {
      const url = new URL(response.url());
      responses.push(`${url.searchParams.get('year')}-${url.searchParams.get('month')}`);
    }
  });
  await page.addInitScript((id) => localStorage.setItem('roxstock-selected-account-id', id), accountId);
  for (const [width, height] of [[370, 465], [725, 396]]) {
    requests.length = 0;
    responses.length = 0;
    await page.setViewportSize({ width, height });
    await page.goto('/detail/cash');
    await expect.poll(() => responses.includes(`${previousYear}-${previousMonth}`)).toBe(true);
    await page.getByRole('button', { name: '이전 기간' }).click();
    await expect(page.getByText(`${previousYear}년 ${previousMonth}월`)).toBeVisible();
    await expect(page.getByText('최근 변경')).toBeVisible();
    expect(requests.filter((key) => key === `${previousYear}-${previousMonth}`)).toHaveLength(1);
    await page.getByText('최근 변경').evaluate((element) => {
      const start = new Touch({ identifier: 1, target: element, clientX: 220, clientY: 180 });
      const end = new Touch({ identifier: 1, target: element, clientX: 80, clientY: 180 });
      element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start], changedTouches: [start] }));
      element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] }));
    });
    await expect(page.getByText(`${year}년 ${month}월`)).toBeVisible();
  }
  await page.unrouteAll({ behavior: 'wait' });
});

test('journal and stock detail keep their frames during slow and rapid API navigation', async ({ page, request }) => {
  const accountResponse = await request.post('/api/accounts', { data: { name: `조회 상태 ${Date.now()}`, brokerName: 'CI' } });
  expect(accountResponse.status()).toBe(201);
  const accountId: string = (await accountResponse.json()).data.id;
  const securities = (await (await request.get('/api/securities?query=099999&limit=20')).json()).data;
  const securityId: string = securities[0].id;
  const current = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  await request.post('/api/cash-transactions', { data: { accountId, transactionType: 'DEPOSIT', transactionDate: `${current}T03:00:00.000Z`, amount: '10000' } });
  const buy = await request.post('/api/buy-trades', { data: { accountId, securityId, boughtAt: `${current}T03:00:00.000Z`, quantity: '2', unitPrice: '1000', feeTaxAmount: '0' } });
  expect(buy.status()).toBe(201);
  await page.addInitScript((id) => localStorage.setItem('roxstock-selected-account-id', id), accountId);
  for (const [width, height] of [[370, 465], [725, 396]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/journal');
    await expect(page.getByRole('button', { name: '이전 달' })).toBeVisible();
    await page.route(`**/api/accounts/${accountId}/trades?*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.continue();
    });
    await page.getByRole('button', { name: '이전 달' }).click();
    await page.getByRole('button', { name: '이전 달' }).click();
    await expect(page.getByLabel(/거래 달력/)).toBeVisible();
    await expect(page.getByText('거래내역을 불러오는 중입니다.')).toBeVisible();
    await page.getByRole('button', { name: '다음 달' }).click();
    await expect(page.getByLabel(/거래 달력/)).toBeVisible();
    await expect(page.getByText('거래내역을 불러오는 중입니다.')).toHaveCount(0);
    await page.goto(`/stocks/${securityId}`);
    await expect(page.getByRole('heading', { name: '통합테스트종목' })).toBeVisible();
    await page.getByRole('tab', { name: '거래내역' }).click();
    await expect(page.getByText('2주 × 1,000원')).toBeVisible();
    await page.unrouteAll({ behavior: 'wait' });
  }
  const secondResponse = await request.post('/api/accounts', { data: { name: `다른 계좌 ${Date.now()}`, brokerName: 'CI' } });
  expect(secondResponse.status()).toBe(201);
  const secondId: string = (await secondResponse.json()).data.id;
  await request.post('/api/cash-transactions', { data: { accountId: secondId, transactionType: 'DEPOSIT', transactionDate: `${current}T03:00:00.000Z`, amount: '7777' } });
  await page.goto('/detail/settings?view=account');
  await page.getByRole('button', { name: /다른 계좌/ }).click();
  await page.getByRole('button', { name: '예수금', exact: true }).click();
  await expect(page.getByText('7,777원', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('8,000원', { exact: true })).toHaveCount(0);
});

test('adjacent journal months are fetched once, shown from cache, and isolated by account', async ({ page, request }) => {
  test.setTimeout(120_000);
  const createAccount = async (name: string) => {
    const response = await request.post('/api/accounts', { data: { name: `${name} ${Date.now()}`, brokerName: 'CI' } });
    expect(response.status()).toBe(201);
    return (await response.json()).data.id as string;
  };
  const accountId = await createAccount('선조회');
  const secondId = await createAccount('선조회 격리');
  const securityId: string = (await (await request.get('/api/securities?query=099999&limit=20')).json()).data[0].id;
  const current = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const previous = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5, 7)) - 2, 15)).toISOString().slice(0, 10);
  const twoBack = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5, 7)) - 3, 15)).toISOString().slice(0, 10);
  const queryStart = (date: string) => {
    const first = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);
    first.setDate(first.getDate() - 6);
    return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
  };
  const deposit = await request.post('/api/cash-transactions', { data: { accountId, transactionType: 'DEPOSIT', transactionDate: `${previous}T03:00:00.000Z`, amount: '10000' } });
  expect(deposit.status()).toBe(201);
  expect((await request.post('/api/buy-trades', { data: { accountId, securityId, boughtAt: `${previous}T03:00:00.000Z`, quantity: '2', unitPrice: '1000', feeTaxAmount: '0' } })).status()).toBe(201);
  const journalRequests: string[] = [];
  const journalResponses: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/accounts/${accountId}/trades?`) && response.ok()) journalResponses.push(new URL(response.url()).searchParams.get('from') ?? '');
  });
  await page.route(`**/api/accounts/${accountId}/trades?*`, async (route) => {
    const from = new URL(route.request().url()).searchParams.get('from') ?? '';
    journalRequests.push(from);
    if (from === queryStart(twoBack)) await new Promise((resolve) => setTimeout(resolve, 650));
    await route.continue();
  });
  await page.addInitScript((id) => localStorage.setItem('roxstock-selected-account-id', id), accountId);
  for (const [width, height] of [[370, 465], [725, 396]]) {
    journalRequests.length = 0;
    journalResponses.length = 0;
    await page.setViewportSize({ width, height });
    await page.goto('/journal');
    await expect.poll(() => journalResponses.includes(queryStart(previous))).toBe(true);
    await page.getByRole('button', { name: '이전 달' }).click();
    await page.getByRole('button', { name: new RegExp(`^${previous}(?: .*)? 매수 1건`) }).click();
    await expect(page.getByText('2 × 1,000원').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('거래내역을 불러오는 중입니다.')).toHaveCount(0);
    await page.getByRole('button', { name: '이전 달' }).click();
    await expect(page.getByLabel(/거래 달력/)).toBeVisible();
    await page.getByRole('button', { name: '다음 달' }).click();
    await page.getByRole('button', { name: new RegExp(`^${previous}(?: .*)? 매수 1건`) }).click();
    await expect(page.getByText('2 × 1,000원').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('거래내역을 불러오는 중입니다.')).toHaveCount(0);
    expect(journalRequests.filter((from) => from === queryStart(previous)).length).toBeLessThanOrEqual(1);
    for (const [startX, endX, target] of [[80, 220, twoBack.slice(0, 7)], [220, 80, previous.slice(0, 7)]] as const) {
      await page.getByLabel(/거래 달력/).evaluate((element, [from, to]) => {
        const start = new Touch({ identifier: 1, target: element, clientX: from, clientY: 180 });
        const end = new Touch({ identifier: 1, target: element, clientX: to, clientY: 180 });
        element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start], changedTouches: [start] }));
        element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] }));
      }, [startX, endX]);
      await expect(page.getByLabel(`${Number(target.slice(0, 4))}년 ${Number(target.slice(5))}월 거래 달력`)).toBeVisible();
    }
  }
  await page.goto('/detail/settings?view=account');
  await page.getByRole('button', { name: /선조회 격리/ }).click();
  await page.route(`**/api/accounts/${secondId}/trades?*`, (route) => {
    const from = new URL(route.request().url()).searchParams.get('from');
    return from === queryStart(previous) ? route.fulfill({ status: 503, body: '{"error":{"message":"temporary failure"}}' }) : route.continue();
  });
  await page.getByRole('button', { name: '매매일지', exact: true }).click();
  await expect(page.getByText('총 0건')).toBeVisible();
  await page.getByRole('button', { name: '이전 달' }).click();
  await expect(page.getByText('2 × 1,000원')).toHaveCount(0);
  await expect(page.getByRole('alert', { name: '거래내역 조회 실패 · 다시 시도' })).toBeVisible();
  await expect(page.getByLabel(/거래 달력/)).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  expect(secondId).not.toBe(accountId);
});
