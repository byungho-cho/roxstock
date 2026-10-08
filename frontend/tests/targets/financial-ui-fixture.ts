import type {Page} from '@playwright/test';
export async function setup(page:Page){
 const stocks=[1,2].map(i=>({id:String(i),name:'종목'+i,symbol:'00000'+i,market:'KOSPI',currentPrice:'100',w:'1',fairPrices:[],valuation:null}));
 const state={posts:0,finished:false,fail:false,body:null as unknown,reads:[] as URL[]};
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),p=u.pathname;
  if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'계좌',isActive:true,isDefault:true}]}});
  if(p.endsWith('/financial-refresh/active'))return route.fulfill({json:{data:null}});
  if(p.endsWith('/financial-refresh')&&route.request().method()==='POST'){state.posts++;state.body=route.request().postDataJSON();return route.fulfill({status:202,json:{data:{requestId:'99',state:'QUEUED'}}});}
  if(p.endsWith('/financial-refresh/99'))return route.fulfill({json:{data:{state:state.finished?'FINISHED':'QUEUED',status:state.fail?'FAILED':state.finished?'PARTIAL':'RUNNING',startYear:2024,endYear:2025,fiscalYear:2024,period:'ALL',finishedAt:state.finished?'2026-10-07T05:00:00Z':null,results:state.finished?[{fiscalYear:2024,period:'ANNUAL',status:state.fail?'FAILED':'SUCCESS',valuationStatus:'PARTIAL',valuationReasons:{per:'기간 말 과거 종가 부족'}}]:[]}}});
  if(p==='/api/value-analysis'||p==='/api/financial-statements')return route.fulfill({json:{data:{year:2026,rows:stocks,total:2}}});
  if(p.startsWith('/api/value-analysis/')||p.startsWith('/api/financial-statements/')){
   state.reads.push(u);const id=p.split('/').at(-1),custom=u.searchParams.get('period'),mode=u.searchParams.get('mode')??'annual';
   const end=Number(u.searchParams.get('endYear')??2026),start=Number(u.searchParams.get('startYear')??end-2),count=custom?Number(u.searchParams.get('endYear'))-start+1:p.includes('value-analysis')?Number(u.searchParams.get('count')):3;
   const chartRows=Array.from({length:count},(_,i)=>({key:`${mode==='quarter'?start*4+Number(u.searchParams.get('startQuarter')??1)-1+i:start+i}:${mode}`,label:mode==='quarter'?`${Math.floor((start*4+Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)/4)} ${(Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)%4+1}Q`:String(start+i),year:mode==='quarter'?Math.floor((start*4+Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)/4):start+i,quarter:mode==='quarter'?(Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)%4+1:null,revenue:'10000000000',operatingProfit:'100000000',netIncome:'10000000',roe:'10',per:null,pbr:null,metricStatus:'PARTIAL',metricReasons:{per:'기간 말 과거 종가 부족'},source:'DART:CFS',collectedAt:'2026-10-07T01:00:00Z',isDerived:false}));
   return route.fulfill({json:{data:{security:stocks.find(s=>s.id===id),year:2026,mode,valuation:null,fairPrices:[],notices:['저장 데이터'],collectedAt:'2026-10-07T01:00:00Z',chartRows,rows:p.includes('financial-statements')?chartRows.map(r=>({...r,values:{revenue:r.revenue,operatingProfit:r.operatingProfit,netIncome:r.netIncome},growth:{},basis:'DART:CFS'})):chartRows}}});
  }return route.fulfill({json:{data:[]}});
 });return state;
}
