import {createHash} from 'node:crypto';
import {DartApiError} from './dart-provider.js';
import {collectorLog} from './logger.js';

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
 return {stage:safeStage,category,code,exceptionClass,message:`${safeStage}: ${reasons[category]}`,frames};
}
export async function recordDartFailure(error:unknown,stage:string,runId:bigint|undefined,writes:Array<{stage:string;write:(reason:string)=>Promise<unknown>}>) {
 const diagnostic=dartDiagnostic(error,stage),reason=`${diagnostic.code}: ${diagnostic.message}`;
 collectorLog('error','DART collector failure',{runId,...diagnostic});
 for(const write of writes)try{await write.write(reason);}catch(secondary){collectorLog('error','DART failure recording failed',{runId,primaryCode:diagnostic.code,...dartDiagnostic(secondary,write.stage)});}
 return diagnostic;
}
