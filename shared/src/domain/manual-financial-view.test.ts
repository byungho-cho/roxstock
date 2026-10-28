import test from 'node:test';import assert from 'node:assert/strict';
import {manualFinancialView} from './manual-financial-view.js';
test('period-local manual basis preserves unknown actual dates and never spills into an official different basis or period',()=>{
 const basis={kind:'MANUAL_PERIOD',periodKey:'2026:Q2',fsDivision:'CFS',currency:'KRW',periodEnd:null};
 const entry={periodKey:'2026:Q2',periodEnd:null,fsDivision:'CFS',currency:'KRW',value:'12',at:'2026-10-28T00:00:00Z'};
 const p={securityId:1n,fiscalYear:2026,periodType:'Q2',supplemental:{manualBasis:basis,manualFields:{revenueQuarter:entry}}};
 const fresh=manualFinancialView<any>([],[p]);assert.equal(fresh[0].revenue,'12');assert.equal(fresh[0].periodEndDate,undefined);
 assert.equal(manualFinancialView<any>([],[{...p,periodType:'Q1'}]).length,0);
 const official={fiscalYear:2026,periodType:'Q2',periodEndDate:'2026-06-30',currency:'KRW',basis:'CFS',revenue:'99',collectedAt:null,isDerived:false};assert.equal(manualFinancialView([official],[p])[0]!.revenue,'99');
 const legacy={...p,supplemental:{manualBasis:{...basis,kind:'ACTUAL',periodEnd:'2026-06-30'},manualFields:{revenueQuarter:{...entry,periodEnd:'2026-06-30'}}}};assert.equal(manualFinancialView([official],[legacy])[0]!.revenue,'12');
});
