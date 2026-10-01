import { expect, test } from '@playwright/test';

test('100 home v0.2 fits the measured cover and unfolded viewports', async ({ page }, testInfo) => {
  const cover = testInfo.project.name.startsWith('cover');
  await page.setViewportSize(cover ? { width: 370, height: 465 } : { width: 816, height: 425 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
  await expect(page.getByText('보유종목', { exact: true }).first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const header = document.querySelector('header')!;
    const main = document.querySelector('main')!;
    const nav = [...document.querySelectorAll('.MuiBottomNavigation-root')].find((element) => getComputedStyle(element).display !== 'none')!;
    const grid = main.firstElementChild!;
    const left = grid.firstElementChild!;
    const right = grid.children[1]!;
    const cards = [...left.children].map((element) => element.getBoundingClientRect());
    return {
      header: header.getBoundingClientRect().toJSON(),
      main: main.getBoundingClientRect().toJSON(),
      nav: nav.getBoundingClientRect().toJSON(),
      cards: cards.map((rect) => rect.toJSON()),
      right: right.getBoundingClientRect().toJSON(),
      mainScrollable: main.scrollHeight > main.clientHeight,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(layout.header.height).toBe(44);
  expect(layout.nav.height).toBe(44);
  expect(layout.documentOverflow).toBe(false);
  expect(layout.cards[0].height).toBe(76);
  expect(layout.cards[1].height).toBe(68);
  if (cover) {
    expect(layout.cards[2].height).toBe(88);
    expect(layout.right.height).toBe(156);
    expect(layout.mainScrollable).toBe(true);
  } else {
    expect(layout.cards[2].height).toBeGreaterThanOrEqual(167);
    expect(Math.abs(layout.cards[0].left - 20)).toBeLessThan(1);
    expect(Math.abs(layout.cards[0].top - layout.right.top)).toBeLessThan(1);
    expect(Math.abs(layout.cards[2].bottom - layout.right.bottom)).toBeLessThan(1);
    expect(layout.mainScrollable).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath(`home-v02-${cover ? '370x465' : '816x425'}.png`) });

  await page.getByRole('button', { name: '거래등록' }).click();
  await expect(page).toHaveURL(/\/trade/);
});


test('bottom navigation keeps the same icons when selection changes', async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name.startsWith('cover') ? { width: 370, height: 465 } : { width: 725, height: 396 });
  await page.goto('/');
  const activeNav = page.locator('.MuiBottomNavigation-root:visible');
  const iconsBefore = await activeNav.locator('button').evaluateAll((buttons) => buttons.map((button) => button.querySelector('svg')?.innerHTML));
  expect(iconsBefore.every(Boolean)).toBe(true);
  await activeNav.getByRole('button', { name: '더보기' }).click();
  await expect(page).toHaveURL(/\/more/);
  const iconsAfter = await page.locator('.MuiBottomNavigation-root:visible button').evaluateAll((buttons) => buttons.map((button) => button.querySelector('svg')?.innerHTML));
  expect(iconsAfter).toEqual(iconsBefore);
});

