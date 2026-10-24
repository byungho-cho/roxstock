import {Prisma} from '@roxstock/shared/prisma';
import type {PrismaClient} from '@roxstock/shared/prisma';
export const notificationFields=['enabled','buyEnabled','sellEnabled','dividendEnabled','newsEnabled','targetEnabled'] as const;
export type NotificationField=typeof notificationFields[number];
export const kindField={BUY:'buyEnabled',SELL:'sellEnabled',DIVIDEND:'dividendEnabled',NEWS:'newsEnabled',TARGET:'targetEnabled'} as const;
export type AccountPreference={enabled:boolean;buyEnabled:boolean;sellEnabled:boolean;dividendEnabled:boolean;newsEnabled:boolean;targetEnabled:boolean};
export const effective=(p:AccountPreference|undefined|null,kind:string)=>!!p?.enabled&&!!p[kindField[kind as keyof typeof kindField]];
export async function ensureNotificationAccounts(db:PrismaClient,userId:bigint){
 if(!await db.appNotificationPreference.findUnique({where:{userId},select:{userId:true}})){
  const newsCursor=(await db.stockNewsItem.aggregate({_max:{id:true}}))._max.id??0n;
  await db.appNotificationPreference.createMany({data:[{userId,newsCursor}],skipDuplicates:true});
 }
 const accounts=await db.account.findMany({where:{userId,isActive:true},orderBy:[{isDefault:'desc'},{displayOrder:'asc'},{id:'asc'}],select:{id:true,name:true,brokerName:true,accountNumber:true,isDefault:true}});
 // New accounts start OFF. Existing settings are migrated once by SQL, never copied from the selected account.
 await db.accountNotificationPreference.createMany({data:accounts.map(a=>({userId,accountId:a.id})),skipDuplicates:true});
 return accounts;
}
export function highestPending<T extends {kind:string;accountId:bigint|null;securityId:bigint|null;targetRate:Prisma.Decimal|null}>(rows:T[]):T[]{
 const targets=new Map<string,T>(),result:T[]=[];
 for(const row of rows){
  if(row.kind!=='TARGET'||!row.securityId){result.push(row);continue;}
  const key=`${row.accountId}:${row.securityId}`,prior=targets.get(key);
  if(!prior||new Prisma.Decimal(row.targetRate??0).gt(prior.targetRate??0))targets.set(key,row);
 }
 return [...result,...targets.values()];
}
