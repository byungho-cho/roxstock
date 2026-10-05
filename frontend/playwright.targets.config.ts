import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/targets', fullyParallel: true, retries: 0,
  outputDir: 'test-results/targets',
  reporter: [['list'], ['html', { outputFolder: 'playwright-targets-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3001', locale: 'ko-KR', timezoneId: 'Asia/Seoul', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'cover-370x465', use: { viewport: { width: 370, height: 465 } } },
    { name: 'tablet-725x396', use: { viewport: { width: 725, height: 396 } } },
    { name: 'cover-400x640', use: { viewport: { width: 400, height: 640 } } },
    { name: 'tablet-816x616', use: { viewport: { width: 816, height: 616 } } },
  ],
  webServer: { command: 'VITE_DATA_SOURCE=api npm run dev -- --host 127.0.0.1 --port 3001', url: 'http://127.0.0.1:3001', reuseExistingServer: !process.env.CI },
});
