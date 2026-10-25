import {won} from './kis-history-policy.mjs';
const fields={revenue:['income-statement','sale_account'],operatingProfit:['income-statement','bsop_prti'],netIncome:['income-statement','thtr_ntin'],totalAssets:['balance-sheet','total_aset'],totalLiabilities:['balance-sheet','total_lblt'],totalEquity:['balance-sheet','total_cptl']};
export function kisAnnualReference(tables,year){
 if(!Number.isInteger(year)||year<2023||year>2025)return {ok:false,reason:'OUTSIDE_APPROVED_YEARS'};
 const ym=year+'12',selected={};
 for(const endpoint of ['balance-sheet','income-statement']){
  const rows=tables.filter(t=>t.mode==='0'&&t.endpoint===endpoint).flatMap(t=>t.rows??[]).filter(r=>r.stac_yymm===ym);
  if(rows.length!==1)return {ok:false,reason:rows.length?'DUPLICATE_ANNUAL_PERIOD':'DECEMBER_ANNUAL_PERIOD_UNAVAILABLE'};
  selected[endpoint]=rows[0];
 }
 const values={},raw={};
 for(const [field,[endpoint,key]]of Object.entries(fields)){raw[field]=selected[endpoint][key];values[field]=won(raw[field]);}
 const missing=Object.keys(fields).filter(k=>values[k]===null);
 if(missing.length)return {ok:false,reason:'REQUIRED_ACCOUNTS_MISSING',missing};
 if(Object.values(values).some(v=>v.replace('-','').length>24))return {ok:false,reason:'AMOUNT_OUT_OF_STORAGE_RANGE'};
 if(BigInt(values.totalAssets)<0n||BigInt(values.totalLiabilities)<0n)return {ok:false,reason:'NEGATIVE_BALANCE_TOTAL'};
 // Printed decimal zeros do not prove sub-eok accuracy. Allow at most the
 // aggregate half-eok rounding bound of the three independently supplied totals.
 // Preserve the provider amounts and residual; never force the balance to match.
 const tolerance=150000000n,delta=BigInt(values.totalAssets)-BigInt(values.totalLiabilities)-BigInt(values.totalEquity);
 if(delta>tolerance||delta< -tolerance)return {ok:false,reason:'BALANCE_IDENTITY_MISMATCH',differenceWon:String(delta),toleranceWon:String(tolerance)};
 return {ok:true,year,periodEnd:year+'-12-31',values,metadata:{version:1,source:'KIS_API',kind:'HISTORICAL_REFERENCE',mode:'0',stacYymm:ym,currency:'KRW',originalAmountUnit:'HUNDRED_MILLION_KRW',storedAmountUnit:'KRW',amountMultiplier:'100000000',fsDivision:'UNVERIFIED',rounded:true,referenceOnly:true,raw,providerRows:selected,balanceDifferenceWon:String(delta),balanceToleranceWon:String(tolerance)}};
}
