import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/notifications', fullyParallel: false, workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3011', viewport: { width: 412, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 3011 --strictPort', url: 'http://127.0.0.1:3011', reuseExistingServer: false, env: { VITE_DATA_SOURCE: 'api' } },
});
