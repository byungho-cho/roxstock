import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {prisma} from '../lib/prisma.js';
import {PrismaDartRepository} from '../collector/dart-repository.js';
import {OpenDartProvider} from '../collector/dart-provider.js';
import {loadCollectorConfig} from '../collector/config.js';
import {recordDartFailure,dartDiagnostic} from '../collector/dart-diagnostics.js';
import {collectorLog as log} from '../collector/logger.js';

// Explicit operator command: one validated corporation-list refresh; no task reset or financial recollection.
const repo=new PrismaDartRepository(prisma),owner=randomUUID();let locked=false,stage='CORP_FETCH';
try {
 if(!process.argv.includes('--apply'))throw Error('Explicit --apply is required');
 const config=loadCollectorConfig();
 locked=await repo.acquireLock(owner,900);if(!locked)throw Error('Collector lock is busy; retry after active cycle finishes');
 const before={mappings:await prisma.dartCorpMapping.count(),filings:await prisma.dartFinancialFiling.count()};
 const provider=new OpenDartProvider({apiKey:process.env.DART_API_KEY?.trim()??'',dailyCallLimit:config.dartBackfillDailyCallLimit,minDelayMs:config.dartBackfillMinDelayMs,reserveCall:limit=>repo.reserveApiCall(limit,new Date(),owner),onApiStatus:status=>repo.recordApiResult(status==='013'?'NO_DATA':'ERROR').then(()=>undefined)});
 const rows=await provider.fetchCorporations();stage='CORP_SYNC';
 const result=await repo.syncCorporations(rows);
 const after={mappings:await prisma.dartCorpMapping.count(),filings:await prisma.dartFinancialFiling.count()};
 log('info','DART mapping recovery verified',{before,validatedRows:rows.length,result,after});
}catch(error){await recordDartFailure(error,stage,undefined,[]);process.exitCode=1;}
finally{if(locked)try{await repo.releaseLock(owner);}catch(error){log('error','DART recovery lock release failed',dartDiagnostic(error,'LOCK_RELEASE'));process.exitCode=1;}await prisma.$disconnect();}
