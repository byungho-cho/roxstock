import { defineConfig } from '@playwright/test';
import base from './playwright.targets.config';
export default defineConfig({ ...base, use: { ...base.use, hasTouch: true }, outputDir: 'test-results/stock-detail-refresh', reporter: [['list']] });
