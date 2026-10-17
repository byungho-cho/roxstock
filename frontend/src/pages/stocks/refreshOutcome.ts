type Result = {status:string;valuationStatus?:string;tasks?:{dart:{state:string};valuation:{state:string}}};
export function refreshOutcome(run:{status:string;refreshMode?:string;terminalCode?:string;results:Result[]}) {
  const completed=run.results.filter(r=>(r.tasks?.valuation.state??r.valuationStatus)==='SUCCESS').length;
  const missing=run.results.filter(r=>['PARTIAL','UNAVAILABLE','NO_DATA'].includes(r.tasks?.valuation.state??r.valuationStatus??'')).length;
  const valuationFailed=run.results.filter(r=>(r.tasks?.valuation.state??r.valuationStatus)==='FAILED').length;
  const disclosureFailed=run.results.filter(r=>(r.tasks?.dart.state??r.status)==='FAILED').length;
  const failed=valuationFailed+disclosureFailed;
  const interrupted=Boolean(run.terminalCode);
  const severity: 'error'|'warning'|'info'|'success'=run.status==='FAILED'?'error':failed||interrupted?'warning':missing?'info':'success';
  const title=run.status==='FAILED'?'수집 실패':interrupted?'일부 처리 후 종료':failed?'일부 수집 실패':run.refreshMode==='SUPPLEMENT'?'보완 수집 완료':run.status==='SKIPPED'?'공시 자료 없음':'갱신 완료';
  return {completed,missing,valuationFailed,disclosureFailed,severity,title};
}
