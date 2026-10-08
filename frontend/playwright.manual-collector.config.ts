import {defineConfig} from '@playwright/test';
import base from './playwright.financial-ui.config';
export default defineConfig({...base,testMatch:['manual-collector.spec.ts','financial-ui11.spec.ts','financial-ui-center.spec.ts'],outputDir:'test-results/manual-collector',projects:[...base.projects!,{name:'desktop-1280x800',use:{viewport:{width:1280,height:800}}}]});
