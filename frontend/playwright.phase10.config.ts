import {defineConfig} from '@playwright/test';
import base from './playwright.phase9.config';
export default defineConfig({...base,testMatch:['improvements-phase9.spec.ts','financial-ui-center.spec.ts'],outputDir:'test-results/phase10',use:{...base.use,baseURL:'http://127.0.0.1:3010'},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3010 --strictPort',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3010',reuseExistingServer:false}});
