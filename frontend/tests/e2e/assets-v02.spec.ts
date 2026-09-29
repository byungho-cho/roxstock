import { expect, test } from '@playwright/test';

test('110 evaluation assets v0.2 matches cover and unfolded layout', async ({ page }, testInfo) => {
  const cover = testInfo.project.name.startsWith('cover');
  await page.setViewportSize(cover ? { width: 370, height: 465 } : { width: 816, height: 425 });
  await page.goto('/detail/assets');
  await expect(page.getByRole('heading', { name: '평가자산' })).toBeVisible();
  await expect(page.getByText('자산구성', { exact: true })).toBeVisible();
  const layout = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const grid = main.firstElementChild!;
    const left = grid.firstElementChild!;
    const composition = grid.lastElementChild!;
    const cards = [...left.children].map((element) => element.getBoundingClientRect());
    return {
      cards: cards.map((rect) => rect.toJSON()),
      composition: composition.getBoundingClientRect().toJSON(),
      mainScrollable: main.scrollHeight > main.clientHeight,
      compositionScrollable: composition.scrollHeight > composition.clientHeight,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(layout.cards[0].height).toBe(76);
  expect(layout.cards[1].height).toBe(68);
  expect(layout.documentOverflow).toBe(false);
  if (cover) {
    expect(layout.cards[2].height).toBe(174);
    expect(layout.composition.top).toBeGreaterThan(layout.cards[2].bottom);
    expect(layout.mainScrollable).toBe(true);
    await expect(page.getByRole('button', { name: '홈', exact: true })).toHaveClass(/Mui-selected/);
  } else {
    expect(layout.cards[2].height).toBe(167);
    expect(Math.abs(layout.cards[0].top - layout.composition.top)).toBeLessThan(1);
    expect(layout.composition.height).toBe(327);
    expect(layout.mainScrollable).toBe(false);
    expect(layout.compositionScrollable).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath(`assets-v02-${cover ? '370x465' : '816x425'}.png`) });
  await page.getByRole('button', { name: '종목별 비중 차트 방식 변경' }).click();
  await expect(page.getByRole('button', { name: '종목별 비중 차트 방식 변경' })).toHaveText('순위형');
  if (!cover) {
    const card = page.getByText('자산구성', { exact: true }).locator('..');
    await card.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(card.getByText('NAVER').last()).toBeVisible();
  }
});
