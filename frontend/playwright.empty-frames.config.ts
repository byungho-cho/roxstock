import {defineConfig} from '@playwright/test';
import config from './playwright.investment-empty.config';
export default defineConfig({...config,testMatch:['cash-empty-loading.spec.ts','investment-empty-loading.spec.ts','compound-stocks-empty.spec.ts','dashboard-navigation.spec.ts','home-dashboard-empty.spec.ts','home-performance.spec.ts'],outputDir:'test-results/empty-frames'});
