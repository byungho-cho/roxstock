import {ApiError} from '@roxstock/shared/lib/api-error';

export type BackupScope = 'FULL' | 'USER';

export function requestedBackupScope(body:unknown):BackupScope{
 if(body==null)return 'FULL'; // Existing clients posted without a body.
 if(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='scope'))throw new ApiError(400,'BACKUP_SCOPE','백업 종류를 확인해 주세요.');
 const scope=(body as {scope?:unknown}).scope;
 if(scope===undefined)return 'FULL';
 if(scope!=='FULL'&&scope!=='USER')throw new ApiError(400,'BACKUP_SCOPE','백업 종류를 확인해 주세요.');
 return scope;
}

/** Explicit personal-data boundary; public source data and collector state stay out. */
export const userBackupTables = [
 'auth_users','auth_sessions','auth_email_tokens','auth_retired_tokens','auth_invitations','auth_rate_limits',
 'accounts','watchlist_items','account_watchlist_items','trade_requests','buy_trades','sell_trades',
 'cash_transactions','dividends','daily_account_snapshots','daily_position_snapshots',
 'compound_growth_plans','compound_growth_goals','account_profit_revisions','investment_year_aggregates',
 'stock_news_scraps','stock_news_reads','app_notification_preferences','account_notification_preferences','app_push_devices',
 'app_target_notification_states','app_target_daily_maxima','app_notification_events','app_push_deliveries',
 'admin_user_read_audits',
] as const;

export function backupDumpArguments(url:URL,scope:BackupScope){
 const database=url.pathname.slice(1);
 if(!/^[a-zA-Z0-9_]+$/.test(database))throw new Error('INVALID_BACKUP_DATABASE');
 const common=['--protocol=tcp','--host='+url.hostname,'--port='+(url.port||3306),'--user='+decodeURIComponent(url.username),'--single-transaction','--quick','--hex-blob'];
 return scope==='USER'
  ? [...common,'--skip-triggers',database,...userBackupTables]
  : [...common,'--routines','--events','--triggers','--databases',database];
}

/** Filename, rather than backup kind, also supports pre-compression manual archives. */
export function backupContentType(filename:string){return filename.endsWith('.gz')?'application/gzip':'application/sql';}
