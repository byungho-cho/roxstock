import { defineConfig } from '@playwright/test';
import improvements from './playwright.improvements.config';
import handoff from './playwright.handoff.config';

export default defineConfig({
  ...improvements,
  testMatch: /(profit-v04|investment-v04)\.spec\.ts/,
  outputDir: 'test-results/handoff-profit',
  reporter: [['list'], ['json', { outputFile: 'test-results/handoff-profit/results.json' }]],
  use: { ...improvements.use, launchOptions: handoff.use!.launchOptions },
});
