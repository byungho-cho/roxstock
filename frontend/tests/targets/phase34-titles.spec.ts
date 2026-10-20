import {test,expect} from './authenticated-test';
import {fixture} from './phase3-fixture';
const entries=[['/detail/assets','대시보드'],['/stocks','종목목록'],['/journal','매매일지'],['/detail/cash','예수금'],['/assets','자산분석'],['/detail/investment','투자금'],['/detail/investment-profit','투자손익'],['/detail/value','가치분석'],['/detail/financials','재무제표'],['/detail/compound','복리계획'],['/detail/settings?view=settings','설정'],['/more','메뉴']];
for(const [path,title] of entries)test(`${title}: shared title size, gutter and vertical centering`,async({page},info)=>{
 await fixture(page,{read:url=>{
  if(url.pathname.endsWith('/cash-overview'))return {json:{data:{account:{id:'1',name:'기본',currentBalance:'10000',balanceStatus:'AVAILABLE',updatedAt:'2026-10-14T03:00:00Z'},currentYearTax:{year:2026,amount:'0'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[]}}};
  if(url.pathname==='/api/value-analysis')return {json:{data:{rows:[],total:0,year:2026,query:''}}};
  if(url.pathname==='/api/financial-statements')return {json:{data:{rows:[],total:0,year:2026}}};
 }});
 await page.goto(path!);
 const heading=page.getByRole('heading',{name:title,exact:true,level:1});await expect(heading).toBeVisible();
 await expect(heading).toHaveCSS('font-size','22px');await expect(heading).toHaveCSS('line-height','30px');
 await expect.poll(()=>heading.evaluate(node=>{const h=node.getBoundingClientRect(),bar=node.closest('.MuiToolbar-root')!.getBoundingClientRect();return {height:bar.height,left:Math.round(h.x-bar.x),center:Math.round(h.y+h.height/2-bar.y)};})).toEqual({height:44,left:8,center:22});
 await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('navigation',{name:'하단 메뉴'})).toBeVisible();
 if(['대시보드','자산분석','메뉴'].includes(title!))await page.screenshot({path:info.outputPath(title+'.png')});
});
test('child headers use common back spacing and preserve back navigation',async({page},info)=>{
 await fixture(page,{read:url=>{
  if(url.pathname.startsWith('/api/financial-statements/'))return {status:503,json:{error:{message:'controlled failure'}}};
  if(url.pathname==='/api/financial-statements')return {json:{data:{rows:[],total:0,year:2026}}};
 }});
 for(const path of ['/detail/settings?view=account','/detail/financials?selected=1&view=detail']){
  await page.goto(path);const heading=page.getByRole('heading',{level:1});await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS('font-size','18px');
  const back=page.getByRole('button',{name:'뒤로가기',exact:true});await expect(back).toBeVisible();
  const h=await heading.boundingBox(),b=await back.boundingBox();expect(Math.abs(h!.x-(b!.x+b!.width)-8)).toBeLessThan(1);
  expect(Math.abs(h!.y+h!.height/2-(b!.y+b!.height/2))).toBeLessThan(1);
  await page.screenshot({path:info.outputPath(path.includes('settings')?'account-header.png':'financial-header.png')});
 }
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/view=list/);
});
test('stock two-line header stays inside the 44px header',async({page},info)=>{
 test.skip(info.project.name==='cover','Split stock header is a tablet/large layout');
 await fixture(page);await page.goto('/stocks?selected=1');
 const heading=page.getByRole('heading',{level:1});await expect(heading).toBeVisible();
 await expect(heading).toHaveCSS('font-size','14px');
 await expect(heading).toHaveCSS('line-height','22px');
 const geometry=await heading.evaluate(node=>{const h=node.getBoundingClientRect(),t=node.closest('.MuiToolbar-root')!.getBoundingClientRect();return {height:t.height,titleTop:h.top-t.top,titleBottom:h.bottom-t.top};});
 expect(geometry.height).toBe(44);expect(geometry.titleTop).toBeGreaterThanOrEqual(0);expect(geometry.titleBottom).toBeLessThanOrEqual(22);
 await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('stock-two-line-header.png')});
});
