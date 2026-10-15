const unavailable=new Set(['NOT_PROVIDED','CONSENSUS_ITEM_NOT_PROVIDED','NO_FILING','NO_DATA','NOT_COLLECTED','NOT_APPLICABLE','EPS_NON_POSITIVE','BPS_NON_POSITIVE']);
/** A non-applicable ratio or an explicitly unavailable source item is not a collector failure. */
export function valueCollectionStatus(missing:Record<string,string|null>,row:{status:string;reasons:unknown;supplemental?:unknown}|undefined,tasks:{status:string;errorCode?:string|null}[]){
 const saved=row?.supplemental as {manualAttempt?:{errors?:Record<string,string>}}|null;
 const reasons=(row?.reasons&&typeof row.reasons==='object'&&!Array.isArray(row.reasons)?row.reasons:{}) as Record<string,string>;
 const errors=[...tasks.filter(t=>t.status==='FAILED'&&!unavailable.has(t.errorCode??'')).map(t=>t.errorCode??'COLLECTION_FAILED'),...Object.entries(saved?.manualAttempt?.errors??{}).filter(([,code])=>!unavailable.has(code)).map(([key,code])=>key+': '+code)];
 const codes=Object.values(reasons);
 if(row?.status==='FAILED'&&(!codes.length||codes.some(code=>!unavailable.has(code))))errors.push('VALUATION_FAILED');
 return {collectionStatus:errors.length?'ERROR':Object.values(missing).some(Boolean)?'PARTIAL':'COMPLETE',collectionErrors:errors};
}
