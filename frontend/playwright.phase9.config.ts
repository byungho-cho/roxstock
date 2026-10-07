import {defineConfig} from '@playwright/test';
import base from './playwright.phase6.config';
export default defineConfig({...base,testMatch:'improvements-phase9.spec.ts',outputDir:'test-results/phase9',use:{...base.use,launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:undefined,baseURL:'http://127.0.0.1:3009'},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 3009',env:{VITE_DATA_SOURCE:'api'},url:'http://127.0.0.1:3009',reuseExistingServer:false}});
