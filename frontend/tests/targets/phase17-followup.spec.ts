import {test,expect,type Page,type Locator} from '@playwright/test';
import {fixture as stockFixture} from './stock-input-fixture';
const white='rgb(248, 250, 252)',yellow='rgb(251, 191, 36)',blue='rgb(96, 165, 250)',red='rgb(248, 113, 113)';
const annual='100000000',final='200000000';
async function fixture(page:Page,current='100000000',target:string|null=annual,finalTarget:string|null=final){
 await stockFixture(page);
 const accounts=[{id:'a',name:'기본 계좌',accountNumber:'123-45',cashBalance:'22000000',isActive:true,isDefault:true,updatedAt:'2026-10-08T23:01:00Z'},{id:'b',name:'가족과 노후를 준비하는 매우 긴 장기투자 계좌명',accountNumber:'987654321-123456789-001',cashBalance:'123456789012345678',isActive:true,isDefault:false,updatedAt:'2026-10-09T15:00:00Z'}];
 const goal=(id:string,assets:string)=>({id:'g'+id,goalName:'기본 목표 '+id,annualTargetRate:'10',displayColor:'#5EA1F0',isDefault:true,isVisible:true,yearTarget:target,finalTarget,progress:finalTarget&&Number(finalTarget)>0?String(Number(assets)/Number(finalTarget)*100):null,rows:[2025,2026,2027].map(year=>({year,asset:finalTarget??'0',contributed:'0',realizedAsset:null}))});
 await page.route('**/api/accounts',r=>r.fulfill({json:{data:accounts}}));
 await page.route('**/api/accounts/*/dashboard',r=>r.fulfill({json:{data:{stockValue:'78000000',cashBalance:new URL(r.request().url()).pathname.includes('/b/')?'123456789012345678':'22000000',holdings:[],pricingComplete:true}}}));
 await page.route('**/api/accounts/*/compound-plans',r=>{const id=new URL(r.request().url()).pathname.split('/')[3],assets=id==='b'?'50000000':current;return r.fulfill({json:{data:{accountId:id,currentAssets:assets,currentYear:2026,pricingComplete:true,asOf:'2026-10-10T00:00:00Z',plans:[{id:'p'+id,planName:'복리계획 '+id,startYear:2025,endYear:2027,duration:3,initialAssetValue:'0',annualContributionAmount:'0',status:'ACTIVE',goals:[goal(id,assets)]}]}}});});
 await page.route('**/api/accounts/*/asset-history**',r=>{const id=new URL(r.request().url()).pathname.split('/')[3];return r.fulfill({json:{data:[],summary:{},compoundPlan:{id:'p'+id}}});});
 return accounts;
}
async function barChecks(scope:Locator,current:string,target:string|null,finalTarget:string|null,color:string){
 const bar=scope.getByTestId('compound-current-bar'),meter=scope.getByRole('meter');
 const available=finalTarget!==null&&Number(finalTarget)>0,progress=available?Number(current)/Number(finalTarget)*100:null;
 if(progress!==null){await expect(meter).toHaveAttribute('aria-valuenow',String(progress));await expect(bar).toHaveCSS('background-color',color);const w=(await meter.boundingBox())!.width,b=(await bar.boundingBox())!.width;expect(b/w*100).toBeCloseTo(Math.max(0,Math.min(100,progress)),1);}else{await expect(meter).not.toHaveAttribute('aria-valuenow');await expect(bar).toHaveCount(0);}
 const marker=scope.getByTestId('compound-year-marker'),background=scope.getByTestId('compound-year-background');
 if(available&&target!==null&&Number(target)>0){await expect(marker).toHaveCSS('background-color',yellow);await expect(marker).toHaveCSS('z-index','2');const m=(await meter.boundingBox())!,line=(await marker.boundingBox())!,bg=(await background.boundingBox())!;expect(bg.width/m.width*100).toBeCloseTo(Math.min(100,Number(target)/Number(finalTarget)*100),1);expect(line.x).toBeGreaterThanOrEqual(m.x-.01);expect(line.x+line.width).toBeLessThanOrEqual(m.x+m.width+.01);}
 else{await expect(marker).toHaveCount(0);await expect(background).toHaveCount(0);}
 await expect(scope.getByTestId('compound-year-difference')).toContainText(target===null||Number(target)<=0?'올해 목표 대비 —':Number(current)<Number(target)?'부족':Number(current)>Number(target)?'초과':'올해 목표 달성');
}
for(const [name,current,target,finalTarget,color] of [
 ['below90','89999999.999999',annual,final,blue],['exact90','90000000',annual,final,yellow],['above90','90000000.000001',annual,final,yellow],
 ['exact100','100000000',annual,final,yellow],['below110','109999999.999999',annual,final,yellow],['exact110','110000000',annual,final,yellow],['above110','110000000.000001',annual,final,red],
 ['finalOverflow','210000000',annual,final,red],['noAnnual','100000000',null,final,white],['zeroAnnual','100000000','0',final,white],['zeroFinal','100000000',annual,'0',yellow],['annualBeyondFinal','100000000','300000000',final,blue]
] as const)test('shared annual target rules '+name,async({page},info)=>{
 await fixture(page,current,target,finalTarget);
 for(const [path,id] of [['/assets','analysis-compound-summary'],['/detail/compound?view=goal&plan=pa&goal=ga','compound-goal-summary'],['/detail/compound?view=compare&plan=pa','compound-goal-ga']] as const){
  await page.goto(path);const card=page.getByTestId(id);await expect(card).toBeVisible();await barChecks(card,current,target,finalTarget,color);
  if(id!=='compound-goal-ga'){await expect(card.getByTestId('compound-summary-current')).toHaveCSS('color',color);await expect(card.getByTestId('compound-summary-final')).toHaveCSS('color',white);}
  else {const amounts=page.getByTestId('compound-current-assets');await expect(amounts).toHaveCount(page.viewportSize()!.width>=600?2:1);for(const amount of await amounts.all())await expect(amount).toHaveCSS('color',color);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(name==='exact100'){await card.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/phase17/${id}-${info.project.name}.png`,animations:'disabled'});}
 }
});
test('menus share distinct icons and retain fixed ends, size, scroll and selected color',async({page},info)=>{
 await fixture(page);await page.goto('/more');const nav=page.getByRole('navigation',{name:'하단 메뉴'}),more=page.getByRole('navigation',{name:'더보기 메뉴'});
 const icons:string[]=[];for(const name of ['홈','종목목록','매매일지','예수금','자산분석','투자금','투자손익','가치분석','재무제표','복리계획','모니터링','설정']){const src=await more.getByRole('button',{name,exact:true}).locator('img').getAttribute('src');icons.push(src!);await expect(nav.getByRole('button',{name,exact:true}).locator('img')).toHaveAttribute('src',src!);await expect(nav.getByRole('button',{name,exact:true}).locator('img')).toHaveCSS('width','18px');}
 expect(new Set(icons).size).toBe(icons.length);await expect(nav).toHaveCSS('height','44px');const home=(await nav.getByRole('button',{name:'홈',exact:true}).boundingBox())!,end=(await nav.getByRole('button',{name:'더보기',exact:true}).boundingBox())!;expect(home.x).toBe(0);expect(end.x+end.width).toBe(page.viewportSize()!.width);await expect(page.getByTestId('bottom-menu-scroll')).toHaveCSS('overflow-x','auto');
 await page.screenshot({path:`test-results/phase17/menu-${info.project.name}.png`});await more.getByRole('button',{name:'복리계획',exact:true}).click();await expect(nav.getByRole('button',{name:'복리계획',exact:true})).toHaveAttribute('aria-current','page');await expect(nav.getByRole('button',{name:'복리계획',exact:true})).toHaveCSS('color','rgb(251, 191, 36)');
});
test('compact account rows preserve long values, Seoul time, selection and isolated editing',async({page},info)=>{
 const accounts=await fixture(page);await page.goto('/detail/settings?view=account');const first=page.getByTestId('account-card-a'),second=page.getByTestId('account-card-b');
 await expect(first.getByTestId('account-updated-at')).toHaveText('2026.10.09 08:01');await expect(second.getByTestId('account-updated-at')).toHaveText('2026.10.10 00:00');await expect(first).not.toContainText(/최근 수정|오전|오후/);const height=(await first.boundingBox())!.height;expect(height).toBeGreaterThanOrEqual(58);expect(height).toBeLessThanOrEqual(62);
 for(const card of [first,second]){const title=card.getByTestId('account-title-row'),detail=card.getByTestId('account-detail-row');await expect(title).toHaveCSS('align-items','center');await expect(detail).toHaveCSS('align-items','center');const time=(await card.getByTestId('account-updated-at').boundingBox())!,cash=(await card.getByTestId('account-cash').boundingBox())!;expect(time.x+time.width).toBeLessThanOrEqual(cash.x);expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
 await page.screenshot({path:`test-results/phase17/accounts-${info.project.name}.png`});await second.getByRole('button',{name:/계좌 선택/}).tap();await expect(second).toHaveCSS('border-top-color','rgb(250, 204, 21)');
 await first.getByRole('button',{name:/계좌 정보 수정/}).click();await expect(page).toHaveURL(/accountId=a/);expect(await page.evaluate(()=>localStorage.getItem('roxstock-selected-account-id'))).toBe('b');await page.goBack();await expect(page).toHaveURL(/view=account/);
 await page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'자산분석',exact:true}).click();await expect(page.getByTestId('analysis-compound-summary')).toContainText('복리계획 b');await expect(page.getByTestId('compound-summary-current')).toHaveText('50,000,000원');await expect(page.getByTestId('compound-summary-current')).toHaveCSS('color',blue);expect(accounts[1].name.length).toBeGreaterThan(20);
});
