import {defineConfig} from '@playwright/test';
import base from './playwright.phase6.config';
export default defineConfig({...base,testMatch:'improvements-phase8.spec.ts',outputDir:'test-results/phase8',use:{...base.use,baseURL:'http://127.0.0.1:3008'},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3008',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3008',reuseExistingServer:false}});
