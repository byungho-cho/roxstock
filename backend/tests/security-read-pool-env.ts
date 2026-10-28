// Deliberately exhaust the API's small shared pool in the integration test.
// Evaluated before Prisma imports; never used by application entry points.
const url=new URL(process.env.DATABASE_URL!);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!(url.pathname.endsWith('_test')||process.env.CI==='true'&&url.pathname==='/roxstock'))throw Error('Isolated test database only');
url.searchParams.set('connection_limit','2');
process.env.DATABASE_URL=url.toString();
