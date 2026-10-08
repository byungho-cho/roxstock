import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import {
  DartApiError,
  OpenDartProvider,
  mapPeriodicReports,
  normalizeDartFinancialRows,
  parseDartCorpCodeXml,
  unzipDartCorpCodeXml,
  type DartFinancialRow,
} from './dart-provider.js';

const zipXml = (xml: string): Uint8Array => {
  const name = Buffer.from('CORPCODE.xml');
  const source = Buffer.from(xml);
  const compressed = deflateRawSync(source);
  const local = Buffer.alloc(30 + name.length + compressed.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(source.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  compressed.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
};

test('Open DART corporation-code ZIP maps only exact six-digit listed stock codes', () => {
  const xml = '<result><list><corp_code>00126380</corp_code><corp_name>삼성전자&amp;Co</corp_name><stock_code>005930</stock_code><modify_date>20260930</modify_date></list><list><corp_code>00000001</corp_code><corp_name>비상장</corp_name><stock_code></stock_code><modify_date>20260930</modify_date></list></result>';
  const result = parseDartCorpCodeXml(unzipDartCorpCodeXml(zipXml(xml)));
  assert.deepEqual(result, [{ corpCode: '00126380', corpName: '삼성전자&Co', stockCode: '005930', modifiedDate: '20260930' }]);
});

test('periodic report matching preserves amended receipt and drops withdrawn latest copy', () => {
  const reports = [
    { rcept_no: '20250314001001', rcept_dt: '20250314', report_nm: '사업보고서 (2024.12)' },
    { rcept_no: '20250314001002', rcept_dt: '20250314', report_nm: '분기보고서 (2024.09)' },
    { rcept_no: '20250314001003', rcept_dt: '20250314', report_nm: '반기보고서 (2024.06)' },
    { rcept_no: '20250314001004', rcept_dt: '20250314', report_nm: '분기보고서 (2024.03)' },
    { rcept_no: '20250315001001', rcept_dt: '20250315', report_nm: '[기재정정] 사업보고서 (2024.12)' },
    { rcept_no: '20250316001001', rcept_dt: '20250316', report_nm: '[철회] 사업보고서 (2024.12)', rm: '철회' },
  ];
  const result = mapPeriodicReports(reports, 2024);
  assert.deepEqual(result.map((item) => [item.reportCode, item.periodType, item.receiptNo]), [
    ['11013', 'Q1', '20250314001004'],
    ['11012', 'Q2', '20250314001003'],
    ['11014', 'Q3', '20250314001002'],
    ['11011', 'ANNUAL', '20250315001001'],
  ]);
});

test('period matching supports fiscal years ending in March', () => {
  const reports = [
    { rcept_no: '20250501000001', rcept_dt: '20250501', report_nm: '사업보고서 (2025.03)' },
    { rcept_no: '20241101000001', rcept_dt: '20241101', report_nm: '분기보고서 (2024.12)' },
    { rcept_no: '20240801000001', rcept_dt: '20240801', report_nm: '반기보고서 (2024.09)' },
    { rcept_no: '20240501000001', rcept_dt: '20240501', report_nm: '분기보고서 (2024.06)' },
  ];
  assert.deepEqual(mapPeriodicReports(reports, 2025).map((item) => item.reportCode), ['11013', '11012', '11014', '11011']);
});

test('financial mapping keeps source accounts, signed amounts, and unknown metrics null', () => {
  const rows: DartFinancialRow[] = [
    { receiptNo: '20250314001001', fiscalYear: 2024, reportCode: '11013', corpCode: '00126380', statementDivision: 'IS', statementName: '손익계산서', accountId: 'ifrs-full_Revenue', accountName: '매출액', currentAmount: '10,000', currentYtdAmount: '10,000', currency: 'KRW' },
    { receiptNo: '20250314001001', fiscalYear: 2024, reportCode: '11013', corpCode: '00126380', statementDivision: 'IS', statementName: '손익계산서', accountId: 'dart_OperatingIncomeLoss', accountName: '영업이익', currentAmount: '-2,000', currentYtdAmount: '-2,000', currency: 'KRW' },
    { receiptNo: '20250314001001', fiscalYear: 2024, reportCode: '11013', corpCode: '00126380', statementDivision: 'BS', statementName: '재무상태표', accountId: 'ifrs-full_Assets', accountName: '자산총계', currentAmount: '1,000,000', currentYtdAmount: null, currency: 'KRW' },
  ];
  const result = normalizeDartFinancialRows(rows);
  assert.equal(result.revenueQuarter, '10000');
  assert.equal(result.operatingProfitQuarter, '-2000');
  assert.equal(result.totalAssets, '1000000');
  assert.equal(result.totalEquity, null);
  assert.equal(result.accountSources.revenue?.accountId, 'ifrs-full_Revenue');
  const annual = normalizeDartFinancialRows([{ ...rows[0]!, reportCode: '11011', currentAmount: '50,000', currentYtdAmount: null }]);
  assert.equal(annual.revenueYtd, '50000');
});

test('Open DART counts no-data responses and enforces the wait after a completed response', async () => {
  let calls = 0;
  const delays: number[] = [];
  const statuses: string[] = [];
  const provider = new OpenDartProvider({
    apiKey: 'test-secret', dailyCallLimit: 3000, minDelayMs: 5000, reserveCall: async () => true,
    onApiStatus: async (status) => { statuses.push(status); }, sleepFn: async (ms) => { delays.push(ms); },
    fetchFn: async () => {
      calls += 1;
      return new Response(JSON.stringify(calls === 1 ? { status: '000', list: [], total_page: '2' } : { status: '013', message: 'no data' }));
    },
  });
  const reports = await provider.listPeriodicReports('00126380', 2024);
  assert.deepEqual(reports, []);
  assert.equal(calls, 2);
  assert.deepEqual(statuses, ['013']);
  assert.ok(delays.length === 1 && delays[0]! > 0);
});

test('Open DART quota errors stop safely and do not expose the API key', async () => {
  const provider = new OpenDartProvider({
    apiKey: 'do-not-log-this-key', dailyCallLimit: 3000, minDelayMs: 5000, reserveCall: async () => true,
    fetchFn: async () => new Response(JSON.stringify({ status: '020', message: 'quota exceeded' })),
  });
  await assert.rejects(provider.listPeriodicReports('00126380', 2024), (error: unknown) => {
    assert.ok(error instanceof DartApiError);
    assert.equal(error.code, '020');
    assert.equal(error.quotaExceeded, true);
    assert.equal(error.message.includes('do-not-log-this-key'), false);
    return true;
  });
});

test('Open DART does not reserve a request after a window closes or the daily quota is exhausted', async () => {
  let fetches = 0;
  let reservations = 0;
  const provider = new OpenDartProvider({ apiKey: 'test', dailyCallLimit: 1, minDelayMs: 5000, reserveCall: async () => { reservations += 1; return false; }, isCallAllowed: () => true, fetchFn: async () => { fetches += 1; return new Response('{}'); } });
  await assert.rejects(provider.fetchFinancials('00126380', 2024, '11011', 'CFS'), (error: unknown) => error instanceof DartApiError && error.code === 'DAILY_CALL_LIMIT');
  assert.equal(reservations, 1);
  assert.equal(fetches, 0);
  const closed = new OpenDartProvider({ apiKey: 'test', dailyCallLimit: 1, minDelayMs: 5000, reserveCall: async () => { reservations += 1; return true; }, isCallAllowed: () => false, fetchFn: async () => { fetches += 1; return new Response('{}'); } });
  await assert.rejects(closed.fetchFinancials('00126380', 2024, '11011', 'OFS'), (error: unknown) => error instanceof DartApiError && error.code === 'SCHEDULE_WINDOW_ENDED');
  assert.equal(fetches, 0);
});


test('financial no-data is empty but malformed successful lists remain diagnostic errors', async () => {
  for (const [body, malformed] of [[{status:'013'},false],[{status:'000',list:{}},true]] as const) {
    const provider = new OpenDartProvider({apiKey:'test',dailyCallLimit:10000,minDelayMs:2000,reserveCall:async()=>true,fetchFn:async()=>new Response(JSON.stringify(body))});
    if (malformed) await assert.rejects(provider.fetchFinancials('00126380',2015,'11012','CFS'),(error:unknown)=>error instanceof DartApiError && error.code==='INVALID_JSON');
    else assert.deepEqual(await provider.fetchFinancials('00126380',2015,'11012','CFS'),[]);
  }
});

test('historical report search includes late amendments after the following June', async () => {
  let end='';
  const provider = new OpenDartProvider({apiKey:'test',dailyCallLimit:10000,minDelayMs:2000,reserveCall:async()=>true,fetchFn:async(url)=>{
    end = new URL(String(url)).searchParams.get('end_de')??'';
    return new Response(JSON.stringify({status:'000',total_page:1,list:[{rcept_no:'20260901000001',rcept_dt:'20260901',report_nm:'[기재정정] 사업보고서 (2015.12)'}]}));
  }});
  const reports = await provider.listPeriodicReports('00126380',2015);
  assert.ok(end>'20160630');
  assert.equal(reports[0]?.receiptNo,'20260901000001');
});

test('corporation errors, empty lists and malformed responses are never successful replacements',async()=>{
 for(const status of ['010','011','020']){
  const api=new OpenDartProvider({apiKey:'fixture',dailyCallLimit:10,minDelayMs:1,reserveCall:async()=>true,fetchFn:async()=>new Response(`<result><status>${status}</status><message>secret</message></result>`) });
  await assert.rejects(api.fetchCorporations(),(e:unknown)=>e instanceof DartApiError&&e.code===status&&!e.message.includes('secret'));
 }
 for(const xml of ['<result></result>','<result><list></list></result>','<result><list></result>','<html>error</html>'])assert.throws(()=>parseDartCorpCodeXml(xml),DartApiError);
 const api=new OpenDartProvider({apiKey:'fixture',dailyCallLimit:10,minDelayMs:1,reserveCall:async()=>true,fetchFn:async()=>new Response(new Uint8Array([80,75,0,0]))});
 await assert.rejects(api.fetchCorporations(),DartApiError);
});
