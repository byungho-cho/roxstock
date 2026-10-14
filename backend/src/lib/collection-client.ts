import {normalizeSecuritySymbol} from '../domain/security-symbol.js';
import {Prisma,type PrismaClient} from '../generated/prisma/index.js';
import {collectionContext,inCollectionTransaction,lockCollection} from '../collector/collection-policy.js';
const collected=new Set(['marketPrice','financialStatement','valuationMetric','securityFundamentals','dartFinancialFiling','dartShareSnapshot','periodValuation','annualConsensusSnapshot','dartCorpMapping']);
const models=new Map(Prisma.dmmf.datamodel.models.map(m=>[m.name.slice(0,1).toLowerCase()+m.name.slice(1),m]));
const writes=new Set(['create','createMany','update','updateMany','upsert']);
type Obj=Record<string,any>;
function project(model:string,args:Obj){
 const meta=models.get(model);if(!meta)return args;
 const result={...args};
 for(const mode of ['select','include'])if(args[mode]){
  result[mode]={...args[mode]};
  if(mode==='select'&&model==='security'){result[mode].symbol=true;result[mode].codeRevision=true;}
  if(mode==='select'&&collected.has(model)){result[mode].collectionSymbol=true;result[mode].securityId=true;}
  for(const field of meta.fields.filter(f=>f.kind==='object')){
   const selected=args[mode][field.name],target=field.type.slice(0,1).toLowerCase()+field.type.slice(1);
   if(selected&&typeof selected==='object')result[mode][field.name]=project(target,selected);
  }
 }
 return result;
}
function clean(model:string,value:any):any{
 if(Array.isArray(value))return value.map(v=>clean(model,v));if(!value||typeof value!=='object')return value;
 const meta=models.get(model);if(!meta)return value;
 const result={...value};
 for(const field of meta.fields.filter(f=>f.kind==='object'))if(field.name in result){
  const target=field.type.slice(0,1).toLowerCase()+field.type.slice(1);result[field.name]=clean(target,result[field.name]);
  if(model==='security'&&collected.has(target)&&typeof result.symbol==='string'){
   const current=(row:any)=>(!result.codeRevision&&row?.collectionSymbol==null)||typeof row?.collectionSymbol==='string'&&normalizeSecuritySymbol(row.collectionSymbol)===normalizeSecuritySymbol(result.symbol);
   result[field.name]=Array.isArray(result[field.name])?result[field.name].filter(current):current(result[field.name])?result[field.name]:null;
  }
 }
 return result;
}
function stamp(args:Obj,symbol:string){
 const result={...args};for(const key of ['data','create','update'])if(args[key])result[key]=Array.isArray(args[key])?args[key].map((d:Obj)=>({...d,collectionSymbol:symbol})):{...args[key],collectionSymbol:symbol};return result;
}
async function resetNamespace(model:string,delegate:Obj,args:Obj,op:string,root:PrismaClient){
 const data=op==='upsert'?args.update:args.data;
 const symbol=data?.collectionSymbol??args.create?.collectionSymbol;
 if(!symbol||!['upsert','update'].includes(op))return args;
 const previous=await delegate.findUnique({where:args.where});if(!previous)return args;
 const normalized=typeof previous.collectionSymbol==='string'?normalizeSecuritySymbol(previous.collectionSymbol):null;
 if(normalized===normalizeSecuritySymbol(symbol))return args;
 if(normalized===null){const security=await root.security.findUnique({where:{id:previous.securityId??args.create?.securityId},select:{codeRevision:true}});if(!security?.codeRevision)return args;}
 const fields=models.get(model)!.fields.filter(f=>f.kind!=='object');
 const empty=Object.fromEntries(fields.filter(f=>!f.isRequired&&f.name!=='collectionSymbol').map(f=>[f.name,f.type==='Json'?Prisma.DbNull:null]));
 const create=op==='upsert'?Object.fromEntries(Object.entries(args.create??{}).filter(([key,value])=>key!=='id'&&fields.some(f=>f.name===key)&&value!==undefined)):Object.fromEntries(fields.filter(f=>f.type==='Json'&&f.isRequired).map(f=>[f.name,{}]));
 const provided=Object.fromEntries(Object.entries(data??{}).filter(([,v])=>v!==undefined));
 return {...args,[op==='upsert'?'update':'data']:{...empty,...create,...provided}};
}
/** Central read identity boundary, and atomic collection write fence. No collected history is deleted on code edits. */
async function lockAnalysisRevision(tx:any){
 if(tx.analysisRevision)await tx.$queryRaw`SELECT revision FROM analysis_revisions WHERE \`key\`='financial' FOR UPDATE`;
}
const wrapped=new WeakSet<object>();
export function collectionClient<T extends object>(db:T,root:PrismaClient=db as unknown as PrismaClient):T{
 if(wrapped.has(db))return db;
 const cache=new Map<PropertyKey,unknown>();
 const proxy=new Proxy(db,{get(target,key){
  const value=Reflect.get(target,key);
  if(key==='$transaction'&&typeof value==='function')return (work:any,...options:any[])=>{
   if(typeof work!=='function')return value.call(target,work,...options);
   return value.call(target,async(tx:any)=>{
    // Acquire the revision row before the callback can establish a repeatable-read snapshot.
    // MariaDB otherwise raises 1020 when revision triggers update a newer committed row.
    await lockAnalysisRevision(tx);
    await lockCollection(tx);return inCollectionTransaction(()=>work(collectionClient(tx,root)));},...options);
  };
  if(typeof value==='function')return value.bind(target);
  if(!value||typeof value!=='object'||!models.has(String(key)))return value;
  if(!cache.has(key))cache.set(key,new Proxy(value,{get(delegate,operation){
   const method=Reflect.get(delegate,operation);if(typeof method!=='function')return method;
   return async(args:Obj={})=>{
    const model=String(key),op=String(operation),scope=collectionContext();let query=project(model,args);
    if(collected.has(model)&&writes.has(op)&&scope){
     const required=model==='dartShareSnapshot'?'share-counts':model==='annualConsensusSnapshot'?'consensus':undefined;
     if(!scope.inTransaction)return root.$transaction(async tx=>{await lockAnalysisRevision(tx);await lockCollection(tx);if(required)await lockCollection(tx,required);return inCollectionTransaction(()=>Reflect.get(Reflect.get(collectionClient(tx,root),key),operation)(query));});
     if(required)await lockCollection(db as any,required);
     query=stamp(query,scope.identity.symbol);
     if(op==='updateMany'){const security=await root.security.findUnique({where:{id:scope.identity.id},select:{codeRevision:true}});query.where={AND:[query.where??{},{securityId:scope.identity.id},security?.codeRevision?{collectionSymbol:scope.identity.symbol}:{OR:[{collectionSymbol:scope.identity.symbol},{collectionSymbol:null}]}]};}
    }
    if(collected.has(model)&&['findFirst','findMany','count','aggregate','groupBy'].includes(op)){
     const readDb=(db as any).security?.findMany?db as any:root;
     const changed=await readDb.security.findMany({where:{codeRevision:{gt:0}},select:{id:true,symbol:true}});
     if(changed.length)query.where={AND:[query.where??{},{OR:[{securityId:{notIn:changed.map((s:any)=>s.id)}},...changed.map((s:any)=>({securityId:s.id,collectionSymbol:s.symbol}))]}]};
    }
    if(collected.has(model)&&writes.has(op))query=await resetNamespace(model,delegate,query,op,root);
    const result=await method.call(delegate,query);
    if(collected.has(model)&&['findUnique','findUniqueOrThrow'].includes(op)&&result){
     const sid=result.securityId??args.where?.securityId??args.where?.securityId_fiscalYear_periodType?.securityId;
     if(sid){const s=await root.security.findUnique({where:{id:sid},select:{symbol:true,codeRevision:true}});if(s?.codeRevision&&(typeof result.collectionSymbol!=='string'||normalizeSecuritySymbol(result.collectionSymbol)!==normalizeSecuritySymbol(s.symbol)))return null;}
    }
    return clean(model,result);
   };
  }}));return cache.get(key);
 }});wrapped.add(proxy);return proxy;
}
