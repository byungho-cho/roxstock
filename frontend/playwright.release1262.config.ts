import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/targets',testMatch:['live-quotes.spec.ts','live-price-alerts.spec.ts','stock-value-popup14.spec.ts','stocks-v04.spec.ts'],workers:2,reporter:'list',outputDir:'test-results/release1262',
 use:{baseURL:'http://127.0.0.1:3172',locale:'ko-KR',timezoneId:'Asia/Seoul',hasTouch:true,screenshot:'only-on-failure',trace:'retain-on-failure'},
 projects:[{name:'cover',use:{viewport:{width:370,height:465}}},{name:'tablet',use:{viewport:{width:725,height:396}}},{name:'wide-tablet',use:{viewport:{width:816,height:616}}}],
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3172 --strictPort',url:'http://127.0.0.1:3172',reuseExistingServer:false,env:{VITE_DATA_SOURCE:'api'}},
});
