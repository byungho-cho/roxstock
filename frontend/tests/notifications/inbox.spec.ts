import { expect, test, type Page } from '@playwright/test';
const raw = '[미래에셋증권] 전량체결\n계좌번호 : 010-12**-**78-0\n종목명 : SK하이닉스(A000660)\n매매구분 : 매수\n주문수량 : 1주\n체결수량 : 1주\n체결단가 : 1,681,000원\n체결금액 : 1,681,000원\n주문번호 : 10001';
async function api(page: Page) {
  let writes = 0;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') { writes++; return route.fulfill({ json: { data: { id: '20', cashTransactionId: '21', balanceAfter: '100' } } }); }
    if (url.pathname === '/api/accounts') return route.fulfill({ json: { data: [{ id: '1', name: '기본 계좌', accountNumber: '010123456780', brokerName: '미래에셋증권', cashBalance: '10000000', isActive: true }] } });
    if (url.pathname === '/api/securities') return route.fulfill({ json: { data: [{ id: '262', symbol: '000660', name: 'SK하이닉스' }] } });
    return route.fulfill({ json: { data: [] } });
  });
  return () => writes;
}
test('samples never write API; mismatch asks for account; cancel preserves pending and reload', async ({ page }) => {
  const writes = await api(page);
  await page.goto('/detail/notifications');
  await page.getByRole('button', { name: '계좌 불일치 샘플', exact: true }).click();
  await page.getByRole('button', { name: /\[샘플\].*SK하이닉스/ }).click();
  await expect(page.getByText('현재 계좌와 일치하지 않거나', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '샘플 계좌 2', exact: false }).click();
  await expect(page.getByRole('textbox', { name: '체결단가', exact: true })).toHaveValue('1,681,000');
  await page.getByRole('button', { name: '취소 · 대기 유지', exact: true }).click();
  await page.reload(); await expect(page.getByText('등록 대기 1건', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /\[샘플\].*SK하이닉스/ }).click();
  await page.getByRole('button', { name: '샘플 계좌 2', exact: false }).click();
  await page.getByRole('checkbox', { name: '계좌, 종목, 전체 체결수량과 금액을 확인했습니다.' }).check();
  await page.getByRole('button', { name: '샘플 저장 확인', exact: true }).click();
  await expect(page.getByText('등록 대기 0건', { exact: true })).toBeVisible(); expect(writes()).toBe(0);
});
test('matching account opens prefill; more native notices do not overwrite edits; retry reuses request', async ({ page }) => {
  await api(page);
  const payloads: any[] = []; let fail = true;
  await page.route('**/api/buy-trades', async route => { payloads.push(route.request().postDataJSON()); if (fail) { fail = false; return route.abort(); } return route.fulfill({ json: { data: { id: '22' } } }); });
  await page.addInitScript(({ raw }) => {
    localStorage.setItem('roxstock-selected-account-id', '1');
    if (!localStorage.getItem('roxstock-notification-inbox-v1')) localStorage.setItem('roxstock-notification-inbox-v1', JSON.stringify([{ id: 'a'.repeat(64), raw, receivedAt: Date.parse('2026-10-09T16:30:15Z'), status: 'pending' }]));
    const target = window as any;
    target.nativeNotices = [];
    target.RoxStockNative = {
      postMessage: (message: string) => {
        const command = JSON.parse(message);
        setTimeout(() => target.RoxStockNative.onmessage?.({ data: JSON.stringify({ requestId: command.requestId, entries: target.nativeNotices, permission: true }) }), 0);
      },
    };
  }, { raw });
  await page.goto('/detail/notifications?notice=' + 'a'.repeat(64));
  await expect(page.getByTestId('notification-registration')).toBeVisible();
  await expect(page.getByLabel('거래일시 (한국시간)')).toHaveValue('2026-10-10T01:30:15');
  await page.getByRole('textbox', { name: '체결단가', exact: true }).fill('1600000');
  await page.evaluate(({ raw }) => { (window as any).nativeNotices = [{ id: 'b'.repeat(64), raw: raw.replace('10001', '10002'), receivedAt: Date.now(), status: 'pending' }]; }, { raw });
  await expect(page.getByRole('button', { name: '거래 알림 목록', exact: true })).toContainText('2', { timeout: 8000 });
  await expect(page.getByRole('textbox', { name: '체결단가', exact: true })).toHaveValue('1,600,000');
  await page.getByRole('checkbox', { name: '계좌, 종목, 전체 체결수량과 금액을 확인했습니다.' }).check();
  expect(payloads).toHaveLength(0);
  await page.getByRole('button', { name: '확인 후 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '동일 요청 재확인', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '체결단가', exact: true })).toHaveValue('1,600,000');
  await page.getByRole('button', { name: '동일 요청 재확인', exact: true }).click();
  await expect(page.getByText('등록 대기 1건', { exact: true })).toBeVisible();
  expect(payloads).toHaveLength(2); expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[0].boughtAt).toBe('2026-10-09T16:30:15.000Z'); expect(payloads[0].accountId).toBe('1');
});
test('dividend sample pre-fills gross and net', async ({ page }) => {
  const writes = await api(page); await page.goto('/detail/notifications');
  await page.getByRole('button', { name: '배당 샘플', exact: true }).click();
  await page.getByRole('button', { name: /\[샘플\].*현대자동차/ }).click();
  await expect(page.getByRole('textbox', { name: '세전 배당금', exact: true })).toHaveValue('137,500');
  await expect(page.getByRole('textbox', { name: '세후 배당금', exact: true })).toHaveValue('116,330');
  expect(writes()).toBe(0);
});
