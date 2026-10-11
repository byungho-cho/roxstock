const reports:Record<string,string>={11011:'연간',11013:'1분기',11012:'반기',11014:'3분기',ANNUAL:'연간',Q1:'1분기',Q2:'반기',Q3:'3분기',Q4:'4분기',ALL:'전체 보고서'};
export function collectionTaskLabel(item:{symbol?:string;fiscalYear?:number;businessYear?:number;reportCode?:string;periodType?:string}){
 const parts=item.symbol?.split(':')??[];
 const year=item.fiscalYear??item.businessYear??(/^\d{4}$/.test(parts[1]??'')?Number(parts[1]):undefined);
 const code=item.reportCode??item.periodType??parts[2];
 return year?`${year}년 · ${reports[code??'']??'보고서 미확인'}`:code?reports[code]??'보고서 미확인':'';
}
