import { expect, test } from '@playwright/test';

const summary = { generatedAt: '2026-09-30T00:00:00.000Z', timezone: 'Asia/Seoul', features: [
  { id: 'security-master', name: '종목 마스터', schedule: '매일 07:00', status: 'OK', lastAttemptAt: null, lastSuccessAt: null, lastDataAt: null, statsGeneratedAt: '2026-09-30T00:00:00.000Z', nextAt: null, recent: { target: 3000, processed: 3000, success: 2998, failed: 2, skipped: 0 } },
  { id: 'realtime-prices', name: '선택 종목 실시간 주가', schedule: '평일 장 구간, 60초 간격', status: 'PARTIAL', lastAttemptAt: null, lastSuccessAt: null, lastDataAt: null, statsGeneratedAt: '2026-09-30T00:00:00.000Z', nextAt: null, recent: { target: 6, processed: 5, success: 5, failed: 1, skipped: 0 }, realtime: { workerStatus: 'RUNNING', heartbeatAt: '2026-09-30T00:00:00.000Z', session: 'REGULAR', cycleStartedAt: null, cycleFinishedAt: null, lastPriceReceivedAt: null, lastSourcePriceAt: null, lastSsePublishedAt: null, lastDbSavedAt: null, sourceError: null, publishError: null, saveError: null, counts: {} } },
  { id: 'market-prices', name: '전체 종목 주가', schedule: '매일 20:00', status: 'WAITING', lastAttemptAt: null, lastSuccessAt: null, lastDataAt: null, statsGeneratedAt: '2026-09-30T00:00:00.000Z', nextAt: null, recent: { target: 0, processed: 0, success: 0, failed: 0, skipped: 0 } },
  { id: 'account-snapshots', name: '일별 계좌 스냅샷', schedule: '매일 23:00', status: 'WAITING', lastAttemptAt: null, lastSuccessAt: null, lastDataAt: null, statsGeneratedAt: '2026-09-30T00:00:00.000Z', nextAt: null, recent: { target: 0, processed: 0, success: 0, failed: 0, skipped: 0 } },
  { id: 'dart-financial-statements', name: 'DART 재무제표', schedule: '과거 구축 18:00–06:00', status: 'NOT_CONFIGURED', phase: 'BACKFILL', dailyApiCalls: 0, dailyApiLimit: 3000, backfill: { planned: 10000, success: 120, noFiling: 45, notApplicable: 5, failed: 2, pending: 9828 }, lastAttemptAt: null, lastSuccessAt: null, lastDataAt: null, statsGeneratedAt: '2026-09-30T00:00:00.000Z', nextAt: null, recent: { target: 172, processed: 170, success: 120, failed: 2, skipped: 50 } },
] };
const longError = `API 응답 본문에서 오류를 확인했습니다. ${'원천 가격 응답 처리 실패; 재시도 가능한 요청입니다. '.repeat(16)}`;

test('collection monitor keeps status cards visible while stats refresh and fits both target viewports', async ({ page }, testInfo) => {
  const cover = testInfo.project.name.startsWith('cover');
  await page.setViewportSize(cover ? { width: 370, height: 465 } : { width: 725, height: 396 });
  let summaryRequests = 0;
  let detailRequests = 0;
  const collectionActionRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/')) return;
    if (request.url().endsWith('/api/collection/monitoring')) summaryRequests += 1;
    else if (request.url().includes('/api/collection/monitoring/')) detailRequests += 1;
    else if (request.url().includes('/api/collection/')) collectionActionRequests.push(request.url());
  });
  await page.route('**/api/collection/monitoring', async (route) => route.fulfill({ json: { data: summary } }));
  await page.route('**/api/collection/monitoring/**', async (route) => {
    if (route.request().url().includes('dart-financial-statements')) {
      return route.fulfill({ json: { data: {
        id: 'dart-financial-statements', name: 'DART 재무제표', generatedAt: '2026-09-30T00:00:00.000Z',
        runs: [{ id: '2', status: 'PARTIAL', startedAt: '2026-09-30T00:00:00.000Z', target: 8, success: 5, failed: 1, skipped: 2, metadata: { phase: 'BACKFILL' } }],
        items: [{ symbol: '005930', status: 'FAILED', reason: longError, occurredAt: '2026-09-30T00:00:00.000Z' }],
        dart: { backfill: { planned: 10000, byStatus: { SUCCESS: 120, NO_FILING: 45, NOT_APPLICABLE: 5, FAILED: 2, PENDING: 9828 } }, priority: {}, universe: {} },
      } } });
    }
    return route.fulfill({ json: { data: {
      id: 'realtime-prices', name: '선택 종목 실시간 주가', generatedAt: '2026-09-30T00:00:00.000Z',
      runs: [{ id: '1', status: 'PARTIAL', startedAt: '2026-09-30T00:00:00.000Z', finishedAt: '2026-09-30T00:01:00.000Z', target: 2, success: 1, failed: 1, skipped: 0, failureReason: longError }],
      items: [{ symbol: '005930', status: 'FAILED', reason: longError, occurredAt: '2026-09-30T00:00:00.000Z' }],
      realtime: { state: null, aggregates: [], issues: [{ at: '2026-09-30T00:00:00.000Z', stage: 'SOURCE', reason: longError }] },
    } } });
  });
  await page.goto('/detail/collection-monitoring');
  await expect(page.getByRole('heading', { name: '수집 모니터링' })).toBeVisible();
  await expect(page.getByRole('link', { name: '실시간 주가 상세 보기' })).toBeVisible();
  await expect(page.getByText('DART 재무제표', { exact: true })).toBeVisible();
  await expect(page.getByText('확인 필요 2', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`monitor-summary-${cover ? '370x465' : '725x396'}.png`) });
  await page.getByRole('link', { name: '실시간 주가 상세 보기' }).click();
  await expect(page.getByRole('heading', { name: '실시간 주가' })).toBeVisible();
  await expect(page.locator('main p:visible').filter({ hasText: /워커/ }).first()).toBeVisible();
  await expect(page.getByText(/API 응답 본문에서 오류를 확인했습니다/).first()).toBeVisible();
  const requestsBeforeRefresh = { summary: summaryRequests, detail: detailRequests };
  await page.getByRole('button', { name: '통계 새로고침' }).first().click();
  await expect.poll(() => summaryRequests).toBeGreaterThan(requestsBeforeRefresh.summary);
  await expect.poll(() => detailRequests).toBeGreaterThan(requestsBeforeRefresh.detail);
  expect(collectionActionRequests).toEqual([]);
  await page.goto('/detail/collection-monitoring/dart-financial-statements');
  await expect(page.getByRole('heading', { name: 'DART 재무제표' })).toBeVisible();
  await expect(page.getByText(/1단계 · 과거 자료 최초 수집/)).toBeVisible();
  await expect(page.getByText(/2단계 · 현재 사업연도 상시 수집/)).toBeVisible();
  if (!cover) await expect(page.getByText(/API 0\/3,000/)).toBeVisible();
  await page.getByRole('button', { name: '필터', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '종목 필터' })).toBeVisible();
  await page.getByRole('button', { name: '필터', exact: true }).click();
  const dimensions = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, mainHeight: document.querySelector('main')!.clientHeight }));
  expect(dimensions.overflow).toBe(false);
  expect(dimensions.mainHeight).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath(`collection-monitoring-${cover ? '370x465' : '725x396'}.png`) });
});


