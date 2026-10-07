import { defineConfig } from '@playwright/test';
import phase3 from './playwright.phase3.config';
export default defineConfig({ ...phase3, testMatch: /improvements-phase[34]\.spec\.ts/, outputDir:'test-results/phase4',
  projects:[{name:'cover',use:{viewport:{width:370,height:465},isMobile:true}},{name:'tablet',use:{viewport:{width:725,height:396},isMobile:true}},{name:'large',use:{viewport:{width:1200,height:900}}}],
});
