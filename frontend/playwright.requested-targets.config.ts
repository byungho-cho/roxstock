import base from './playwright.targets.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,workers:2,timeout:25000,outputDir:'test-results/targets',reporter:[['list'],['json',{outputFile:'qa-targets-report/results.json'}],['html',{outputFolder:'qa-targets-report',open:'never'}]],use:{...base.use,video:'on',trace:'on',screenshot:'on'}, });
