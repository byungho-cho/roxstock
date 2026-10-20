import type {Page} from './authenticated-test';
import {fixture as base} from './phase28-fixture';
const stamp='2026-10-19T06:00:00Z';
export async function fixture(page:Page,options:{empty?:boolean;before?:boolean;long?:boolean;partial?:boolean;longSummary?:boolean}={}){
 const baseFixture=await base(page);let reads=0,fail=false,hold=false,release=()=>{};const paths:string[]=[];
 const items=Array.from({length:26},(_,i)=>({isHeld:i%2===0,id:String(100-i),title:options.long?'긴 제목의 실적과 사업 전망 및 정책 변화에 관한 검증 내용 '.repeat(5):`검증 소식 ${i+1} · 실적과 사업 전망`,originalUrl:'https://www.hankyung.com/article/phase33test'+i,originalAvailable:true,sourceName:options.long?'검증용 매우 긴 제공 출처 이름 '.repeat(5):'검증 출처',publishedAt:stamp,publishedPrecision:'TIME',type:(i%3===0?'REPORT':i%3===1?'ARTICLE':'DISCLOSURE'),importance:i<3?'IMPORTANT':'MAJOR',access:i===1?'PAID':i===2?'LOGIN':i===3?'UNKNOWN':'FREE',summary:i===2?null:options.longSummary?'공개 본문 검증을 위한 긴 내용입니다. 숫자 12,345.67억원과 -3.25%를 그대로 보존합니다. '.repeat(40):'공개 제공처에서 확인된 검증용 내용 요약입니다. 원문에 없는 수치나 사실은 포함하지 않습니다.',summaryMethod:'PUBLIC_DESCRIPTION_EXTRACT',collectedAt:stamp,securities:[{id:'1',symbol:'005930',name:options.long?'매우 긴 검증용 종목 이름을 가진 주식회사':'검증 종목'}]}));
 const read=async(path:string)=>{
  paths.push(path);if(!path.includes('/stock-news'))return baseFixture.read(path);reads++;if(hold&&path.startsWith('/accounts/1/stock-news'))await new Promise<void>(r=>release=r);
  if(fail)return {status:503,body:{error:{code:'TEST_UNAVAILABLE',message:'검증 조회 실패'}}};
  const u=new URL('http://fixture/api'+path),account=u.pathname.split('/')[3],id=u.pathname.split('/')[5],type=u.searchParams.get('type')??'ALL';
  const filtered=options.empty||account==='2'?[]:items.filter(i=>type==='ALL'||i.type===type),snapshot=u.searchParams.get('snapshot')??'test-'+account+'-'+type;
  if(id){const index=filtered.findIndex(i=>i.id===id);if(index<0)return {status:404,body:{error:{code:'NEWS_NOT_IN_ACCOUNT',message:'현재 계좌 대상 아님'}}};return {status:200,body:{data:filtered[index],meta:{accountId:account,type,snapshot,ordinal:index+1,total:filtered.length,previousId:filtered[index-1]?.id??null,nextId:filtered[index+1]?.id??null}}};}
  const cursor=u.searchParams.get('cursor'),offset=cursor?filtered.findIndex(i=>i.id===cursor)+1:0,data=filtered.slice(offset,offset+10);
  return {status:200,body:{data,meta:{accountId:account,type,snapshot,count:data.length,total:filtered.length,nextCursor:offset+10<filtered.length?data.at(-1)!.id:null,collection:{status:options.before?'NOT_COLLECTED':options.partial===false?'SUCCESS':'PARTIAL',updatedAt:options.before?null:stamp,initialCompleted:!options.before,enabled:true,nextAt:'2026-10-20T21:00:00Z',providers:[{id:'TEST',error:'TEST_PARTIAL'}]}}}};
 };
 await page.route('**/api/pages/read',async r=>{const list=r.request().postDataJSON().paths as string[];if(!list.some(p=>p.includes('/stock-news')))return r.fallback();await r.fulfill({json:{data:await Promise.all(list.map(async p=>(await read(p))??{status:200,body:{data:[]}}))}});});
 await page.route('**/api/accounts/*/stock-news**',async r=>{const u=new URL(r.request().url()),result=await read(u.pathname.slice(4)+u.search);await r.fulfill({status:result!.status,json:result!.body});});
 return {items,paths,reads:()=>reads,fail:()=>{fail=true;},hold:()=>{hold=true;},release:()=>{hold=false;release();}};
}
