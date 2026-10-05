import assert from 'node:assert/strict';
// Wait for the exact merge SHA frontend/backend deployments and reuse existing value API verification.
await import('./value-deployment-smoke.mjs');
const get=async path=>{const r=await fetch('https://newrox.cafe24.com/api'+path,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,path);return (await r.json()).data;};
const accounts=await get('/accounts');assert.ok(Array.isArray(accounts));
for(const account of accounts.filter(a=>a.isActive).slice(0,2)){
 const data=await get('/accounts/'+account.id+'/compound-plans');
 assert.equal(data.accountId,account.id);assert.equal(data.basis.contributionTiming,'START_OF_YEAR');assert.equal(data.basis.inclusiveYears,true);assert.equal(data.basis.progressDenominator,'FINAL_TARGET');
 assert.ok(Number.isFinite(Date.parse(data.asOf)));assert.ok(Array.isArray(data.plans));
 for(const plan of data.plans){assert.equal(plan.duration,plan.endYear-plan.startYear+1);assert.equal(plan.goals.filter(g=>g.isDefault).length,plan.goals.length?1:0);
  for(const goal of plan.goals){assert.equal(goal.rows.length,plan.duration);assert.equal(goal.rows[0].year,plan.startYear);assert.equal(goal.rows.at(-1).year,plan.endYear);assert.equal(goal.finalTarget,goal.rows.at(-1).asset);assert.equal(goal.yearTarget,goal.rows.find(row=>row.year===data.currentYear)?.asset??null);}
 }
 console.log('Compound production read verified: account '+account.id+', '+data.plans.length+' plans, '+data.basis.contributionTiming);
}
const year=Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4)),values=await get('/value-analysis?year='+year);
assert.ok(values.rows.length>0);
for(const row of values.rows){for(const key of ['issuedShares','eps','excessEarnings','shareholderValue','capital','requiredReturn','fairPrices'])assert.ok(key in row,key);assert.equal(row.requiredReturn,'8.0');assert.equal(row.fairPrices.length,4);assert.equal(row.excessEarnings,null);assert.equal(row.shareholderValue,null);}
console.log('Value card production fields verified: '+values.rows.length+' master securities.');
