import {test,expect,type Page} from './authenticated-test';
async function fixture(page:Page){
 await page.clock.setFixedTime(new Date('2026-10-16T03:00:00Z'));
 let authenticated=false,failCreate=false;const writes:Array<{path:string;body:any}>=[];
 const records=[{id:'11111111-1111-4111-8111-111111111111',kind:'MANUAL',status:'COMPLETE',filename:'manual.sql',createdAt:'2026-10-16T03:00:00Z',completedAt:'2026-10-16T03:00:01Z',bytes:4000,reason:null,latestAutomatic:false},{id:'22222222-2222-4222-8222-222222222222',kind:'AUTO',status:'COMPLETE',filename:'auto.sql.gz',createdAt:'2026-10-01T00:00:00Z',completedAt:'2026-10-01T00:00:01Z',bytes:3000,reason:null,latestAutomatic:true}];
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'legacy fixture'}}});
  if(path==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'검증 계좌',brokerName:'TEST',cashBalance:'0',isActive:true,isDefault:true}]}});
  if(path.endsWith('/investor-targets'))return route.fulfill({json:{data:[{id:'1',symbol:'005930',name:'삼성전자',classification:'보유'},{id:'2',symbol:'000660',name:'매우 긴 관심 종목 이름',classification:'관심'}]}});
  if(path==='/api/investor-trends/history'){
   const stock=url.searchParams.get('type')==='STOCK',quantity=url.searchParams.get('metric')==='quantity',cursor=url.searchParams.get('cursor');
   const count=cursor?2:50;
   return route.fulfill({json:{data:{rows:Array.from({length:count},(_,index)=>({date:new Date(Date.UTC(2026,9,16-(cursor?50:0)-index)).toISOString().slice(0,10),close:stock?'73000':'3200.25',closeChange:index%2?'1':'-1',values:{INDIVIDUAL:stock&&quantity?'9007199254740993':'-3200000000',FOREIGN:'0',INSTITUTION:null}})),nextCursor:cursor?null:'2026-08-28'}}});
  }
  if(path==='/api/investor-trends'){
   const stock=url.searchParams.get('type')==='STOCK',quantity=url.searchParams.get('metric')==='quantity',selectedDate=url.searchParams.get('date');
   const values=stock?['9007199254740993','0',null]:['-4','5','0'];
   return route.fulfill({json:{data:{selectedDate,actualFrom:'2026-10-16',actualTo:'2026-10-16',unit:quantity?'SHARE':'KRW',updatedAt:'2026-10-16T03:00:00Z',partial:true,reason:'검증 자료 · 미제공 값은 —',rows:['INDIVIDUAL','FOREIGN','INSTITUTION'].map((code,i)=>({code,name:code,buy:values[i],sell:'0',net:values[i],source:'TEST',exchangeScope:'KRX',publicationStatus:'UNSPECIFIED',reason:'partial'})),points:[{date:'2026-10-14',close:'3200.25',closeChange:'-1.5',values:{INDIVIDUAL:'1',FOREIGN:'0',INSTITUTION:'-1'}},{date:'2026-10-15',values:{INDIVIDUAL:null,FOREIGN:null,INSTITUTION:null}},{date:'2026-10-16',close:'3201.25',closeChange:'1',values:{INDIVIDUAL:'2',FOREIGN:'0',INSTITUTION:'-2'}}]}}});
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
 await expect(page.getByRole('heading',{name:/^투자동향/})).toHaveCount(1);await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);
 await expect(page.getByRole('table',{name:'일자별 거래실적'})).toContainText('-3,200');
 const grid=await page.getByTestId('investor-card-grid').boundingBox();const cards=await page.getByTestId('investor-card-grid').locator('.MuiCard-root').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()));
 const expected=info.project.name==='cover'?grid!.width:(grid!.width-8)/2;
 for(const card of cards)expect(card.width).toBeCloseTo(expected,0);
 expect(cards[0].x).toBeCloseTo(grid!.x,0);expect(cards[1].x).toBeCloseTo(grid!.x,0);
 expect((await page.locator('header').boundingBox())!.height).toBe(44);await expect(page.getByRole('navigation',{name:'하단 메뉴'})).toHaveCSS('height','44px');
 const svg=page.getByLabel('투자자 누적 순매수 차트');await expect(svg).toHaveCSS('height','221px');expect((await page.getByTestId('investor-line-INDIVIDUAL').getAttribute('d'))!.match(/M/g)).toHaveLength(2);
 await svg.hover({position:{x:50,y:40}});await expect(page.locator('[data-chart-tooltip]')).not.toContainText('누적');await expect(page.locator('[data-chart-tooltip]')).toContainText('백만원');await expect(page.getByTestId('chart-tooltip-close')).toContainText('3,200.25');await expect(page.getByTestId('chart-tooltip-close')).not.toContainText('포인트');await expect(page.getByTestId('chart-tooltip-close')).toHaveCSS('color','rgb(96, 165, 250)');
 await page.getByRole('button',{name:'다음 시장 또는 종목',exact:true}).click();await expect(page.getByTestId('investor-navigation')).toContainText('KOSDAQ');
 await page.getByRole('button',{name:'종목별',exact:true}).click();await expect(page.getByTestId('investor-navigation')).toContainText('삼성전자 (보유)');
 await expect(page.getByRole('button',{name:'거래대금 또는 거래량',exact:true})).toHaveText('거래량');await expect(page.getByRole('table')).toContainText('9,007,199,254,740,993');
 await expect(page.getByTestId('investor-history-row')).toHaveCount(50);
 const first=await page.getByTestId('investor-history-row').first().elementHandle();
 await page.getByTestId('investor-history-card').getByRole('button',{name:'더보기',exact:true}).click();await expect(page.getByTestId('investor-history-row')).toHaveCount(52);await expect(page.getByTestId('investor-history-card').getByRole('button',{name:'더보기',exact:true})).toHaveCount(0);expect(await first!.evaluate(n=>n.isConnected)).toBe(true);
 await page.getByRole('button',{name:'거래대금 또는 거래량',exact:true}).click();await expect(page.getByTestId('investor-history-row')).toHaveCount(50);await expect(page.getByRole('table')).toContainText('-3,200');
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
 await fixture(page);await page.goto('/more');const menu=page.getByTestId('more-menu');await expect(menu.getByRole('button')).toHaveCount(16);
 const names=await menu.getByRole('button').allTextContents();expect(names.slice(-4)).toEqual(['투자동향','종목 관리','모니터링','설정']);expect(names.indexOf('투자동향')).toBe(names.indexOf('복리계획')+1);expect(names.indexOf('종목소식')).toBe(9);expect(names.indexOf('종목소식')).toBe(names.indexOf('가치분석')+1);
 const settings=await menu.getByRole('button',{name:'설정',exact:true}).boundingBox(),monitor=await menu.getByRole('button',{name:'모니터링',exact:true}).boundingBox();expect(settings!.width).toBeCloseTo(monitor!.width,1);expect(settings!.y).toBeCloseTo(monitor!.y,1);
});

