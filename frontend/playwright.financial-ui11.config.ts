import {defineConfig} from '@playwright/test';
import base from './playwright.financial-ui.config';
export default defineConfig({...base,testMatch:['financial-ui11.spec.ts'],outputDir:'test-results/financial-ui11'});
