import {defineConfig} from '@playwright/test';
import base from './playwright.review-batch.config';
export default defineConfig({...base,testMatch:'portfolio-refresh.spec.ts'});
