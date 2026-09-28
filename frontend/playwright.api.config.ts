import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-api', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000', browserName: 'chromium',
    viewport: { width: 816, height: 616 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
});