test('investor monitoring links summaries and details without turning limited data into success or failure',async({page},info)=>{
 await fixture(page);
 const feature={id:'investor-trends',name:'투자동향',schedule:'시험 KST 18:00·21:00',status:'PARTIAL',lastAttemptAt:'2026-10-16T03:00:00Z',lastSuccessAt:null,lastDataAt:'2026-10-16T00:00:00Z',lastCollectedAt:'2026-10-16T03:01:00Z',nextAt:null,recent:{target:3,processed:1,success:1,failed:0,skipped:2,excluded:0},resultScope:{runId:'99',label:'최근 실행 대상 결과'},lastExecution:{id:'99',status:'PARTIAL',startedAt:'2026-10-16T03:00:00Z',finishedAt:'2026-10-16T03:01:00Z'},investor:{rawOnly:1,quantityStored:1,waiting:1,failed:0,other:0,dataScope:'현재 연결 DB의 기록',scheduleEnabled:false,notice:'원격 격리 시험 DB 기록은 포함하지 않습니다. 원문 저장·수량 저장은 전체 수집 성공이 아닙니다.'}};
 const items=[{id:'1',symbol:'KOSPI',status:'STALE',reason:'RAW_OBSERVATION_ONLY: 단위 검증 대기'},{id:'2',symbol:'005930',status:'STALE',reason:'PARTIAL_FIELDS: KRX 수량 저장'},{id:'3',symbol:'000660',status:'SKIPPED',reason:'NO_CURRENT_DATA: 미제공'}];
 await page.route('**/api/collection/monitoring**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:{data:path==='/api/collection/monitoring'?{features:[feature,{...feature,id:'dart-financial-statements',name:'DART 재무제표',status:'WAITING',investor:undefined}],generatedAt:'2026-10-16T03:01:00Z'}:path.endsWith('/items')?{rows:items,hasNext:false,nextCursor:null}:path.endsWith('/runs')?{rows:[{id:'99',status:'PARTIAL',target:3,success:0,failed:0,skipped:3,excluded:0}],hasNext:false,nextCursor:null}:{id:'investor-trends',name:'투자동향'}}});});
 await page.goto('/detail/collection-monitoring');
 await expect(page.getByRole('link',{name:'투자동향 상세 보기'})).toBeVisible();await expect(page.getByRole('link',{name:'종목 데이터 수집 상세 보기'})).toBeVisible();
 const ids=await page.locator('[data-testid^="monitor-feature-"]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-testid')));expect(ids.indexOf('monitor-feature-investor-trends')).toBeLessThan(ids.indexOf('monitor-feature-dart-financial-statements'));
 const card=page.getByRole('link',{name:'투자동향 상세 보기'});await expect(card).toContainText('자료 제한');await expect(card).toContainText('수집 성공 1/3건');await card.click();
 await expect(page.getByTestId('monitor-investor-diagnostics')).toContainText('원문만 저장');await expect(page.getByTestId('monitor-investor-diagnostics')).toContainText('전체 수집 성공이 아닙니다');
 await expect(page.getByTestId('monitor-current')).toContainText('자동 실행 연결 미확인');
 await page.screenshot({path:info.outputPath('investor-monitoring.png')});
 await page.goto('/detail/collection-monitoring/investor-trends/items');await expect(page.getByTestId('monitor-target-row')).toHaveCount(3);
 for(const label of ['원문만 저장','KRX 수량 저장','자료 미제공 대기'])await expect(page.getByTestId('monitor-results-data')).toContainText(label);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('date navigation changes only daily net purchases and retains chart plus appended history',async({page})=>{
 await fixture(page);
 const requests:string[]=[];page.on('request',request=>{if(request.url().includes('/api/investor-trends'))requests.push(request.url());});
 await page.goto('/detail/investor-trends?date=2026-10-16');
 const history=page.getByTestId('investor-history-card'),chart=page.getByTestId('investor-chart-frame');
 await expect(page.getByTestId('investor-history-row')).toHaveCount(50);
 await history.getByRole('button',{name:'더보기',exact:true}).click();await expect(page.getByTestId('investor-history-row')).toHaveCount(52);
 const chartHtml=await chart.innerHTML(),historyHtml=await history.innerHTML();
 await page.evaluate(()=>{(window as any).__firstHistory=document.querySelector('[data-testid="investor-history-row"]');});
 const start=requests.length;await page.getByRole('button',{name:'이전 날짜',exact:true}).click();
 await expect(page.getByLabel('투자동향 기준일')).toHaveValue('2026-10-15');
 await expect.poll(()=>requests.slice(start).some(url=>new URL(url).searchParams.get('date')==='2026-10-15')).toBe(true);
 expect(requests.slice(start)).toHaveLength(1);expect(requests.slice(start)[0]).not.toContain('/history');
 expect(await chart.innerHTML()).toBe(chartHtml);expect(await history.innerHTML()).toBe(historyHtml);
 expect(await page.evaluate(()=>(window as any).__firstHistory===document.querySelector('[data-testid="investor-history-row"]'))).toBe(true);
 for(const cell of await page.getByTestId('investor-history-row').first().getByRole('cell').all()){
  expect(await cell.evaluate(node=>node.getBoundingClientRect().height)).toBe(17);
 }
 await expect(history).not.toContainText('순매수:');
});

test('daily date changes retain numeric values until delayed response replaces them',async({page})=>{
 await fixture(page);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/investor-trends?**',async route=>{
  const url=new URL(route.request().url()),selectedDate=url.searchParams.get('date');
  if(selectedDate==='2026-10-15')await gate;
  const value=selectedDate==='2026-10-15'?'2000000':'1000000';
  return route.fulfill({json:{data:{selectedDate,actualFrom:selectedDate,actualTo:selectedDate,unit:'KRW',partial:false,rows:['INDIVIDUAL','FOREIGN','INSTITUTION'].map(code=>({code,net:value})),points:[]}}});
 });
 await page.goto('/detail/investor-trends?date=2026-10-16');
 const card=page.getByTestId('investor-daily-card');await expect(card.getByText('+100만원',{exact:true})).toHaveCount(3);
 await page.getByRole('button',{name:'이전 날짜',exact:true}).click();await expect(page.getByLabel('투자동향 기준일')).toHaveValue('2026-10-15');
 await expect(card.getByText('+100만원',{exact:true})).toHaveCount(3);await expect(card).not.toContainText('—');
 release();await expect(card.getByText('+200만원',{exact:true})).toHaveCount(3);await expect(card).not.toContainText('—');
});

