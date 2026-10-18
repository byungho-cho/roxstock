import { normalizeDartFinancialRows, type DartFinancialRow } from './dart-provider.js';
/** Shared supplemental aliases for automatic and manual collection: exact account names and statement divisions, never substring matching. */
export function normalizeManualDartAccounts(rows:DartFinancialRow[],periodEnd?:Date,fiscalOpeningDate?:string) {
 const normalized=normalizeDartFinancialRows(rows);
 const aliases:Record<string,{statements:string[];names:string[]}>= {
  basicEps:{statements:['IS','CIS'],names:['기본주당이익','기본주당순이익','기본주당이익(손실)','기본주당손익','보통주기본주당이익','보통주 기본주당이익','기본주당이익(보통주)']},
  parentEquity:{statements:['BS'],names:['지배기업의 소유주에게 귀속되는 자본','지배기업 소유주지분','지배기업의 소유주지분','지배주주지분']},
  parentNetIncome:{statements:['IS','CIS'],names:['지배기업의 소유주에게 귀속되는 당기순이익','지배기업 소유주지분 순이익','지배기업의 소유주에게 귀속되는 당기순이익(손실)']},
 };
 for(const [key,rule] of Object.entries(aliases)) {
  if(normalized.accountSources[key]?.amount!=null)continue;
  const candidates=rows.filter(r=>rule.statements.includes(r.statementDivision)&&rule.names.includes(r.accountName)&&r.currency===rows[0]?.currency);
  if(candidates.length!==1)continue;
  const r=candidates[0]!;normalized.accountSources[key]={statementDivision:r.statementDivision,accountId:r.accountId,accountName:r.accountName,amount:r.currentAmount,ytdAmount:r.currentYtdAmount};
 }
 for(const [current,opening] of [['totalEquity','openingTotalEquity'],['parentEquity','openingParentEquity']] as const){
  const source=normalized.accountSources[current];
  const matches=rows.filter(r=>r.statementDivision==='BS'&&r.currency===rows[0]?.currency&&r.accountId===source?.accountId&&r.accountName===source?.accountName&&r.previousAmount!=null&&(r.previousPeriodEnd!=null||r.previousPeriodSequential===true&&(fiscalOpeningDate!=null||r.reportCode==='11011'&&periodEnd?.toISOString().slice(5,10)==='12-31'&&periodEnd.getUTCFullYear()===r.fiscalYear)));
  if(matches.length===1){const r=matches[0]!;normalized.accountSources[opening]={statementDivision:r.statementDivision,accountId:r.accountId,accountName:r.accountName,amount:r.previousAmount!,ytdAmount:null,periodEnd:r.previousPeriodEnd??(r.previousPeriodSequential===true?fiscalOpeningDate:undefined)??`${r.fiscalYear-1}-12-31`};}
 }
 return normalized;
}
