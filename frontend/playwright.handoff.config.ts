import { defineConfig } from '@playwright/test';
import targets from './playwright.targets.config';

// Preserve all existing Cash, Journal and Compound assertions on the inherited four viewports.
export default defineConfig({
  ...targets,
  testMatch: /(cash-v04|journal-v04|compound-v04)\.spec\.ts/,
  outputDir: 'test-results/handoff-regression',
  reporter: [['list'], ['json', { outputFile: 'test-results/handoff-regression/results.json' }]],
  use: {
    ...targets.use,
    launchOptions: process.env.ROX_CHROMIUM_EXECUTABLE ? {
      executablePath: process.env.ROX_CHROMIUM_EXECUTABLE,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--disable-gpu-compositing', '--use-gl=disabled'],
    } : {},
  },
});
