import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/targets', testMatch: 'tuning-01.spec.ts', workers: 2, retries: 0,
  outputDir: 'test-results/tuning-01', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3002', locale:'ko-KR', timezoneId:'Asia/Seoul', screenshot:'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} },
  projects: [{name:'cover',use:{viewport:{width:370,height:465}}},{name:'tablet',use:{viewport:{width:725,height:396}}}],
  webServer: { command:'VITE_DATA_SOURCE=api npm run build && npm run preview -- --host 127.0.0.1 --port 3002', url:'http://127.0.0.1:3002', reuseExistingServer:!process.env.CI, timeout:120_000 },
});
