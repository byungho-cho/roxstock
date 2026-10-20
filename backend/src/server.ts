import {startCollectionBugReporter} from './domain/collection-bug-reports.js';
import 'dotenv/config';

import { buildApp } from './app.js';
import { prisma } from './auth/scoped-db.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3300);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const app = buildApp();
let stopReports:(()=>Promise<void>)|undefined;
app.addHook('onClose',async()=>{await stopReports?.();});

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Shutting down server');
  await app.close();
  await prisma.$disconnect();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host, port });
  stopReports=startCollectionBugReporter(prisma,()=>app.log.error({code:'BUG_REPORT_SCAN_FAILED'},'오류 리포트 기록 실패; 다음 주기에 재시도합니다.'));
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
}
