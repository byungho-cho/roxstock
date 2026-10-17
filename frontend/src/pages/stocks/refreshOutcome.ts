type Result = {status:string;valuationStatus?:string;tasks?:{dart:{state:string};valuation:{state:string}}};
export function refreshOutcome(run:{status:string;refreshMode?:string;terminalCode?:string;counts?:{processed:number;valuationCompleted:number;disclosureFailed?:number;supplementFailed?:number};results:Result[]}) {
  const completed=run.results.length===0&&run.counts?run.counts.valuationCompleted:run.results.filter(r=>{
    const valuation=r.tasks?.valuation.state??r.valuationStatus;
    const dart=r.tasks?.dart.state??r.status;
    return valuation==='SUCCESS'&&(run.refreshMode==='SUPPLEMENT'||!['FAILED','NO_DATA'].includes(dart));
  }).length;
  const failed=run.results.length===0&&run.counts?Math.min(run.counts.processed-completed,(run.refreshMode==='SUPPLEMENT'?0:run.counts.disclosureFailed??0)+(run.counts.supplementFailed??0)):run.results.filter(r=>(r.tasks?.valuation.state??r.valuationStatus)==='FAILED'||run.refreshMode!=='SUPPLEMENT'&&(r.tasks?.dart.state??r.status)==='FAILED').length;
  const missing=run.results.length===0&&run.counts?Math.max(0,run.counts.processed-completed-failed):run.results.filter(r=>!((r.tasks?.valuation.state??r.valuationStatus)==='FAILED'||run.refreshMode!=='SUPPLEMENT'&&(r.tasks?.dart.state??r.status)==='FAILED')&&(['PARTIAL','UNAVAILABLE','NO_DATA'].includes(r.tasks?.valuation.state??r.valuationStatus??'')||run.refreshMode!=='SUPPLEMENT'&&(r.tasks?.dart.state??r.status)==='NO_DATA')).length;
  const interrupted=Boolean(run.terminalCode);
  const tone=missing||interrupted||failed&&completed?'warning':completed===0?'neutral':'success';
  const severity: 'info'|'warning'|'success'=tone==='neutral'?'info':tone;
  const title=interrupted?'일부 처리 후 종료':missing?'일부 자료 부족':completed===0?(run.results.length?'보완 미완료':'처리 결과 없음'):failed?'일부 보완 완료':run.refreshMode==='SUPPLEMENT'?'보완 완료':'갱신 완료';
  return {completed,failed,missing,tone,severity,title};
}
