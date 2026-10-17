import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {scanSupplementCandidates} from '../src/valuation-supplement-queue.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_valuation_queue_phase16_test'))throw Error('Dedicated fixture DB required');
const db=new PrismaClient({log:[{emit:'event',level:'query'}]});
let queries=0,keyPages=0,heapPeak=0;db.$on('query',e=>{queries++;if(e.query.startsWith('SELECT id FROM dart_financial_filings'))keyPages++;heapPeak=Math.max(heapPeak,process.memoryUsage().heapUsed);});
try{
 global.gc?.();const start=performance.now();
 const scanned=await scanSupplementCandidates(db,'memory-fixture',new Date());
 assert.equal(scanned,200);assert.equal(keyPages,2);assert.ok(queries<=650);
 const maxRssMiB=process.resourceUsage().maxRSS/1024,heapPeakMiB=heapPeak/1048576;
 assert.ok(heapPeakMiB<112);assert.ok(maxRssMiB<320);
 console.log(JSON.stringify({scanned,keyPages,queries,heapPeakMiB,maxRssMiB,elapsedMs:performance.now()-start,node:process.version,heapLimitMiB:128}));
}finally{await db.$disconnect();}
