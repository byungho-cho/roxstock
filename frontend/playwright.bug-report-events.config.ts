import {defineConfig} from '@playwright/test';
import base from './playwright.gestures.config';
export default defineConfig({...base,testMatch:'bug-report-events.spec.ts',use:{...base.use,channel:'chrome'},workers:2});
