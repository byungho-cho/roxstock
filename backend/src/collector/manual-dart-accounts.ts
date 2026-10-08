import { normalizeDartFinancialRows, type DartFinancialRow } from './dart-provider.js';
/** Manual-only aliases: exact account names and statement divisions, never substring matching. */
export function normalizeManualDartAccounts(rows:DartFinancialRow[]) {
 const normalized=normalizeDartFinancialRows(rows);
 const aliases:Record<string,{statements:string[];names:string[]}>= {
  basicEps:{statements:['IS','CIS'],names:['기본주당이익','기본주당순이익','기본주당이익(손실)','기본주당손익','보통주기본주당이익','보통주 기본주당이익','기본주당이익(보통주)']},
  parentEquity:{statements:['BS'],names:['지배기업의 소유주에게 귀속되는 자본','지배기업 소유주지분','지배기업의 소유주지분','지배주주지분']},
  parentNetIncome:{statements:['IS','CIS'],names:['지배기업의 소유주에게 귀속되는 당기순이익','지배기업 소유주지분 순이익','지배기업의 소유주에게 귀속되는 당기순이익(손실)']},
 };
 for(const [key,rule] of Object.entries(aliases)) {
  if(normalized.accountSources[key]?.amount!=null)continue;
  const candidates=rows.filter(r=>rule.statements.includes(r.statementDivision)&&rule.names.includes(r.accountName)&&r.currency==='KRW');
  if(candidates.length!==1)continue;
  const r=candidates[0]!;normalized.accountSources[key]={statementDivision:r.statementDivision,accountId:r.accountId,accountName:r.accountName,amount:r.currentAmount,ytdAmount:r.currentYtdAmount};
 }
 return normalized;
}
