import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/targets',testMatch:['value-v04.spec.ts','improvements-phase6.spec.ts','stock-detail-refresh.spec.ts'],
 workers:2,retries:0,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3001',locale:'ko-KR',timezoneId:'Asia/Seoul',screenshot:'only-on-failure'},
 projects:[{name:'cover',use:{viewport:{width:370,height:465}}},{name:'tablet',use:{viewport:{width:725,height:396}}}],
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3001',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3001',reuseExistingServer:!process.env.CI},
});
