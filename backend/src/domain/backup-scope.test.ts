import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backupContentType,backupDumpArguments,requestedBackupScope,userBackupTables} from './backup-scope.js';

test('request scope preserves old clients and rejects arbitrary table or scope inputs',()=>{
 for(const body of [undefined,null,{}])assert.equal(requestedBackupScope(body),'FULL');
 assert.equal(requestedBackupScope({scope:'USER'}),'USER');assert.equal(requestedBackupScope({scope:'FULL'}),'FULL');
 for(const body of ['USER',[],{scope:null},{scope:'user'},{scope:'USER',tables:['securities']},{scope:'USER;DROP'}])assert.throws(()=>requestedBackupScope(body),{code:'BACKUP_SCOPE'});
});

test('personal backup covers ownership chains and excludes public data, routines and events',()=>{
 const url=new URL('mysql://backup:secret@127.0.0.1:3306/isolated_test');
 const args=backupDumpArguments(url,'USER');
 assert.equal(new Set(userBackupTables).size,userBackupTables.length);
 for(const table of ['auth_users','accounts','buy_trades','sell_trades','cash_transactions','dividends','daily_account_snapshots','compound_growth_goals','auth_retired_tokens','stock_news_scraps','stock_news_reads','app_push_deliveries'])assert.ok(args.includes(table));
 for(const value of ['securities','market_prices','financial_statements','period_valuations','dart_financial_filings','stock_news_items','collector_runs','--databases','--routines','--events','--triggers'])assert.ok(!args.includes(value),value);
 assert.ok(args.includes('--single-transaction'));assert.ok(args.includes('--skip-triggers'));assert.ok(!args.some(a=>a.includes('secret')));
 const full=backupDumpArguments(url,'FULL');assert.deepEqual(full.slice(-2),['--databases','isolated_test']);assert.ok(full.includes('--events'));assert.ok(!full.includes('accounts'));
 assert.throws(()=>backupDumpArguments(new URL('mysql://u:p@localhost/db%3Bother'),'USER'));
});

test('schema additions cannot silently omit a user/account-owned table from the personal backup',()=>{
 const schema=readFileSync(new URL('../../../database/prisma/schema.prisma',import.meta.url),'utf8');
 const models=[...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(m=>({name:m[1]!,body:m[2]!,table:m[2]!.match(/@@map\("([^"]+)"\)/)?.[1]}));
 for(const table of userBackupTables)assert.ok(models.some(m=>m.table===table),'Table missing from current schema: '+table);
 for(const model of models){
  // Administrator edits of shared financial data are public-data audit history, kept by FULL.
  if(model.name==='SecurityDataEdit')continue;
  if(/^\s*(userId|accountId|planId|buyTradeId|sessionId)\s/m.test(model.body))assert.ok(userBackupTables.includes(model.table as typeof userBackupTables[number]),'Review personal scope for '+model.name);
 }
 assert.equal(backupContentType('legacy.sql'),'application/sql');
 assert.equal(backupContentType('manual.sql.gz'),'application/gzip');
});
