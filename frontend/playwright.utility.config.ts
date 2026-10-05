import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/targets',testMatch:['utility-v04.spec.ts'],fullyParallel:true,retries:0,reporter:'list',outputDir:'test-results/utility',
 use:{baseURL:'http://127.0.0.1:3001',locale:'ko-KR',timezoneId:'Asia/Seoul',screenshot:'off',trace:'off'},
 projects:[{name:'cover-370',use:{viewport:{width:370,height:465}}},{name:'tablet-725',use:{viewport:{width:725,height:396}}},{name:'cover-400',use:{viewport:{width:400,height:640}}},{name:'tablet-816',use:{viewport:{width:816,height:616}}}],
 webServer:{command:'VITE_DATA_SOURCE=api npm run dev -- --host 127.0.0.1 --port 3001',url:'http://127.0.0.1:3001',reuseExistingServer:!process.env.CI}
});
