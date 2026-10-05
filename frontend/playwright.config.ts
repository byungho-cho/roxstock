import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    browserName: 'chromium',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'cover-400x640', use: { viewport: { width: 400, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: 'unfolded-816x616', use: { viewport: { width: 816, height: 616 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:3000/journal',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
