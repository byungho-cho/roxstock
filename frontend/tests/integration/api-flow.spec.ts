import { expect, test } from '@playwright/test';

test('isolated account: dashboard → stocks → journal → cash/buy/sell/withdrawal', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
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
  await page.getByText('평가자산', { exact: true }).first().click();
  await expect(page).toHaveURL(/detail\/assets/);
  await expect(page.getByText('과거 평가자산 조회 API가 준비되지 않아 상세 추이를 표시할 수 없습니다.')).toBeVisible();

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
  await page.goto('/');
  await expect(page.getByText('20,400원')).toBeVisible();
  await expect(page.getByText('18,000원')).toBeVisible();
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
