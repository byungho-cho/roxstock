import {createInterface} from 'node:readline';
// Only fixed classifications and aggregate counts leave this stream. Never echo a row.
const allowed=new Set(['AUTH_COOKIE_MISSING','AUTH_COOKIE_INVALID','AUTH_SESSION_UNKNOWN','AUTH_SESSION_EXPIRED','AUTH_SESSION_REVOKED','AUTH_USER_DISABLED','AUTH_TOKEN_MISMATCH','AUTH_TOKEN_RETIRED','AUTH_TEMPORARY_EXPIRED']);
const pending=new Set(),counts={};let lines=0;
const add=key=>counts[key]=(counts[key]??0)+1;
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(++lines>10000)break;
 let row;try{row=JSON.parse(line);}catch{continue;}
 if(allowed.has(row.authEvent))add(row.authEvent);
 if(row.reqId&&['/api/auth/me','/api/auth/refresh'].includes(row.req?.url)){
  if(pending.size>=2000)pending.delete(pending.values().next().value);
  pending.add(row.reqId);
 }
 if(pending.has(row.reqId)&&Number.isInteger(row.res?.statusCode)){add(`authCheckHTTP${Math.floor(row.res.statusCode/100)}xx`);pending.delete(row.reqId);}
}
console.log(JSON.stringify({boundedLogLines:lines,counts,attribution:'Aggregate only; no incident-specific device/session correlation available.'}));
