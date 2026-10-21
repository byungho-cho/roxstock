import evidence from './fixtures/dart-followup-evidence-20261021.json' with {type:'json'};

export const followupProvenance={source:evidence.source,responseMetadataCommit:evidence.responseMetadataCommit,targetCommit:evidence.targetCommit,responseMetadataSha256:evidence.responseMetadataSha256,targetMetadataSha256:evidence.targetMetadataSha256};
type Identity={id:bigint;symbol:string;corpCode:string;fiscalYear:number;reportCode:string};
export function verifiedPolicyPeriod(task:Identity){
 const item=evidence.policy.find(p=>p.taskId===String(task.id)&&p.symbol===task.symbol&&p.corpCode===task.corpCode&&p.year===task.fiscalYear&&p.reportCode===task.reportCode);
 if(!item||item.periodEnd>='2024-11-06')return;
 return {...item,provenance:followupProvenance};
}
export function verifiedLegacyApiAbsence(task:Identity&{updatedAt:Date;selectedReceiptNo:string|null;lastAttemptAt:Date|null}){
 const item=evidence.financial.find(p=>p.taskId===String(task.id)&&p.symbol===task.symbol&&p.corpCode===task.corpCode&&p.year===task.fiscalYear&&p.reportCode===task.reportCode);
 if(!item||item.expectedUpdatedAt!==task.updatedAt.toISOString()||item.selectedReceiptNo!==task.selectedReceiptNo)return;
 if(item.responses.length!==2||new Set(item.responses.map(r=>r.fsDivision)).size!==2)return;
 if(!item.responses.every(r=>['CFS','OFS'].includes(r.fsDivision)&&r.httpStatus===200&&r.status==='013'&&r.rowCount===0&&r.corpCode===task.corpCode&&r.fiscalYear===task.fiscalYear&&r.reportCode===task.reportCode&&Number.isFinite(Date.parse(r.checkedAt))&&(!task.lastAttemptAt||Date.parse(r.checkedAt)>=task.lastAttemptAt.getTime())))return;
 return {availability:'API_DATA_UNAVAILABLE',supplementRequired:true,selectedReceiptNo:item.selectedReceiptNo,financialResponses:item.responses,provenance:followupProvenance};
}
