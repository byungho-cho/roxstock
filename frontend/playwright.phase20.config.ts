import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/targets',testMatch:['phase20.spec.ts','phase20-home.spec.ts','phase20-screens.spec.ts','phase18-loading.spec.ts','value-v04.spec.ts','phase16.spec.ts'],
 workers:2,retries:0,reporter:'list',outputDir:'test-results/phase20',
 use:{launchOptions:process.env.ROX_CHROMIUM_EXECUTABLE?{executablePath:process.env.ROX_CHROMIUM_EXECUTABLE}:undefined,baseURL:'http://127.0.0.1:3020',locale:'ko-KR',timezoneId:'Asia/Seoul',screenshot:'only-on-failure',trace:'retain-on-failure'},
 projects:[{name:'cover',use:{viewport:{width:370,height:465}}},{name:'tablet',use:{viewport:{width:725,height:396}}}],
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3020',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3020',reuseExistingServer:false},
});
