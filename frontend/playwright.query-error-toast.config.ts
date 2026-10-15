import {defineConfig} from '@playwright/test';
import base from './playwright.incremental-analysis.config';
export default defineConfig({...base,testMatch:'query-error-toast.spec.ts',outputDir:'test-results/query-error-toast',use:{...base.use,baseURL:'http://127.0.0.1:3048'},webServer:{...base.webServer,command:'npm run build && npm run preview -- --host 127.0.0.1 --port 3048 --strictPort',url:'http://127.0.0.1:3048'}});
