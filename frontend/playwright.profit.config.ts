import { defineConfig } from '@playwright/test';
import base from './playwright.gestures.config';
export default defineConfig({ ...base, testMatch: '**/profit-v04.spec.ts', use: { ...base.use, channel: 'chrome' } });
