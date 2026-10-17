type Result = {status:string;valuationStatus?:string;tasks?:{dart:{state:string};valuation:{state:string}}};
export function refreshOutcome(run:{status:string;refreshMode?:string;terminalCode?:string;counts?:{processed:number;valuationCompleted:number};results:Result[]}) {
  const completed=run.results.length===0&&run.counts?run.counts.valuationCompleted:run.results.filter(r=>{
    const valuation=r.tasks?.valuation.state??r.valuationStatus;
    const dart=r.tasks?.dart.state??r.status;
    return valuation==='SUCCESS'&&(run.refreshMode==='SUPPLEMENT'||!['FAILED','NO_DATA'].includes(dart));
  }).length;
  const failed=(run.results.length||run.counts?.processed||0)-completed;
  const missing=run.results.filter(r=>['PARTIAL','UNAVAILABLE','NO_DATA'].includes(r.tasks?.valuation.state??r.valuationStatus??'')).length;
  const interrupted=Boolean(run.terminalCode);
  const tone=completed===0?'neutral':failed||interrupted?'warning':'success';
  const severity: 'info'|'warning'|'success'=tone==='neutral'?'info':tone;
  const title=interrupted?'일부 처리 후 종료':completed===0?(run.results.length?'보완 미완료':'처리 결과 없음'):failed?'일부 보완 완료':run.refreshMode==='SUPPLEMENT'?'보완 완료':'갱신 완료';
  return {completed,failed,missing,tone,severity,title};
}
