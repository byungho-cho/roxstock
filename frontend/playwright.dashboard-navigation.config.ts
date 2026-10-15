import {defineConfig} from '@playwright/test';
import base from './playwright.phase6.config';
export default defineConfig({...base,testMatch:'dashboard-navigation.spec.ts',outputDir:'test-results/dashboard-navigation',use:{...base.use,baseURL:'http://127.0.0.1:3040'},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3040',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3040',reuseExistingServer:!process.env.CI}});
