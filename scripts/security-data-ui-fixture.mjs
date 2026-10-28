// Run inside the deployed backend via stdin. Creates no accounts and touches no real security.
// prepare/cleanup are explicit; a durable marker and symbol+inactive guard bound cleanup.
import {prisma} from './shared/dist/lib/prisma.js';
import {completedQuarters} from './shared/dist/domain/security-data.js';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
const marker='/tmp/roxstock-security-data-ui-fixture.json',action=process.env.SECURITY_DATA_UI_FIXTURE_ACTION;
try{
 if(action==='prepare'){
  if(existsSync(marker))throw Error('PREVIOUS_UI_FIXTURE_REQUIRES_CLEANUP');
  const symbol='UIT'+randomBytes(4).toString('hex').toUpperCase(),q=completedQuarters().at(-1);
  const s=await prisma.security.create({data:{symbol,name:'UI 검증용 임시 종목',marketType:'KOSPI',securityType:'STOCK',isActive:false}});
  const state={id:String(s.id),symbol,year:q.year,quarter:q.quarter};writeFileSync(marker,JSON.stringify(state),{mode:0o600});console.log(JSON.stringify(state));
 }else if(action==='cleanup'){
  if(!existsSync(marker)){console.log(JSON.stringify({alreadyClean:true}));}else{
   const state=JSON.parse(readFileSync(marker,'utf8')),id=BigInt(state.id),s=await prisma.security.findUnique({where:{id}});
   if(s&&(!/^UIT[A-F0-9]{8}$/.test(state.symbol)||s.symbol!==state.symbol||s.isActive||s.name!=='UI 검증용 임시 종목'))throw Error('FIXTURE_CLEANUP_GUARD');
   if(s)await prisma.$transaction(async tx=>{await tx.securityDataEdit.deleteMany({where:{securityId:id}});await tx.periodValuation.deleteMany({where:{securityId:id}});await tx.analysisRevision.deleteMany({where:{key:'security:'+id}});await tx.security.delete({where:{id}});});
   unlinkSync(marker);console.log(JSON.stringify({fixtureRemoved:true,existingSecuritiesUnchanged:true}));
  }
 }else throw Error('EXPLICIT_FIXTURE_ACTION_REQUIRED');
}finally{await prisma.$disconnect();}
