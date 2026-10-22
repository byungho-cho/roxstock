import {readFileSync} from 'node:fs';
// Only fixed route/status totals leave the runner; never output request IDs, headers or bodies.
export function summarizeBuyWrites(input){
 const requests=new Set(),statuses={},responseCodes={};
 for(const line of input.split('\n')){
  let row;try{row=JSON.parse(line);}catch{continue;}
  if(row.event==='BUY_WRITE_REJECTED'&&typeof row.code==='string'&&/^[A-Z][A-Z_]{0,63}$/.test(row.code))responseCodes[row.code]=(responseCodes[row.code]??0)+1;
  if(row.req?.method==='POST'&&String(row.req.url??'').split('?')[0]==='/api/buy-trades')requests.add(row.reqId);
  if(requests.has(row.reqId)&&Number.isInteger(row.res?.statusCode)){
   const key=String(row.res.statusCode);statuses[key]=(statuses[key]??0)+1;requests.delete(row.reqId);
  }
 }
 return {route:'POST /api/buy-trades',statuses,responseCodes,originalResponseCodesAvailable:Object.keys(responseCodes).length>0};
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href)console.log(JSON.stringify(summarizeBuyWrites(readFileSync(0,'utf8'))));
