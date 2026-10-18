/** Only the persisted master type is authoritative. Names and collection failures are not classifiers. */
export function productPolicy(type?:string|null){
 const label=({REIT:'리츠',ETF:'ETF',ETN:'ETN'} as Record<string,string>)[type??''];
 if(!label)return {type:type??'UNKNOWN',label:null,held:false,reason:null,policy:'listed-products-v1'};
 return {type:type!,label,held:true,policy:'listed-products-v1',reason:type==='REIT'?'일반 기업과 결산 구조가 달라 일부 재무자료 수집과 가치지표 계산을 보류하고 있습니다.':'기업 재무제표 분석을 적용하지 않는 '+label+' 상품으로 재무자료 수집과 가치지표 계산을 보류하고 있습니다.'};
}
