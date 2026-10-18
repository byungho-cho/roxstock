const labels:Record<string,string>={CLOSING_MONTH_CHANGED:'결산월·회계기간 확인 필요',MULTIPLE_ANNUAL_PERIODS:'같은 해 복수 결산기간 확인 필요',CLOSING_MONTH_UNAVAILABLE:'결산월 판단 근거 부족',CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION:'내용 정정과 원본 자료 대조 필요',CORRECTION_RELATION_UNVERIFIED:'원본·정정 공시 연결 근거 부족'};
export function publicDartReview(value:unknown){
 const d=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const code=typeof d.validationResult==='string'&&/^[A-Z_]{1,64}$/.test(d.validationResult)?d.validationResult:null;
 return {validationResult:code,message:code?labels[code]??'공시 원본 검증 보류':'상세 사유 미기록',requestedYear:typeof d.taskFiscalYear==='number'?d.taskFiscalYear:null,candidatePeriod:typeof d.reportPeriod==='string'&&/^\d{4}-\d{2}$/.test(d.reportPeriod)?d.reportPeriod:null};
}
