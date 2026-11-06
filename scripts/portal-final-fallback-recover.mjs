/** Selective recovery: dry-run by default; exact post-image required. Uses the same financial lease. */
import {parse} from 'dotenv';
if(process.env.DATABASE_URL)process.env.DATABASE_URL=parse('V='+process.env.DATABASE_URL).V;
import {PrismaClient} from '../shared/dist/generated/prisma/index.js';
import {collectionClient} from '../shared/dist/lib/collection-client.js';
import {PrismaDartRepository} from '../collector/dist/dart-repository.js';
import {withFinancialLease} from '../shared/dist/collection/financial-lease.js';
import {withCollection} from '../shared/dist/collection/collection-policy.js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const args=process.argv,arg=k=>args[args.indexOf(k)+1];
if(!args.includes('--state')||!args.includes('--symbol'))throw Error('EXPLICIT_STATE_AND_SYMBOL_REQUIRED');
const dir=arg('--state'),symbol=arg('--symbol'),apply=args.includes('--apply'),db=collectionClient(new PrismaClient()),repo=new PrismaDartRepository(db),owner=randomUUID();
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
let locked=false;
try{
 if(!/^[0-9A-Z]{6}$/.test(symbol))throw Error('SYMBOL');
 const before=JSON.parse(await readFile(dir+'/'+symbol+'-before.json','utf8')),after=JSON.parse(await readFile(dir+'/'+symbol+'-after.json','utf8'));
 const s=await db.security.findUniqueOrThrow({where:{symbol}});
 if(String(s.id)!==before.securityId||before.fiscalYear!==2025||before.periodType!=='ANNUAL')throw Error('SCOPE');
 const restore=async tx=>{const where={securityId_fiscalYear_periodType:{securityId:s.id,fiscalYear:2025,periodType:'ANNUAL'}},now=await tx.periodValuation.findUniqueOrThrow({where});
  // Reject later edits, including provenance, status and timestamps. Never revert concurrent work.
  if(json(JSON.parse(json(now)))!==json(after))throw Error('POST_IMAGE_CHANGED');
  if(!apply)return {symbol,apply:false,fields:after.provenance.portalFinalFallback.fields};
  const {values,provenance,supplemental,reasons,status,attempts,nextAttemptAt}=before;
  const result=await tx.periodValuation.update({where,data:{values,provenance,supplemental,reasons,status,attempts,nextAttemptAt:nextAttemptAt?new Date(nextAttemptAt):null}});
  await writeFile(dir+'/'+symbol+'-recovered.json',json(result),{mode:0o600});return{symbol,apply:true,restored:true};
 };
 if(!apply)console.log(json(await restore(db)));
 else{locked=await repo.acquireLock(owner,90);if(!locked)throw Error('LEASE_BUSY');console.log(json(await withFinancialLease(owner,()=>withCollection(db,s.id,'valuation',()=>db.$transaction(restore),s))));}
}finally{if(locked)await repo.releaseLock(owner);await db.$disconnect();}
