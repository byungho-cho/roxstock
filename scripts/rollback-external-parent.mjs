import {readFileSync} from 'node:fs';import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);if(i<0||!args[i+1])throw Error('REQUIRED '+k);return args[i+1];};
const symbol=arg('--symbol'),dir=arg('--output-dir'),apply=args.includes('--apply');if(!/^\d[A-Z0-9]{5}$/.test(symbol))throw Error('INVALID_SYMBOL');
if(apply&&process.env.NODE_ENV==='production'&&!args.includes('--production'))throw Error('PRODUCTION_FLAG_REQUIRED');
const root=process.env.ROXSTOCK_RUNTIME_ROOT??fileURLToPath(new URL('..',import.meta.url)),load=p=>import(pathToFileURL(resolve(root,p)).href);
const {PrismaClient}=await load('shared/dist/generated/prisma/index.js'),{PrismaCollectorRepository}=await load('collector/dist/repository.js');
const {withFinancialLease,assertFinancialLease}=await load('shared/dist/collection/financial-lease.js');
const hash=x=>createHash('sha256').update(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v)).digest('hex');
const before=JSON.parse(readFileSync(resolve(dir,'before-'+symbol+'.json'))),after=JSON.parse(readFileSync(resolve(dir,'after-'+symbol+'.json'))),db=new PrismaClient(),locks=new PrismaCollectorRepository(db),owner='external-parent-rollback-'+randomUUID();let locked=false;
try{const key={securityId:BigInt(before.row.securityId),fiscalYear:2025,periodType:'ANNUAL'},current=await db.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:key}}),f=await db.dartFinancialFiling.findUniqueOrThrow({where:{id:BigInt(before.filingId)}});
 const allowed=hash(current)===hash(after.row)&&hash(f)===before.filingHash;console.log(JSON.stringify({symbol,canRestore:allowed,apply}));if(!allowed)throw Error('ROW_CHANGED_AFTER_FILL');
 if(apply){locked=await locks.acquireLock('dart-financial-statements',owner,180);if(!locked)throw Error('LEASE_BUSY');await withFinancialLease(owner,()=>db.$transaction(async tx=>{await assertFinancialLease(tx);const latest=await tx.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:key}});if(hash(latest)!==hash(after.row)||hash(await tx.dartFinancialFiling.findUniqueOrThrow({where:{id:BigInt(before.filingId)}}))!==before.filingHash)throw Error('ROW_CHANGED_AFTER_FILL');await tx.periodValuation.update({where:{securityId_fiscalYear_periodType:key},data:{values:before.row.values,provenance:before.row.provenance,reasons:before.row.reasons,supplemental:before.row.supplemental}});}));console.log(JSON.stringify({symbol,restored:true}));}
}finally{if(locked)await locks.releaseLock('dart-financial-statements',owner);await db.$disconnect();}
