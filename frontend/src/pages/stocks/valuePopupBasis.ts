import {number,type ValueDetail} from '../value/valueApi';
/** Describe the metric actually used by the existing fair-price API, never infer E from a chart label. */
export function valuePopupBasis(data?:ValueDetail):string {
 const v=data?.valuation;
 if(!v||!data?.fairPrices.some(p=>number(p.price)!==null))return '적정주가 계산 근거 부족';
 const year=v.fiscalYear??Number(v.metricDate?.slice(0,4));
 if(!year)return '계산 기준 미확인';
 if(v.kind==='ANNUAL_ESTIMATE')return year+'E 추정 기준';
 if(v.kind==='FINAL_ANNUAL')return year+'년 연간 실적 기준';
 if(v.kind==='REPORTED_INTERIM')return year+'년 '+(v.periodType??'분기')+' 실적 기준';
 return v.metricDate+' 지표 기준';
}
