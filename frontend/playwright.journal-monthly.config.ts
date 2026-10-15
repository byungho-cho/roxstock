import {defineConfig} from '@playwright/test';
import config from './playwright.investment-empty.config';
export default defineConfig({...config,testMatch:'journal-v04.spec.ts',outputDir:'test-results/journal-monthly'});
