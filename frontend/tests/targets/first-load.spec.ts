import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fixture } from './stock-input-fixture';

for (const path of ['/', '/assets']) test(`cold ${path} loads only needed screens and valid precompressed code`, async ({ page }) => {
  await fixture(page);
  const scripts = new Set<string>();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('.js')) scripts.add(path);
  });
  await page.goto(path);
  await expect(page.getByTestId(path === '/' ? 'home-summary-area' : 'analysis-total')).toBeVisible();
  await expect(page.getByRole('status', { name: '화면 불러오는 중' })).toHaveCount(0);
  expect([...scripts].some(path => /(?:FinancialPage|ValueAnalysisPage|CompoundPage|SettingsPage|JournalPage)-/.test(path))).toBe(false);
  expect([...scripts].some(name => name.includes(path === '/' ? 'DashboardPage-' : 'AssetAnalysisPage-'))).toBe(true);
  let rawBytes = 0, gzipBytes = 0;
  for (const script of scripts) {
    const file = new URL(`../../dist${script}`, import.meta.url);
    const raw = await readFile(file), compressed = await readFile(new URL(`${file.href}.gz`)).catch(() => null);
    rawBytes += raw.length;
    gzipBytes += compressed?.length ?? raw.length;
    if (compressed) expect(gunzipSync(compressed).equals(raw)).toBe(true);
  }
  expect(gzipBytes).toBeLessThan(300_000);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ path, scripts: scripts.size, rawBytes, gzipBytes }));
});

test('failed screen download preserves navigation and can be retried', async ({ page }) => {
  await fixture(page);
  await page.route('**/assets/AssetAnalysisPage-*.js', route => route.abort());
  await page.goto('/assets');
  await expect(page.getByRole('alert')).toContainText('화면을 불러오지 못했어요.');
  await expect(page.locator('.MuiBottomNavigation-root')).toBeVisible();
  await page.unroute('**/assets/AssetAnalysisPage-*.js');
  await page.getByRole('button', { name: '새로고침하여 다시 시도' }).click();
  await expect(page.getByTestId('analysis-total')).toBeVisible();
});
