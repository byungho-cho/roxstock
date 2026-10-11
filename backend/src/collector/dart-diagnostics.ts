import {createHash} from 'node:crypto';
import {DartApiError} from './dart-provider.js';
import {collectorLog} from './logger.js';


/** Explicit allowlist for public source identifiers; never accepts URL, message, headers or cause. */
export function safeDartContext(value: unknown): Record<string,string|number|string[]> {
 const raw=value && typeof value==='object'?value as Record<string,unknown>:{};
 const result:Record<string,string|number|string[]>={};
 const rules:Record<string,RegExp>={symbol:/^[A-Z0-9]{6,12}$/,corpCode:/^\d{8}$/,
  reportCode:/^1101[1234]$/,fsDivision:/^(CFS|OFS)$/,reportPeriod:/^\d{4}-\d{2}$/,
  selectedReceiptNo:/^\d{14}$/,returnedReceiptNo:/^\d{14}$/,
  selectedCorrectionType:/^(ORIGINAL|CONTENT|ATTACHMENT|ADDITION|WITHDRAWAL|UNKNOWN)$/,
  sourceCorrectionType:/^(ORIGINAL|CONTENT|ATTACHMENT|ADDITION|WITHDRAWAL|UNKNOWN)$/,
  validationResult:/^[A-Z_]{1,64}$/,originalCode:/^[A-Z0-9_]{1,64}$/,runId:/^\d{1,20}$/};
 for(const [key,rule] of Object.entries(rules))if(typeof raw[key]==='string'&&rule.test(raw[key]))result[key]=raw[key] as string;
 for(const key of ['taskFiscalYear','apiFiscalYear','attempt'])if(typeof raw[key]==='number'&&Number.isInteger(raw[key])&&Number(raw[key])>=0&&Number(raw[key])<=9999)result[key]=raw[key] as number;
 if(Array.isArray(raw.returnedReceiptNos))result.returnedReceiptNos=[...new Set(raw.returnedReceiptNos.filter((v):v is string=>typeof v==='string'&&/^\d{14}$/.test(v)))].slice(0,10);
 return result;
}

/** DB contract: keep complete identifiers; oversized/untrusted codes get a stable digest, never a prefix. */
export function storedDartCode(code: string): string {
 return /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'UNRECOGNIZED_'+createHash('sha256').update(code).digest('hex').slice(0,40);
}
export function dartDiagnostic(error: unknown, stage: string) {
 const e=error as {code?:unknown;errorCode?:unknown;name?:unknown;stack?:unknown}|null;
 const dbCode=typeof e?.code==='string'?e.code:typeof e?.errorCode==='string'?e.errorCode:'';
 const db=/^P\d{4}$/.test(dbCode)||['PrismaClientInitializationError','PrismaClientUnknownRequestError','PrismaClientValidationError','PrismaClientKnownRequestError'].includes(String(e?.name));
 const parsing=error instanceof SyntaxError||error instanceof RangeError||stage==='NORMALIZE'||stage==='CORP_PARSE';
 const category=db?'DATABASE':error instanceof DartApiError?/CORP|INVALID|COMPRESSION|XML/.test(error.code)?'PARSING':'DART_API':parsing?'PARSING':'INTERNAL';
 const code=db?(/^P\d{4}$/.test(dbCode)?dbCode:'DATABASE_ERROR'):error instanceof DartApiError?storedDartCode(error.code):category==='PARSING'?'NORMALIZE_ERROR':'INTERNAL_ERROR';
 const exceptionClass=db?'PrismaClientKnownRequestError':error instanceof DartApiError?'DartApiError':error instanceof SyntaxError?'SyntaxError':error instanceof RangeError?'RangeError':'Error';
 const safeStage=/^[A-Z_]{1,40}$/.test(stage)?stage:'UNKNOWN_STAGE';
 const reasons:Record<string,string>={DATABASE:'수집 상태 또는 자료를 DB에 저장하지 못했습니다.',PARSING:'응답 파싱·검증에 실패했습니다. 기존 자료는 유지됩니다.',DART_API:'DART 요청을 완료하지 못했습니다. 오류 코드를 확인해 주세요.',INTERNAL:'수집 내부 처리 중 오류가 발생했습니다.'};
 // Never serialize raw message, stack, cause, URL, SQL or Prisma meta. Only known source locations survive.
 const frames=typeof e?.stack==='string'?[...e.stack.matchAll(/(?:backend[\\/])?(?:src|dist)[\\/]collector[\\/]([a-z0-9-]+\.(?:ts|js)):(\d+):(\d+)/g)].slice(0,8).map(m=>`collector/${m[1]}:${m[2]}:${m[3]}`):[];
 return {context:error instanceof DartApiError?safeDartContext(error.diagnostics):{},stage:safeStage,category,code,exceptionClass,message:`${safeStage}: ${reasons[category]}`,frames};
}
export async function recordDartFailure(error:unknown,stage:string,runId:bigint|undefined,writes:Array<{stage:string;write:(reason:string)=>Promise<unknown>}>) {
 const diagnostic=dartDiagnostic(error,stage),reason=`${diagnostic.code}: ${diagnostic.message}`;
 collectorLog('error','DART collector failure',{runId,...diagnostic});
 for(const write of writes)try{await write.write(reason);}catch(secondary){collectorLog('error','DART failure recording failed',{runId,primaryCode:diagnostic.code,...dartDiagnostic(secondary,write.stage)});}
 return diagnostic;
}