test('source tooltip groups readable lines and contains the exchange notice instead of card footer',async({page})=>{
 await fixture(page);await page.goto('/detail/investor-trends?mode=stock&symbol=005930&date=2026-10-16');
 const card=page.getByTestId('investor-daily-card');await expect(card).not.toContainText('KRX+NXT 합계');
 await page.getByRole('button',{name:'투자동향 자료 기준'}).hover();
 const tooltip=page.getByTestId('investor-source-tooltip');await expect(tooltip).toBeVisible();await expect(tooltip).toContainText('KRX+NXT 합계 · 종가 KRX 기준');
 await expect(tooltip).toHaveCSS('white-space','pre-line');await expect(tooltip).toHaveCSS('gap','6px');await expect(tooltip).toContainText('순매수 = 매수 − 매도');
});

test('investor chart detail opens with current scope and supports returning to summary',async({page})=>{
 await fixture(page);await page.goto('/detail/investor-trends?date=2026-10-16&mode=market&metric=amount&period=60');
 const title=page.getByRole('heading',{name:'누적 순매수 추이',exact:true});const caption=page.getByTestId('investor-chart-caption');
 expect((await caption.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y);
 await page.getByRole('button',{name:'상세보기 ›',exact:true}).click();await expect(page).toHaveURL(/chart=detail/);
 const dialog=page.getByRole('dialog',{name:'누적 순매수 차트 상세보기'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('KOSPI · 거래대금');await expect(dialog.getByRole('button',{name:'60일',exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.getByRole('button',{name:'120일',exact:true}).click();await expect(dialog.getByRole('button',{name:'120일',exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.getByRole('button',{name:'차트 상세 뒤로가기'}).click();await expect(dialog).not.toBeVisible();await expect(page).not.toHaveURL(/chart=detail/);await expect(page.getByTestId('investor-daily-card')).toBeVisible();
});
