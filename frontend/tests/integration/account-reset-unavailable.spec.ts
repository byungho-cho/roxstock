import { expect, test } from '@playwright/test';

test('real API without reset permission: cover and unfolded settings hide execution', async ({ page, request }, testInfo) => {
  const created = await request.post('/api/accounts', { data: { name: '초기화 접근 제한 테스트', brokerName: 'CI' } });
  expect(created.status()).toBe(201);
  const accountId: string = (await created.json()).data.id;
  const availability = await request.get(`/api/accounts/${accountId}/reset-availability`);
  expect([401, 403, 404]).toContain(availability.status());

  for (const [width, height, url, label] of [
    [400, 640, '/detail/settings', 'cover'],
    [816, 616, '/more', 'unfolded'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await expect(page.getByText('계좌 데이터 초기화')).toBeVisible();
    await page.getByText('계좌 데이터 초기화').scrollIntoViewIfNeeded();
    await expect(page.getByText('현재 사용할 수 없는 기능입니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: '초기화 진행' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '최종 초기화' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`account-reset-${label}.png`), fullPage: true });
  }
});
