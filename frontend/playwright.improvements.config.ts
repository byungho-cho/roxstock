import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/targets', testMatch: /improvements-12.*\.spec\.ts/, fullyParallel: false, workers:1, retries:0,
 outputDir: 'test-results/improvements-12', reporter:[['list'],['json',{outputFile:'test-results/improvements-12/results.json'}]],
 use:{baseURL:'http://127.0.0.1:3001',locale:'ko-KR',timezoneId:'Asia/Seoul',hasTouch:true,screenshot:'only-on-failure',
 launchOptions:process.env.ROX_CHROMIUM_EXECUTABLE?{executablePath:process.env.ROX_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{}},
 projects:[{name:'cover-370x465',use:{viewport:{width:370,height:465}}},{name:'tablet-725x396',use:{viewport:{width:725,height:396}}},{name:'large-1280x800',use:{viewport:{width:1280,height:800}}}],
 webServer:{command:'VITE_DATA_SOURCE=api npm run dev -- --host 127.0.0.1 --port 3001',url:'http://127.0.0.1:3001',reuseExistingServer:!process.env.CI},
});
