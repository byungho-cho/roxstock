import { expect, test } from '@playwright/test';

test('journal calendar and trades fit the selected viewport', async ({ page }, testInfo) => {
  await page.goto('/journal?date=2026-09-14');
  await expect(page.locator('button[aria-label^="2026-09-14 "]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([
    testInfo.project.use.viewport!.width,
    testInfo.project.use.viewport!.height,
  ]);

  const calendar = page.getByLabel('2026년 9월 거래 달력');
  const busyDay = calendar.locator('button[aria-label^="2026-09-14 "]');
  await expect(busyDay.getByText('매수 2')).toBeVisible();
  await expect(busyDay.getByText('매도 3')).toBeVisible();

  if (testInfo.project.name.startsWith('unfolded')) {
    const geometry = await page.evaluate(() => {
      const calendar = document.querySelector('[aria-label="2026년 9월 거래 달력"]')!;
      const detail = calendar.parentElement!.nextElementSibling!;
      const day = calendar.querySelector('button[aria-label^="2026-09-14 "]')!;
      const chips = [...day.querySelectorAll('span')].filter((el) => /매수|매도/.test(el.textContent ?? ''));
      const scroller = calendar.children[1];
      const rows = [...document.querySelectorAll('button[aria-label$="거래 상세"]')];
      const title = document.querySelector('header h1')!;
      const titleText = document.createRange();
      titleText.selectNodeContents(title);
      const prev = document.querySelector('header button[aria-label="이전 달"]')!;
      const next = document.querySelector('header button[aria-label="다음 달"]')!;
      const today = document.querySelector('header button[aria-label="오늘 날짜로 이동"]')!;
      return {
        calendar: calendar.getBoundingClientRect().toJSON(),
        detail: detail.getBoundingClientRect().toJSON(),
        mainOverflow: document.querySelector('main')!.scrollHeight > document.querySelector('main')!.clientHeight,
        calendarOverflow: scroller.scrollHeight > scroller.clientHeight,
        chipsFit: chips.every((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().bottom <= day.getBoundingClientRect().bottom),
        headerFits: titleText.getBoundingClientRect().right < prev.getBoundingClientRect().left && next.getBoundingClientRect().right < today.getBoundingClientRect().left,
        rows: rows.map((row) => {
          const [expression, amount] = [...row.children[1].children];
          return {
            expression: expression.textContent,
            amount: amount.textContent,
            aligned: Math.abs(expression.getBoundingClientRect().right - amount.getBoundingClientRect().right) < 1,
            overflow: row.scrollWidth > row.clientWidth,
          };
        }),
      };
    });
    expect(Math.abs(geometry.calendar.top - geometry.detail.top)).toBeLessThan(1);
    expect(Math.abs(geometry.calendar.bottom - geometry.detail.bottom)).toBeLessThan(1);
    expect(geometry.mainOverflow).toBe(false);
    expect(geometry.calendarOverflow).toBe(false);
    expect(geometry.chipsFit).toBe(true);
    expect(geometry.headerFits).toBe(true);
    expect(geometry.rows).toHaveLength(5);
    for (const row of geometry.rows) {
      expect(row.expression).toContain('×');
      expect(row.amount).toContain('원');
      expect(row.aligned).toBe(true);
      expect(row.overflow).toBe(false);
    }
  } else {
    await expect(page.locator('header button[aria-label="이전 달"]')).toBeHidden();
    await expect(page.locator('main button[aria-label="이전 달"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  await page.screenshot({ path: testInfo.outputPath('journal-2026-09-14.png') });
});

test('six-week month remains inside tablet calendar', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('unfolded'));
  await page.goto('/journal?date=2026-08-14');
  const calendar = page.getByLabel('2026년 8월 거래 달력');
  await expect(calendar).toBeVisible();
  const fits = await calendar.evaluate((element) => element.children[1].scrollHeight <= element.children[1].clientHeight);
  expect(fits).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('journal-six-week-month.png') });
});
