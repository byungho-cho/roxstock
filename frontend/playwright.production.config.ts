import { defineConfig } from '@playwright/test';

const runSuffix = [process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT].filter(Boolean).join('-') || 'local';

export default defineConfig({
  testDir: './tests/qa-production',
  outputDir: `test-results/production-home-${runSuffix}`,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-production', open: 'never' }],
    ['json', { outputFile: 'qa-results/production-home-results.json' }],
  ],
  use: {
    baseURL: process.env.QA_BASE_URL ?? 'https://newrox.cafe24.com',
    browserName: 'chromium',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'dark',
    screenshot: 'on',
    trace: 'on',
    video: 'on',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'cover-required-370x465', use: { viewport: { width: 370, height: 465 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: 'unfolded-required-725x396', use: { viewport: { width: 725, height: 396 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: 'cover-responsive-400x640', use: { viewport: { width: 400, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: 'unfolded-responsive-816x616', use: { viewport: { width: 816, height: 616 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
  ],
});
