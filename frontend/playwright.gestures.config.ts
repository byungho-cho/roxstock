import { defineConfig } from '@playwright/test';
import base from './playwright.stock-detail.config';
export default defineConfig({
  ...base,
  projects: base.projects?.filter(project => ['cover-370x465', 'tablet-725x396'].includes(project.name!)),
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 3001 --strictPort', env: { VITE_DATA_SOURCE: 'api' }, url: 'http://127.0.0.1:3001', reuseExistingServer: false },
});
