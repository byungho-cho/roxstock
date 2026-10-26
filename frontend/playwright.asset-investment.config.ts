import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/targets',testMatch:'asset-investment-v1226.spec.ts',workers:1,retries:0,reporter:'list',
 outputDir:'test-results/asset-investment',
 use:{baseURL:'http://127.0.0.1:3004',locale:'ko-KR',timezoneId:'Asia/Seoul',hasTouch:true,screenshot:'only-on-failure'},
 projects:[{name:'cover',use:{viewport:{width:370,height:465}}},{name:'unfolded',use:{viewport:{width:725,height:396}}}],
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3004 --strictPort',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3004',reuseExistingServer:!process.env.CI},
});
