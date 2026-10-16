import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page){
 await page.clock.setFixedTime(new Date('2026-10-16T03:00:00Z'));
 let authenticated=false,failCreate=false;const writes:Array<{path:string;body:any}>=[];
 const records=[{id:'11111111-1111-4111-8111-111111111111',kind:'MANUAL',status:'COMPLETE',filename:'manual.sql',createdAt:'2026-10-16T03:00:00Z',completedAt:'2026-10-16T03:00:01Z',bytes:4000,reason:null,latestAutomatic:false},{id:'22222222-2222-4222-8222-222222222222',kind:'AUTO',status:'COMPLETE',filename:'auto.sql.gz',createdAt:'2026-10-01T00:00:00Z',completedAt:'2026-10-01T00:00:01Z',bytes:3000,reason:null,latestAutomatic:true}];
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'legacy fixture'}}});
  if(path==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'검증 계좌',brokerName:'TEST',cashBalance:'0',isActive:true,isDefault:true}]}});
  if(path.endsWith('/investor-targets'))return route.fulfill({json:{data:[{id:'1',symbol:'005930',name:'삼성전자',classification:'보유'},{id:'2',symbol:'000660',name:'매우 긴 관심 종목 이름',classification:'관심'}]}});
  if(path==='/api/investor-trends'){
   const stock=url.searchParams.get('type')==='STOCK',quantity=url.searchParams.get('metric')==='quantity',selectedDate=url.searchParams.get('date');
   const values=stock?['9007199254740993','0',null]:['-4','5','0'];
   return route.fulfill({json:{data:{selectedDate,actualFrom:'2026-10-16',actualTo:'2026-10-16',unit:quantity?'SHARE':'KRW',updatedAt:'2026-10-16T03:00:00Z',partial:true,reason:'검증 자료 · 미제공 값은 —',rows:['INDIVIDUAL','FOREIGN','INSTITUTION'].map((code,i)=>({code,name:code,buy:values[i],sell:'0',net:values[i],source:'TEST',exchangeScope:'KRX',publicationStatus:'UNSPECIFIED',reason:'partial'})),points:[{date:'2026-10-14',values:{INDIVIDUAL:'1',FOREIGN:'0',INSTITUTION:'-1'}},{date:'2026-10-15',values:{INDIVIDUAL:null,FOREIGN:null,INSTITUTION:null}},{date:'2026-10-16',values:{INDIVIDUAL:'2',FOREIGN:'0',INSTITUTION:'-2'}}]}}});
  }
  if(path==='/api/backups/session')return route.fulfill({json:{data:{authenticated,configured:true,csrf:authenticated?'test-csrf':null}}});
  if(path==='/api/backups/login'){authenticated=true;return route.fulfill({json:{data:{authenticated:true,csrf:'test-csrf'}}});}
  if(path==='/api/backups'&&request.method()==='GET')return route.fulfill({json:{data:{items:records,nextCursor:null,automatic:{enabled:true,schedule:'매월 1일 04:30 KST',catchUp:'현재 월',retention:'자동 삭제 없음'}}}});
  if(path.startsWith('/api/backups')&&request.method()!=='GET'){
   writes.push({path,body:request.postData()?request.postDataJSON():null});
   if(failCreate)return route.fulfill({status:500,json:{error:{message:'백업 생성 실패'}}});
   if(request.method()==='DELETE'){const index=records.findIndex(r=>path.endsWith('/'+r.id));if(index>=0)records.splice(index,1);return route.fulfill({json:{data:{deleted:true}}});}
   return route.fulfill({json:{data:{id:'new'}}});
  }
  if(path==='/api/version')return route.fulfill({json:{data:{version:'1.1.0'}}});
  return route.fulfill({json:{data:[]}});
 });
 return {writes,fail:()=>{failCreate=true;}};
}
test('investor header, navigation, units, gap chart and tooltips use one fixed layout',async({page},info)=>{
 await fixture(page);await page.goto('/detail/investor-trends');
 await expect(page.getByRole('heading',{name:'투자동향',exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);
 await expect(page.getByRole('table',{name:'주체별 거래실적'})).toContainText('-4');
 expect((await page.locator('header').boundingBox())!.height).toBe(44);await expect(page.getByRole('navigation',{name:'하단 메뉴'})).toHaveCSS('height','44px');
 const svg=page.getByLabel('투자자 누적 순매수 차트');await expect(svg).toHaveAttribute('height','124');expect((await svg.locator('path').first().getAttribute('d'))!.match(/M/g)).toHaveLength(2);
 await svg.hover({position:{x:50,y:40}});await expect(page.getByRole('tooltip')).toContainText('누적');
 await page.getByRole('button',{name:'다음 시장 또는 종목',exact:true}).click();await expect(page.getByTestId('investor-navigation')).toContainText('코스닥');
 await page.getByRole('button',{name:'종목별',exact:true}).click();await expect(page.getByTestId('investor-navigation')).toContainText('삼성전자 (보유)');
 await page.getByRole('combobox',{name:'거래대금 또는 거래량'}).click();await page.getByRole('option',{name:'거래량',exact:true}).click();await expect(page.getByRole('table')).toContainText('9,007,199,254,740,993');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('investor.png')});
});
test('backup login, latest automatic confirmation and failure preserve the list',async({page},info)=>{
 const f=await fixture(page);await page.goto('/detail/settings?view=backup');await page.getByLabel('관리자 비밀번호').fill('test-password');await page.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page.getByTestId('backup-item')).toHaveCount(2);
 await page.getByRole('button',{name:'auto.sql.gz 삭제',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'삭제',exact:true})).toBeDisabled();await dialog.getByRole('textbox',{name:'삭제 확인',exact:true}).fill('삭제 확인 ');await expect(dialog.getByRole('button',{name:'삭제',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'취소',exact:true}).click();expect(f.writes).toHaveLength(0);
 await page.getByRole('button',{name:'manual.sql 삭제',exact:true}).click();await expect(dialog.getByRole('textbox')).toHaveCount(0);await dialog.getByRole('button',{name:'취소',exact:true}).click();
 f.fail();await page.getByRole('button',{name:'지금 백업',exact:true}).click();await expect(page.locator('.MuiSnackbar-root')).toContainText('백업 생성 실패');await expect(page.getByTestId('backup-item')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('backups.png')});
});
test('menu keeps settings and monitoring equal and places investor between cash and analysis',async({page})=>{
 await fixture(page);await page.goto('/more');const menu=page.getByTestId('more-menu');await expect(menu.getByRole('button')).toHaveCount(14);
 const names=await menu.getByRole('button').allTextContents();expect(names.slice(-2)).toEqual(['설정','모니터링']);expect(names.indexOf('투자동향')).toBe(names.indexOf('예수금')+1);expect(names.indexOf('자산분석')).toBe(names.indexOf('투자동향')+1);
 const settings=await menu.getByRole('button',{name:'설정',exact:true}).boundingBox(),monitor=await menu.getByRole('button',{name:'모니터링',exact:true}).boundingBox();expect(settings!.width).toBeCloseTo(monitor!.width,1);expect(settings!.y).toBeCloseTo(monitor!.y,1);
});
