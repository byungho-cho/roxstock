import {defineConfig} from '@playwright/test';
import base from './playwright.investment-empty.config';
export default defineConfig({...base,testMatch:['home-dashboard-empty.spec.ts','phase20-home.spec.ts','dashboard-navigation.spec.ts','phase30.spec.ts','home-performance.spec.ts','tuning-01.spec.ts'],outputDir:'test-results/home-dashboard-empty'});
