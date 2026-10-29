import {financialCurrency} from '@roxstock/shared/domain/financial-currency';
import {type DartFinancialFiling} from '@roxstock/shared/prisma';
import type {FiscalDuration} from '@roxstock/shared/domain/period-valuation';
const amount=(v:string|undefined)=>v?.replaceAll(',','').trim();
const date=(v:string)=>{const x=v.replaceAll('.','-');return /^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x?x:null;};
/** A dated flow and balance must both reconcile to the exact stored receipt and division. */
export function verifyFiscalDuration(f:DartFinancialFiling,rows:Record<string,string>[],symbol:string):FiscalDuration|undefined {
 const matched=rows.map<Record<string,string>>(r=>({...r,account_nm:(r.account_nm??'').replace(/\s/g,'')})).filter(r=>r.rcept_no===f.receiptNo&&r.bsns_year===String(f.fiscalYear)&&r.reprt_code===f.reportCode&&r.fs_div===f.fsDivision&&r.stock_code===symbol&&r.currency===financialCurrency(f));
 const end=f.periodEndDate.toISOString().slice(0,10);
 const balances=matched.filter(r=>r.sj_div==='BS'&&r.account_nm==='자본총계'&&amount(r.thstrm_amount)===f.totalEquity?.toString()&&date((r.thstrm_dt??'').replace(/\s*현재$/,''))===end);
 let balanceDerivation:FiscalDuration['balanceDerivation'];
 if(!balances.length&&!matched.some(r=>r.sj_div==='BS'&&r.account_nm==='자본총계')){
  const select=(name:string)=>matched.filter(r=>r.sj_div==='BS'&&r.account_nm===name&&date((r.thstrm_dt??'').replace(/\s*현재$/,''))===end),assets=select('자산총계'),liabilities=select('부채총계');
  if(assets.length===1&&liabilities.length===1&&f.totalAssets!=null&&f.totalLiabilities!=null&&f.totalEquity!=null&&amount(assets[0]!.thstrm_amount)===f.totalAssets.toString()&&amount(liabilities[0]!.thstrm_amount)===f.totalLiabilities.toString()&&f.totalAssets.minus(f.totalLiabilities).eq(f.totalEquity)){
   balanceDerivation={method:'EXACT_MATCHED_ASSETS_MINUS_LIABILITIES',assets:f.totalAssets.toString(),liabilities:f.totalLiabilities.toString(),equity:f.totalEquity.toString(),currency:financialCurrency(f)};
   balances.push({...assets[0]!,account_nm:'자본총계',thstrm_amount:f.totalEquity.toString(),frmtrm_dt:'',frmtrm_amount:''});
  }
 }
 if(balances.length!==1)return;
 // The major-account API dates describe the cumulative span; interim current amounts
 // may be a standalone quarter, so reconcile the cumulative amount when supplied.
 const income=matched.filter(r=>r.sj_div==='IS'&&/^당기순이익(?:\(손실\))?$/.test(r.account_nm??''));
 const value=(r:Record<string,string>)=>amount(f.periodType==='ANNUAL'?r.thstrm_amount:r.thstrm_add_amount??r.thstrm_amount);
 let flows=income.filter(r=>f.netIncomeYtd!=null&&value(r)===f.netIncomeYtd.toString());
 if(!income.length||f.netIncomeYtd==null||!income.some(r=>/^-?\d+(?:\.\d+)?$/.test(value(r)??''))){
  const revenue=matched.filter(r=>r.sj_div==='IS'&&/^(매출액|영업수익)$/.test(r.account_nm??'')&&f.revenueYtd!=null&&value(r)===f.revenueYtd.toString());
  const operating=matched.filter(r=>r.sj_div==='IS'&&/^영업이익(?:\(손실\))?$/.test(r.account_nm??'')&&f.operatingProfitYtd!=null&&value(r)===f.operatingProfitYtd.toString());
  if(!revenue.length||!operating.length)return;flows=[...revenue,...operating];
 }
 const ranges=new Set(flows.map(r=>r.thstrm_dt));if(ranges.size!==1)return;
 const parts=[...ranges][0]?.split(/\s*~\s*/);if(parts?.length!==2)return;
 const start=date(parts[0]!),finish=date(parts[1]!);if(!start||finish!==end||start>end)return;
 const [sy,sm]=start.split('-').map(Number),[ey,em]=end.split('-').map(Number);
 const months=(ey!-sy!)*12+em!-sm!+1;
 const days=(Date.parse(end)-Date.parse(start))/86400000+1;
 if(months<1||months>12||days>366||new Date(Date.UTC(ey!,em!,0)).toISOString().slice(0,10)!==end)return;
 const openingDate=new Date(Date.parse(start)-86400000).toISOString().slice(0,10),b=balances[0]!;
 const previous=date((b.frmtrm_dt??'').replace(/\s*현재$/,'')),openingEquity=amount(b.frmtrm_amount);
 return {method:'DART_MAJOR_ACCOUNTS_MATCH',receiptNo:f.receiptNo,fsDivision:f.fsDivision,start,end,months,...(!start.endsWith('-01')?{annualization:'ACT_365' as const,days}:{}),verifiedAt:new Date().toISOString(),...(balanceDerivation?{balanceDerivation}:{}),...(previous===openingDate&&openingEquity&&/^-?\d+$/.test(openingEquity)?{openingDate,openingEquity}:{})};
}
