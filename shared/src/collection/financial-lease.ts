import {AsyncLocalStorage} from 'node:async_hooks';
import type {Prisma} from '../generated/prisma/index.js';

export const financialLeaseSeconds=90;
export const financialHeartbeatMs=20_000;
export class FinancialLeaseLost extends Error {readonly code='FINANCIAL_LEASE_LOST';constructor(){super('Financial execution ownership expired or changed');}}
type Lease={owner:string;taskId?:bigint};
const scope=new AsyncLocalStorage<Lease|undefined>();
export const withFinancialLease=<T>(owner:string,work:()=>Promise<T>,taskId?:bigint)=>scope.run({owner,taskId},work);
export const withoutFinancialLease=<T>(work:()=>Promise<T>)=>scope.run(undefined,work);
export const hasFinancialLease=()=>Boolean(scope.getStore());
/** Short write transactions only. Holding the lease row until commit fences old writers. */
export async function assertFinancialLease(tx:Prisma.TransactionClient){
 const lease=scope.getStore();if(!lease)return;
 const locks=await tx.$queryRaw<Array<{owner_token:string;valid:number}>>`SELECT owner_token, (locked_until > UTC_TIMESTAMP(3)) AS valid FROM collector_locks WHERE job_name='dart-financial-statements' FOR UPDATE`;
 if(locks[0]?.owner_token!==lease.owner||!locks[0]?.valid)throw new FinancialLeaseLost();
 if(lease.taskId!==undefined){
  const tasks=await tx.$queryRaw<Array<{owner_token:string;status:string;valid:number}>>`SELECT owner_token,status,(lease_until > UTC_TIMESTAMP(3)) AS valid FROM valuation_supplement_tasks WHERE id=${lease.taskId} FOR UPDATE`;
  if(tasks[0]?.owner_token!==lease.owner||tasks[0]?.status!=='PROCESSING'||!tasks[0]?.valid)throw new FinancialLeaseLost();
 }
}
