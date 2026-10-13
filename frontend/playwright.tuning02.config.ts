import {defineConfig} from '@playwright/test';
import base from './playwright.tuning.config';
export default defineConfig({...base,testMatch:'tuning-02.spec.ts',outputDir:'test-results/tuning-02'});
