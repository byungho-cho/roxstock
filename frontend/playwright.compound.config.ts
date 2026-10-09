import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/targets',testMatch:/compound-(v04|goal)\.spec\.ts/,fullyParallel:true,retries:0,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3001',locale:'ko-KR',timezoneId:'Asia/Seoul',screenshot:'only-on-failure',trace:'retain-on-failure',hasTouch:true,launchOptions:process.env.ROX_CHROMIUM_EXECUTABLE?{executablePath:process.env.ROX_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:undefined},
 projects:[{name:'compound-functions',use:{viewport:{width:370,height:465}}}],
 webServer:{command:'VITE_DATA_SOURCE=api npm run dev -- --host 127.0.0.1 --port 3001',url:'http://127.0.0.1:3001',reuseExistingServer:!process.env.CI}
});
