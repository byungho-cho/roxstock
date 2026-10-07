import {defineConfig} from '@playwright/test';
import phase6 from './playwright.phase6.config';
export default defineConfig({...phase6,testMatch:'improvements-phase7.spec.ts',outputDir:'test-results/phase7',use:{...phase6.use,baseURL:'http://127.0.0.1:3007'},projects:[...phase6.projects!,{name:'large',use:{viewport:{width:1200,height:900}}}],webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3007',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3007',reuseExistingServer:!process.env.CI}});
