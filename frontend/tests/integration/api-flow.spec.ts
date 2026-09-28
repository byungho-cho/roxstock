import { expect, test } from '@playwright/test';

test('isolated account: dashboard → stocks → journal → cash/buy/sell/withdrawal', async ({ page, request }, testInfo) => {
  const accountResponse = await request.post('/api/accounts', { data: { name: '프론트 통합테스트 전용', brokerName: 'CI' } });
  expect(accountResponse.status()).toBe(201);
  const accountId: string = (await accountResponse.json()).data.id;
  const securityResponse = await request.get('/api/securities?query=099999&limit=20&offset=0');
  expect(securityResponse.ok()).toBeTruthy();
  const securityId: string = (await securityResponse.json()).data[0].id;

  await page.goto('/');
  await expect(page.getByText('보유종목이 없습니다.')).toBeVisible();
  await expect(page.getByText('과거 자산 추이 데이터가 없습니다.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('01-empty-dashboard.png') });

  await page.goto('/stocks?tab=holding');
  await expect(page.getByText('보유중 0')).toBeVisible();
  await expect(page.getByText('표시할 종목이 없습니다.')).toBeVisible();
  await page.goto('/journal');
  await expect(page.getByText('총 0건')).toBeVisible();

  await page.goto('/detail/cash');
  await page.getByRole('button', { name: '예수금 등록' }).click();
  await page.getByRole('textbox', { name: '금액' }).fill('20000');
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByText('20,000원')).toBeVisible();
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
  await expect(page.getByText('19,000원')).toBeVisible();
  const afterWithdrawal = (await (await request.get(`/api/accounts/${accountId}/dashboard`)).json()).data;
  expect(Number(afterWithdrawal.cashBalance)).toBe(19_000);
  await page.screenshot({ path: testInfo.outputPath('04-after-withdrawal.png') });
});
