import {Prisma} from '../../shared/dist/generated/prisma/index.js';
const dec=v=>v==null?null:new Prisma.Decimal(v);
const close=(a,b)=>a!=null&&b!=null&&dec(a).minus(b).abs().lte('50000000');
/** Confirm fiscal period and unique DART division using independently reported balances and flows. */
export function annualSupplement(row,annualRows,filings){
 const original=row.values??{},provenance=row.provenance??{},supplemental=row.supplemental??{};
 const unchanged=reason=>({changed:false,reason});
 if(row.periodType!=='ANNUAL')return unchanged('ANNUAL_ONLY');
 const candidates=annualRows.filter(a=>a.source==='KIS_API'&&a.periodType==='ANNUAL'&&a.fiscalYear===row.fiscalYear&&a.stacYymm===`${row.fiscalYear}12`&&a.periodEnd===`${row.fiscalYear}-12-31`&&a.currency==='KRW');
 if(candidates.length!==1)return unchanged('KIS_MATCHING_YEAR_UNAVAILABLE');
 const a=candidates[0];
 const matches=filings.filter(f=>!f.isWithdrawn&&f.periodType==='ANNUAL'&&f.fiscalYear===row.fiscalYear&&f.periodEndDate.toISOString().slice(0,10)===a.periodEnd&&['OFS','CFS'].includes(f.fsDivision)&&close(a.equity,f.totalEquity)&&close(a.assets,f.totalAssets)&&close(a.netIncome,f.netIncomeYtd)&&close(a.revenue,f.revenueYtd));
 const byDivision=new Map();for(const f of matches)if(!byDivision.has(f.fsDivision))byDivision.set(f.fsDivision,f);
 if(byDivision.size!==1)return unchanged('KIS_DART_DIVISION_UNCONFIRMED');
 const f=[...byDivision.values()][0];
 if(provenance.fsDivision!==f.fsDivision||provenance.periodEnd!==a.periodEnd||provenance.receiptNo!==f.receiptNo)return unchanged('PERIOD_RECEIPT_MISMATCH');
 const values={...original},reasons={...row.reasons},perMetric={...provenance.perMetric};
 for(const key of ['eps','bps','roe','per','pbr'])if(original[key]!=null&&!perMetric[key]){const {perMetric:_,...basis}=provenance;perMetric[key]=basis;}
 const filled=[];
 const shares=supplemental.shares;
 for(const key of ['eps','bps','roe']){
  if(original[key]!=null||a[key]==null)continue;
  // EPS is provider reported, never net income / period-end outstanding shares.
  if(key==='bps'){
   if(f.fsDivision!=='OFS'||shares?.receiptNo!==f.receiptNo||shares.preferred!==false||!dec(shares.outstanding)?.gt(0)||!dec(a.equity)?.gt(0)||!dec(f.totalEquity).div(shares.outstanding).toDecimalPlaces(2).eq(dec(a.bps)))continue;
  }
  if(key==='roe'){
   const previous=filings.find(p=>p.periodType==='ANNUAL'&&p.fiscalYear===row.fiscalYear-1&&!p.isWithdrawn&&p.fsDivision===f.fsDivision);
   if(f.fsDivision!=='OFS'||previous?.totalEquity==null||!dec(previous.totalEquity).plus(f.totalEquity).gt(0)||!dec(f.netIncomeYtd).mul(200).div(dec(previous.totalEquity).plus(f.totalEquity)).toDecimalPlaces(2).eq(dec(a.roe)))continue;
  }
  values[key]=dec(a[key]).toString();delete reasons[key];filled.push(key);
  perMetric[key]={source:'KIS_API',kind:'FINAL_ANNUAL',fiscalYear:a.fiscalYear,periodType:'ANNUAL',flow:'ANNUAL',periodEnd:a.periodEnd,fsDivision:f.fsDivision,receiptNo:f.receiptNo,stacYymm:a.stacYymm,validation:'DART_BALANCE_AND_FLOW_RECONCILED',collectedAt:a.collectedAt,epsBasis:'KIS_REPORTED_EPS',...(key==='bps'?{bpsBasis:'OFS_TOTAL_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED',sharesReceiptNo:f.receiptNo}:{}),...(key==='roe'?{roeBasis:'TOTAL_SAME_DIVISION'}:{})};
 }
 if(!filled.length)return unchanged('NO_SAFE_MISSING_METRIC');
 return {changed:true,filled,data:{values,provenance:{...provenance,perMetric},reasons,supplemental:{...supplemental,kisAnnual:{...a,matchedReceiptNo:f.receiptNo,matchedDivision:f.fsDivision,filled,validation:'DART_BALANCE_AND_FLOW_RECONCILED'}}}};
}
