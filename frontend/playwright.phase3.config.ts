import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/targets',testMatch:'improvements-phase3.spec.ts',workers:1,retries:0,
  reporter:'list',outputDir:'test-results/phase3',
  use:{baseURL:'http://127.0.0.1:3003',hasTouch:true,locale:'ko-KR',timezoneId:'Asia/Seoul',screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[{name:'cover',use:{viewport:{width:370,height:465}}},{name:'tablet',use:{viewport:{width:725,height:396}}},{name:'large',use:{viewport:{width:1200,height:900}}}],
  webServer:{command:'VITE_DATA_SOURCE=api npm run dev -- --host 127.0.0.1 --port 3003',url:'http://127.0.0.1:3003',reuseExistingServer:!process.env.CI},
});
