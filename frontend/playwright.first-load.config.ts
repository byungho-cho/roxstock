import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/targets',
  testMatch: ['first-load.spec.ts', 'analysis-v04.spec.ts'],
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3014', channel: 'chrome', locale: 'ko-KR', timezoneId: 'Asia/Seoul', screenshot: 'only-on-failure' },
  projects: [
    { name: 'phone', use: { viewport: { width: 370, height: 465 } } },
    { name: 'tablet', use: { viewport: { width: 816, height: 616 } } },
  ],
  webServer: { command: 'npm run preview -- --port 3014 --strictPort', url: 'http://127.0.0.1:3014', reuseExistingServer: false },
});
