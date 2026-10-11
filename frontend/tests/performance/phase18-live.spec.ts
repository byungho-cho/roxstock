import {test,expect} from '@playwright/test';
import fs from 'node:fs';
for(let round=1;round<=3;round++)test(`live cold/warm screen timing ${round}`,async({page},info)=>{
 const records:{name:string;ms:number;bytes:number;status:number;serverTiming:string}[]=[],requests:string[]=[];const tasks:Promise<void>[]=[];
 let stage='home-cold';
 page.on('request',r=>{if(r.url().includes('/api/'))requests.push(stage+':'+new URL(r.url()).pathname.split('/').at(-1));});
 page.on('response',r=>{if(!r.url().includes('/api/'))return;const at=stage;tasks.push((async()=>{const data=await r.body().catch(()=>Buffer.alloc(0)),timing=r.request().timing();records.push({name:at+':'+new URL(r.url()).pathname.split('/').at(-1),ms:timing.responseEnd>=0?timing.responseEnd:timing.responseStart,bytes:data.length,status:r.status(),serverTiming:r.headers()['server-timing']??''});})());});
 const start=Date.now();await page.goto('/');
 await expect(page.getByTestId('home-summary-area')).toContainText('원',{timeout:90000});
 await expect(page.getByTestId('home-trend-loading')).toHaveCount(0,{timeout:90000});
 await expect(page.getByTestId('target-arrival-card').locator('.MuiSkeleton-root')).toHaveCount(0,{timeout:90000});
 const major=Date.now()-start;await expect(page.getByTestId('recent-buys-card').locator('.MuiSkeleton-root')).toHaveCount(0,{timeout:90000});const recent=Date.now()-start;
 const coldRequests=requests.length;
 await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'더보기',exact:true}).click();stage='home-warm';const warmStart=Date.now();await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'홈',exact:true}).click();await expect(page.getByTestId('home-summary-area')).toContainText('원');await expect(page.getByTestId('recent-buys-card').locator('.MuiSkeleton-root')).toHaveCount(0);const warm=Date.now()-warmStart,warmRequests=requests.length-coldRequests;
 await Promise.all(tasks);const result={kind:'phase18-live-screen',deployedCommit:process.env.DEPLOYED_SHA,runner:'GitHub ubuntu-latest Chromium HTTPS',utc:new Date().toISOString(),project:info.project.name,round,homeMajorMs:major,homeRecentMs:recent,homeAllMs:recent,homeWarmMs:warm,coldRequests,warmRequests,requests,api:records};
 fs.writeFileSync(info.outputPath('metrics.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await page.screenshot({path:info.outputPath('home-live.png')});
});

for(let round=1;round<=3;round++)for(const screen of ['settings','compound'] as const)test(`live ${screen} cold ${round}`,async({page},info)=>{
 const requests:string[]=[],api:{name:string;ms:number;bytes:number;status:number;serverTiming:string}[]=[],tasks:Promise<void>[]=[];
 page.on('request',r=>{if(r.url().includes('/api/'))requests.push(new URL(r.url()).pathname.split('/').at(-1)!);});
 page.on('response',r=>{if(!r.url().includes('/api/'))return;tasks.push((async()=>{const body=await r.body().catch(()=>Buffer.alloc(0)),timing=r.request().timing();api.push({name:new URL(r.url()).pathname.split('/').at(-1)!,ms:timing.responseEnd,bytes:body.length,status:r.status(),serverTiming:r.headers()['server-timing']??''});})());});
 const start=Date.now();await page.goto('/detail/'+screen);
 let basic:number,calculated:number;
 if(screen==='settings'){
  await expect(page.getByTestId('settings-menu')).toContainText('계좌 관리');basic=Date.now()-start;
  if(info.project.name==='tablet'){await expect.poll(()=>page.locator('[data-testid^="account-card-"]').count(),{timeout:90000}).toBeGreaterThan(0);}
  else await page.getByTestId('settings-menu').getByText('계좌 관리',{exact:true}).click();
  await expect.poll(()=>page.locator('[data-testid^="account-card-"]').count(),{timeout:90000}).toBeGreaterThan(0);calculated=Date.now()-start;
 }else{
  const root=page.getByTestId(/^[CT]1900$/);await expect(root).toBeVisible();
  await expect.poll(()=>page.locator('[data-testid^="compound-plan-"]').count(),{timeout:90000}).toBeGreaterThan(0);basic=Date.now()-start;
  await expect(page.getByLabel('현재 자산 계산 중')).toHaveCount(0,{timeout:90000});calculated=Date.now()-start;
 }
 await page.waitForLoadState('networkidle');await Promise.all(tasks);
 const result={kind:'phase18-live-independent',screen,round,project:info.project.name,deployedCommit:process.env.DEPLOYED_SHA,runner:'GitHub ubuntu-latest Chromium HTTPS',utc:new Date().toISOString(),basicMs:basic,calculatedMs:calculated,requests,api};fs.writeFileSync(info.outputPath('metrics.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await page.screenshot({path:info.outputPath(screen+'-live.png')});
});
