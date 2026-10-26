import {won} from './kis-history-policy.mjs';

const flowFields={revenue:'sale_account',operatingProfit:'bsop_prti',netIncome:'thtr_ntin'};
const balanceFields={totalAssets:'total_aset',totalLiabilities:'total_lblt',totalEquity:'total_cptl'};
const same=(a,b,tolerance=50000000n)=>a!=null&&b!=null&&(BigInt(a)-BigInt(b)<=tolerance)&&(BigInt(a)-BigInt(b)>=-tolerance);
const meaningful=values=>Object.values(values).every(v=>v!=null)&&Object.values(values).some(v=>BigInt(v)!==0n);
const amounts=(row,fields)=>Object.fromEntries(Object.entries(fields).map(([k,col])=>[k,won(row?.[col])]));
function unique(e,endpoint,ym){const rows=e.kis.tables.filter(t=>t.mode==='1'&&t.endpoint===endpoint&&!t.error).flatMap(t=>t.rows??[]).filter(r=>r.stac_yymm===ym);return rows.length===1?rows[0]:null;}
function ytdProof(e,filings){
 for(const f of filings){
  if(f.securityId!==String(e.security.id)||f.collectionSymbol!==e.security.symbol||!['Q2','Q3'].includes(f.periodType)||f.sourceValidation?.currency!=='KRW'||f.sourceValidation?.version!==2||f.sourceValidation.taskFiscalYear!==f.fiscalYear||f.sourceValidation.returnedReceiptNo!==f.receiptNo||f.sourceValidation.fsDivision!==f.fsDivision||f.sourceValidation.reportPeriod!==String(f.periodEndDate).slice(0,7))continue;
  const row=unique(e,'income-statement',String(f.periodEndDate).slice(0,7).replace('-',''));if(!row)continue;
  const values=amounts(row,flowFields);if(!meaningful(values))continue;
  const names=['revenue','operatingProfit','netIncome'];
  if(names.every(k=>same(values[k],f[k==='revenue'?'revenueYtd':k+'Ytd']))&&names.some(k=>f[k==='revenue'?'revenueQuarter':k+'Quarter']!=null&&!same(values[k],f[k==='revenue'?'revenueQuarter':k+'Quarter'])))return {receiptNo:f.receiptNo,periodEnd:String(f.periodEndDate).slice(0,10),method:'SAME_COMPANY_DART_YTD_MATCH_DIFFERS_FROM_SINGLE_QUARTER',fsDivision:f.fsDivision};
 }
 return null;
}

/** References stay separate from DART filings. Zero-filled provider placeholders
 * never become assets; cumulative income never becomes single-quarter income. */
export function kisQuarterReference(target,e,known){
 const out={values:{},reasons:[],evidence:{}};
 if(![2023,2024].includes(target.fiscalYear)||!['Q1','Q2','Q3'].includes(target.periodType)||String(target.securityId)!==String(e.security.id))return {...out,reason:'TARGET_SCOPE_MISMATCH'};
 const year=target.fiscalYear,q=Number(target.periodType.slice(1)),ym=String(year)+String(q*3).padStart(2,'0'),periodEnd=new Date(Date.UTC(year,q*3,0)).toISOString().slice(0,10);
 let annual=[...known.filings,...known.references].find(f=>String(f.securityId)===String(target.securityId)&&f.fiscalYear===year&&f.periodType==='ANNUAL'&&String(f.periodEndDate).startsWith(year+'-12-31')&&((f.collectionSymbol===e.security.symbol&&f.sourceValidation?.currency==='KRW')||((!e.security.codeRevision||f.collectionSymbol===e.security.symbol)&&['KIS_API_REFERENCE','DART_PUBLIC_REFERENCE'].includes(f.source)&&f.sourceMetadata?.currency==='KRW')));
 // Old stored rows may predate sourceValidation. Revalidate their calendar end
 // with this run's exact official receipt; do not reuse their amounts or infer
 // historical closing from today's company profile.
 if(!annual&&Array.isArray(e.reports?.[year]))for(const r of e.reports[year]){
  if(r.withdrawn||r.periodType!=='ANNUAL'||r.selection?.version!==2||r.selection.periodError||r.selection.taskFiscalYear!==year||r.selection.periodEndDate!==year+'-12-31'||!r.selection.candidates?.length||r.selection.candidates.some(c=>c.corpCode!==e.security.corpCode))continue;
  const stored=known.filings.find(f=>String(f.securityId)===String(target.securityId)&&f.collectionSymbol===e.security.symbol&&f.fiscalYear===year&&f.periodType==='ANNUAL'&&f.receiptNo===r.receiptNo&&String(f.periodEndDate).startsWith(year+'-12-31'));
  if(stored){annual={...stored,source:'DART_FRESH_RECEIPT_CALENDAR_REVALIDATION'};break;}
 }
 if(!annual)return {...out,reason:'HISTORICAL_DECEMBER_CLOSING_NOT_VERIFIED'};
 const balanceRow=unique(e,'balance-sheet',ym),balance=amounts(balanceRow,balanceFields);
 if(meaningful(balance)&&BigInt(balance.totalAssets)>0n&&BigInt(balance.totalLiabilities)>=0n&&same(balance.totalAssets,(BigInt(balance.totalLiabilities)+BigInt(balance.totalEquity)).toString(),150000000n)){Object.assign(out.values,balance);out.evidence.balance={row:balanceRow,unit:'HUNDRED_MILLION_KRW',balanceToleranceWon:'150000000'};}
 else out.reasons.push(balanceRow&&Object.values(balance).every(v=>v==='0')?'KIS_BALANCE_ZERO_PLACEHOLDER':'KIS_BALANCE_UNAVAILABLE_OR_INVALID');
 const incomeRow=unique(e,'income-statement',ym),income=amounts(incomeRow,flowFields);
 if(!meaningful(income))out.reasons.push('KIS_INCOME_UNAVAILABLE_OR_ZERO_PLACEHOLDER');
 else if(q===1){Object.assign(out.values,income);out.evidence.income={method:'FIRST_QUARTER_EQUALS_YEAR_TO_DATE',current:incomeRow};}
 else{
  const proof=ytdProof(e,known.filings),previousYm=String(year)+String((q-1)*3).padStart(2,'0'),previousRow=unique(e,'income-statement',previousYm),previous=amounts(previousRow,flowFields);
  if(!proof)out.reasons.push('KIS_CUMULATIVE_INCOME_BASIS_NOT_VERIFIED');
  else if(!meaningful(previous))out.reasons.push('PREVIOUS_CUMULATIVE_INCOME_UNAVAILABLE');
  else{Object.assign(out.values,Object.fromEntries(Object.keys(flowFields).map(k=>[k,(BigInt(income[k])-BigInt(previous[k])).toString()])));out.evidence.income={method:'VERIFIED_YTD_MINUS_PREVIOUS_YTD',current:incomeRow,previous:previousRow,proof,roundingDifferenceToleranceWon:'100000000'};}
 }
 const fields=Object.keys(out.values);return {...out,reason:fields.length===6?'KIS_QUARTER_REFERENCE_COMPLETE':fields.length?'KIS_QUARTER_REFERENCE_PARTIAL':'KIS_QUARTER_NO_VERIFIABLE_FIELDS',periodEnd,quarterStart:year+'-'+String((q-1)*3+1).padStart(2,'0')+'-01',annualBasis:{source:annual.source??'OPEN_DART',periodEnd:String(annual.periodEndDate).slice(0,10),receiptNo:annual.receiptNo??null},complete:fields.length===6};
}
