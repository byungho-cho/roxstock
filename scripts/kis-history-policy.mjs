// KIS finance amounts are rounded hundred-million KRW, not precise won values.
export function won(value) {
  const text=String(value??'').replaceAll(',','').trim();
  if(!/^-?\d{1,24}(\.\d{1,4})?$/.test(text))return null;
  const [whole,fraction='']=text.replace('-','').split('.');
  return ((text.startsWith('-')?-1n:1n)*(BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0')))).toString();
}
export function anchorCheck(values,tables,periodEnd,periodType) {
  const ym=periodEnd?.slice(0,7).replace('-','');
  const mode=periodType==='ANNUAL'?'0':'1';
  const row=name=>tables.find(t=>t.mode===mode&&t.endpoint===name)?.rows.filter(r=>r.stac_yymm===ym);
  const b=row('balance-sheet'),i=row('income-statement');
  if(b?.length!==1||i?.length!==1)return {verified:false,reason:'KIS_PERIOD_NOT_AVAILABLE'};
  const anchors={totalAssets:won(b[0].total_aset),totalLiabilities:won(b[0].total_lblt),totalEquity:won(b[0].total_cptl),operatingProfitYtd:won(i[0].bsop_prti),netIncomeYtd:won(i[0].thtr_ntin)};
  for(const [key,value]of Object.entries(anchors)) {
    if(value===null||values[key]==null||! /^-?\d+$/.test(String(values[key])))return {verified:false,reason:'KIS_ANCHOR_INCOMPLETE'};
    const d=BigInt(value)-BigInt(values[key]);
    if(d>50000000n||d< -50000000n)return {verified:false,reason:'KIS_DART_VALUES_DIFFER'};
  }
  return {verified:true,reason:'KIS_DART_FIVE_ANCHORS_MATCH',ym,mode};
}
export const historyStatuses=['PENDING','FAILED','NO_FILING','DATA_UNAVAILABLE'];
export function quarterExclusion({year,period,annualVerified=false,cfsEmpty=false,ofsEmpty=false,noReport=false,noKisPeriod=false}){
  if(period==='ANNUAL'||!['Q1','Q2','Q3'].includes(period)||!Number.isInteger(year)||!(cfsEmpty&&ofsEmpty||noReport&&noKisPeriod))return null;
  return year<=2022?'HISTORICAL_QUARTER_UNAVAILABLE':annualVerified?'QUARTER_SOURCE_NOT_PROVIDED':null;
}
export function safeCode(error){const c=error?.code;return typeof c==='string'&&/^[A-Z0-9_]{1,64}$/.test(c)?c:'INTERNAL_OR_DB_ERROR';}
export function stopCode(code){return /^KIS_TOKEN_/.test(code)||['010','011','012','020','800','901','API_KEY_MISSING','DAILY_CALL_LIMIT','KIS_RATE_LIMIT','KIS_AUTH_OR_PERMISSION_FAILED','KIS_CREDENTIALS_MISSING','KIS_INVALID_TOKEN_RESPONSE','FINANCIAL_LEASE_LOST','HISTORY_STOPPED','SCHEDULE_WINDOW_ENDED'].includes(code);}
