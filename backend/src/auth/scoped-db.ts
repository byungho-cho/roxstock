import {Prisma} from '@roxstock/shared/prisma';
import {prisma as unscoped} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {authContext} from './context.js';
type Obj=Record<string,any>;
const personal=new Set(['StockNewsScrap','StockNewsRead','Account','BuyTrade','SellTrade','CashTransaction','Dividend','AccountWatchlistItem','TradeRequest','DailyAccountSnapshot','DailyPositionSnapshot','CompoundGrowthPlan','CompoundGrowthGoal','AccountProfitRevision','InvestmentYearAggregate']);
const metadata=new Map(Prisma.dmmf.datamodel.models.map(m=>[m.name,m]));
function owner(model:string,userId:bigint):Obj {
  if(model==='Account'||(model==='StockNewsScrap'||model==='StockNewsRead'))return {userId};
  if(model==='SellTrade')return {buyTrade:{account:{userId}}};
  if(model==='CompoundGrowthGoal')return {plan:{account:{userId}}};
  return {account:{userId}};
}
function projections(model:string,args:Obj,userId:bigint):Obj {
  const next={...args};
  for(const mode of ['include','select'])if(args[mode]){
    next[mode]={...args[mode]};
    if(args[mode]._count){
      const relations=(metadata.get(model)?.fields??[]).filter(f=>f.kind==='object'&&f.isList);
      const counts=args[mode]._count===true?Object.fromEntries(relations.map(f=>[f.name,true])):{...args[mode]._count.select};
      for(const field of relations)if(counts[field.name]&&personal.has(field.type))counts[field.name]={where:{AND:[typeof counts[field.name]==='object'?counts[field.name].where??{}:{},owner(field.type,userId)]}};
      next[mode]._count={select:counts};
    }
    for(const field of metadata.get(model)?.fields??[]){
      if(field.kind!=='object'||!args[mode][field.name])continue;
      const selected=args[mode][field.name],child=projections(field.type,typeof selected==='object'?selected:{},userId);
      if(field.isList&&personal.has(field.type))child.where={AND:[child.where??{},owner(field.type,userId)]};
      // Legacy installation-wide watchlists are retained only as a migration backup.
      if(field.type==='WatchlistItem')throw new ApiError(403,'LEGACY_PERSONAL_DATA','이전 관심종목은 개인 계좌에서 조회해 주세요.');
      if(Object.keys(child).length)next[mode][field.name]=child;
    }
  }
  return next;
}
/** Defense in depth for ORM reads/writes, including interactive transactions and nested reads. */
export function scopedClient<T extends object>(db:T):T {
  return new Proxy(db,{get(target,key){
    const value:any=Reflect.get(target,key);
    if(key==='$transaction')return (work:any,...rest:any[])=>typeof work==='function'?value.call(target,(tx:any)=>work(scopedClient(tx)),...rest):value.call(target,work,...rest);
    const model=typeof key==='string'?key[0]?.toUpperCase()+key.slice(1):'';
    if(!metadata.has(model)||!value||typeof value!=='object')return typeof value==='function'?value.bind(target):value;
    return new Proxy(value,{get(delegate,operation){
      const fn=Reflect.get(delegate,operation);if(typeof fn!=='function')return fn;
      return async(args:Obj={})=>{
        const identity=authContext.getStore();if(!identity)return fn.call(delegate,args);
        if(model==='WatchlistItem')throw new ApiError(403,'LEGACY_PERSONAL_DATA','이전 관심종목은 개인 계좌에서 조회해 주세요.');
        const uid=identity.userId,op=String(operation);let query=projections(model,args,uid);
        if(personal.has(model)){
          if(!['create','createMany','createManyAndReturn'].includes(op)){
            const existing=query.where?.AND;
            query.where={...query.where,AND:[...(Array.isArray(existing)?existing:existing?[existing]:[]),owner(model,uid)]};
          }
          for(const branch of ['data','create','update'])if(query[branch]){
            const rows=Array.isArray(query[branch])?query[branch]:[query[branch]];
            for(const row of rows){
              if(model==='Account'||(model==='StockNewsScrap'||model==='StockNewsRead')){
                if(row.user!==undefined)throw new ApiError(403,'OWNER_CHANGE_FORBIDDEN','소유자를 변경할 수 없습니다.');
                if(row.userId!==undefined&&row.userId!==uid)throw new ApiError(403,'OWNER_CHANGE_FORBIDDEN','소유자를 변경할 수 없습니다.');
                if(['create','createMany','createManyAndReturn'].includes(op)||branch==='create')row.userId=uid;
              }
              for(const [field,parent] of [['accountId','account'],['buyTradeId','buyTrade'],['planId','compoundGrowthPlan']] as const)if(row[field]!=null){
                const parentModel=parent[0]!.toUpperCase()+parent.slice(1);
                // Parent writes may be uncommitted: validate through this client's transaction.
                if(!await (target as any)[parent].findFirst({where:{id:BigInt(row[field]),...owner(parentModel,uid)},select:{id:true}}))throw new ApiError(404,'NOT_FOUND','항목을 찾을 수 없습니다.');
              }
            }
          }
        }
        return fn.call(delegate,query);
      };
    }});
  }});
}
export const prisma=scopedClient(unscoped);