test('out-of-session does not hide an actual worker failure and unavailable detail stays unknown', async ({ page }) => {
  const features = summary.features.map((item) => item.id === 'realtime-prices'
    ? { ...item, status: 'FAILED', realtime: { ...summary.features[1].realtime!, session: 'OUT_OF_SESSION' } }
    : item);
  await page.route('**/api/collection/monitoring', (route) => route.fulfill({ json: { data: { ...summary, features } } }));
  await page.route('**/api/collection/monitoring/**', (route) => route.fulfill({ status: 503, json: { error: { message: '일시적인 조회 실패' } } }));
  await page.goto('/detail/collection-monitoring');
  await expect(page.getByRole('link', { name: '실시간 주가 상세 보기' }).getByText('오류', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'DART 재무제표 상세 보기' }).click();
  await expect(page.getByRole('alert')).toHaveText('수집 상세를 불러오지 못했습니다.');
  await expect(page.getByText('0 / 0개 작업 완료', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL(/\/detail\/collection-monitoring$/);
});


test('all monitoring details keep the fixed shell and safe scroll clearance at minimum and larger sizes', async ({ page }, testInfo) => {
  await page.route('**/api/collection/monitoring', (route) => route.fulfill({ json: { data: summary } }));
  await page.route('**/api/collection/monitoring/**', (route) => route.fulfill({ json: { data: {
    runs: [{ id: 'visual', status: 'SUCCESS', startedAt: summary.generatedAt, target: 12, success: 12, failed: 0, skipped: 0 }],
    items: [{ symbol: '005930', status: 'SUCCESS', reason: '수집 완료' }],
    dart: { backfill: { planned: 10000, byStatus: { SUCCESS: 120, NO_FILING: 45, NOT_APPLICABLE: 5, FAILED: 2, PENDING: 9828 } } },
  } } }));
  const sizes = testInfo.project.name.startsWith('cover')
    ? [{ width: 370, height: 465 }, { width: 400, height: 640 }]
    : [{ width: 725, height: 396 }, { width: 816, height: 616 }, { width: 1280, height: 800 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const feature of summary.features) {
      await page.goto(`/detail/collection-monitoring/${feature.id}`);
      await expect(page.getByText('수집 완료', { exact: true })).toBeVisible();
      const shell = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        main.scrollTop = main.scrollHeight;
        const bounds = main.getBoundingClientRect();
        const last = [...main.querySelectorAll('p')].find((p) => p.textContent === '갱신 중에도 마지막 완료 결과를 유지합니다.')!;
        return { top: bounds.top, bottom: bounds.bottom, overflow: document.documentElement.scrollWidth > innerWidth, clearance: bounds.bottom - last.getBoundingClientRect().bottom };
      });
      expect(shell.top).toBe(44);
      expect(shell.bottom).toBe(size.height - 44);
      expect(shell.overflow).toBe(false);
      expect(shell.clearance).toBeGreaterThanOrEqual(70);
      await page.locator('main').evaluate((main) => { main.scrollTop = 0; });
      await page.screenshot({ path: testInfo.outputPath(`monitor-${feature.id}-${size.width}x${size.height}.png`) });
    }
  }
});
