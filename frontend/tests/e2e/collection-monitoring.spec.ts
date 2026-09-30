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
  await page.route('**/api/collection/monitoring', async (route) => route.fulfill({ json: { data: summary } }));
  await page.route('**/api/collection/monitoring/**', async (route) => route.fulfill({ json: { data: {
    id: 'realtime-prices', name: '선택 종목 실시간 주가', generatedAt: '2026-09-30T00:00:00.000Z',
    runs: [{ id: '1', status: 'PARTIAL', startedAt: '2026-09-30T00:00:00.000Z', finishedAt: '2026-09-30T00:01:00.000Z', target: 2, success: 1, failed: 1, skipped: 0, failureReason: longError }],
    items: [{ symbol: '005930', status: 'FAILED', reason: longError, occurredAt: '2026-09-30T00:00:00.000Z' }],
    realtime: { state: null, aggregates: [], issues: [{ at: '2026-09-30T00:00:00.000Z', stage: 'SOURCE', reason: longError }] },
  } } }));
  await page.goto('/detail/collection-monitoring');
  await expect(page.getByText('선택 종목 실시간 주가', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('DART 재무제표', { exact: true })).toBeVisible();
  await page.getByText('선택 종목 실시간 주가', { exact: true }).first().click();
  await expect(page.getByText(/API 응답 본문에서 오류를 확인했습니다/)).toBeVisible();
  const dimensions = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, mainHeight: document.querySelector('main')!.clientHeight }));
  expect(dimensions.overflow).toBe(false);
  expect(dimensions.mainHeight).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath(`collection-monitoring-${cover ? '370x465' : '725x396'}.png`) });
});
