import { defineConfig } from '@playwright/test';
import phase4 from './playwright.phase4.config';
export default defineConfig({
  ...phase4,
  use: {
    ...phase4.use,
    launchOptions: process.env.ROX_CHROMIUM_PATH ? {
      executablePath: process.env.ROX_CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu'],
    } : undefined,
  },
  testMatch: /improvements-phase5\.spec\.ts/,
  outputDir: 'test-results/phase5',
});
