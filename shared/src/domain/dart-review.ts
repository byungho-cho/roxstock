const labels:Record<string,string>={CURRENCY_MISSING:'공시 통화 누락 · 검증 보류',CURRENCY_MIXED:'동일 공시 통화 혼재 · 검증 보류',STORED_CURRENCY_CONFLICT:'기존 저장 통화와 공시 통화 불일치 · 검증 보류',AMOUNT_PRECISION_UNSUPPORTED:'원문 금액 저장 정밀도 검증 보류',CLOSING_MONTH_CHANGED:'결산월·회계기간 확인 필요',MULTIPLE_ANNUAL_PERIODS:'같은 해 복수 결산기간 확인 필요',CLOSING_MONTH_UNAVAILABLE:'결산월 판단 근거 부족',CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION:'내용 정정과 원본 자료 대조 필요',CORRECTION_RELATION_UNVERIFIED:'원본·정정 공시 연결 근거 부족'};
Object.assign(labels,{
 HISTORICAL_CORE_ACCOUNTS_INCOMPLETE:'핵심 재무 항목 확인 필요',
 RECEIPT_SELECTION_CHANGED_REVIEW_REQUIRED:'기존 공시와 새 공시의 정정 관계 확인 필요',
 DART_SOURCE_REVIEW:'공시 원문·보고기간·계정과목 검증 필요',
 HISTORICAL_SOURCE_UNAVAILABLE:'과거 재무 자료 또는 출처 식별 근거 미제공',
 EXISTING_FINANCIAL_DATA_PRESERVED:'기존 재무 자료 보존 · 추가 대조 필요',
 QUARTER_SOURCE_NOT_PROVIDED:'분기 자료 미제공 확인 · 해당 기간 수집 제외',
 HISTORICAL_QUARTER_UNAVAILABLE:'2022년까지의 분기 자료 수집 불가 확인 · 해당 기간 제외',
 FINANCIAL_ACCOUNT_SCHEMA_UNVERIFIED:'금융업 계정과목 대응 확인 필요',
 REPORT_PERIOD_UNVERIFIED:'공시 보고기간 확인 필요',
 API_ROWS_UNAVAILABLE:'대상 기간 재무 API 자료 미제공',
 OPERATING_PROFIT_STANDARD_ALIAS_MISSING:'영업이익 표준 계정 코드 미인식',
 PUBLIC_DOCUMENT_ACCOUNTS:'공시 원문의 핵심 계정·합계 검증 필요',
 PUBLIC_DOCUMENT_COLUMN_TERM:'공시 원문의 당기 열 표시와 보고기간 불일치',
});
export function dartReviewLabel(code:string):string|undefined{return Object.hasOwn(labels,code)?labels[code]:undefined;}
export function publicDartReview(value:unknown,fallbackCode?:string|null,taskSymbol?:string){
 const d=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const code=typeof d.validationResult==='string'&&/^[A-Z_]{1,64}$/.test(d.validationResult)?d.validationResult:fallbackCode&&dartReviewLabel(fallbackCode)?fallbackCode:null;
 const fields:Record<string,string>={totalAssets:'자산',totalLiabilities:'부채',totalEquity:'자본',operatingProfitYtd:'누적 영업이익',netIncomeYtd:'누적 순이익'};
 const missing=Array.isArray(d.missingFields)?d.missingFields.filter((k):k is string=>typeof k==='string'&&Object.hasOwn(fields,k)).map(k=>fields[k]):[];
 const symbolYear=taskSymbol?.match(/^[A-Z0-9]{6}:(\d{4}):\d{5}$/)?.[1];
 const resolution=d.resolutionStatus==='SUCCESS'?' · 후속 보완 완료':d.resolutionStatus==='EXCLUDED'?' · 현재 해당 기간 수집 제외':'';
 return {validationResult:code,message:(code?dartReviewLabel(code)??'공시 원본 검증 보류':'상세 사유 미기록')+(missing.length?' · 미확인: '+missing.join(', '):'')+resolution,requestedYear:typeof d.taskFiscalYear==='number'?d.taskFiscalYear:symbolYear?Number(symbolYear):null,candidatePeriod:typeof d.reportPeriod==='string'&&/^\d{4}-\d{2}$/.test(d.reportPeriod)?d.reportPeriod:null};
}
