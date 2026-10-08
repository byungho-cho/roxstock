import {defineConfig} from '@playwright/test';
import base from './playwright.financial-ui.config';
export default defineConfig({...base,testMatch:['improvements-phase8.spec.ts','value-v04.spec.ts','user-fixes-20261006.spec.ts'],outputDir:'test-results/financial-regression',use:{...base.use,baseURL:'http://127.0.0.1:3012'},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3012 --strictPort',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3012',reuseExistingServer:false}});
