import {defineConfig} from '@playwright/test';
import base from './playwright.investment-empty.config';
export default defineConfig({...base,testMatch:'incremental-analysis.spec.ts',outputDir:'test-results/incremental-analysis',use:{...base.use,baseURL:'http://127.0.0.1:3038'},webServer:{command:'npm run build && npm run preview -- --host 127.0.0.1 --port 3038 --strictPort',url:'http://127.0.0.1:3038',reuseExistingServer:false,env:{VITE_DATA_SOURCE:'api'},timeout:120000}});
