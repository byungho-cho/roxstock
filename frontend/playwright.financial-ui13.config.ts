import {defineConfig} from '@playwright/test';
import base from './playwright.financial-ui.config';
export default defineConfig({...base,testMatch:['financial-ui13.spec.ts','financial-ui11.spec.ts'],outputDir:'test-results/financial-ui13',projects:[...base.projects!,{name:'cover-430x932',testMatch:'financial-ui13.spec.ts',use:{viewport:{width:430,height:932}}},{name:'tablet-1024x768',testMatch:'financial-ui13.spec.ts',use:{viewport:{width:1024,height:768}}}]});
