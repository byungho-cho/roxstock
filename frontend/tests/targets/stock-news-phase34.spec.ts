import {test,expect,type Page} from '@playwright/test';
import {fixture} from './stock-news-fixture';
async function frame(page:Page){
 const result=await page.getByTestId('news-summary-card').evaluate(card=>{const main=document.querySelector('main')!,body=document.querySelector('[data-testid="news-summary-body"]')!,nav=document.querySelector('[aria-label="하단 메뉴"]')!;return {card:card.getBoundingClientRect().toJSON(),main:main.getBoundingClientRect().toJSON(),nav:nav.getBoundingClientRect().toJSON(),overflow:main.scrollHeight-main.clientHeight,bodyStyle:getComputedStyle(body).overflowY,documentOverflow:document.documentElement.scrollWidth-innerWidth};});
 expect(result.nav.top-result.card.bottom).toBeGreaterThanOrEqual(7);expect(result.nav.top-result.card.bottom).toBeLessThanOrEqual(9);expect(result.overflow).toBeLessThanOrEqual(1);expect(result.bodyStyle).toBe('auto');expect(result.documentOverflow).toBeLessThanOrEqual(0);return result;
}
test('headers, click/keyboard status tooltip, holdings and ordinary More icon',async({page},info)=>{
 await fixture(page);await page.goto('/detail/stock-news');const cards=page.getByTestId('stock-news-card');await expect(cards).toHaveCount(10);
 await expect(page.locator('header img[src="/stock-news/newspaper.svg"]')).toHaveCount(0);await expect(page.getByText('일부 제공처 수집 실패',{exact:false})).toHaveCount(0);
 const status=page.getByRole('button',{name:'소식 수집 상태 설명'});await status.click();await expect(page.getByRole('tooltip')).toContainText('기존 목록');await page.keyboard.press('Escape');await status.focus();await page.keyboard.press('Enter');await expect(page.getByRole('tooltip')).toBeVisible();await page.keyboard.press('Escape');
 expect(await cards.first().evaluate(n=>getComputedStyle(n).borderColor)).toBe('rgb(251, 191, 36)');expect(await cards.nth(1).evaluate(n=>getComputedStyle(n).borderColor)).toBe('rgb(30, 41, 59)');
 await page.screenshot({path:info.outputPath('news-list-held-tooltip.png')});
 await cards.first().getByTestId('stock-news-title').click();await expect(page.getByTestId('news-detail-count')).toHaveText('1/26');await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toBeVisible();await expect(page.locator('header img[src="/stock-news/newspaper.svg"]')).toHaveCount(0);
 expect(await page.getByTestId('news-summary-card').evaluate(n=>getComputedStyle(n).borderColor)).toBe('rgb(251, 191, 36)');expect(await page.getByRole('heading',{level:2}).evaluate(n=>getComputedStyle(n).color)).toBe('rgb(251, 191, 36)');await frame(page);await page.screenshot({path:info.outputPath('news-detail-fill.png')});
 await page.getByRole('button',{name:'다음 ›'}).click();await expect(page.getByTestId('news-detail-count')).toHaveText('2/26');expect(await page.getByTestId('news-summary-card').evaluate(n=>getComputedStyle(n).borderColor)).toBe('rgba(0, 0, 0, 0)');await frame(page);
 await page.goto('/more');const icon=page.getByRole('img',{name:'종목소식 아이콘'});await expect(icon).toBeVisible();expect(await icon.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(240, 245, 255)');
 await page.getByRole('button',{name:'종목소식',exact:true}).first().click();const selected=page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'종목소식',exact:true});expect(await selected.evaluate(n=>getComputedStyle(n).color)).toBe('rgb(251, 191, 36)');
});
test('long content scrolls inside body only; resizing and missing summary keep filled card',async({page},info)=>{
 await fixture(page,{longSummary:true,long:true,partial:false});await page.goto('/detail/stock-news');await expect(page.getByRole('button',{name:'소식 수집 상태 설명'})).toHaveCount(0);await page.getByTestId('stock-news-card').first().getByTestId('stock-news-title').click();await expect(page.getByTestId('news-content-summary')).toBeVisible();
 await frame(page);const metadata=(await page.getByTestId('news-summary-metadata').boundingBox())!.y,nav=(await page.getByTestId('news-detail-navigation').boundingBox())!.y;
 await page.getByTestId('news-summary-body').evaluate(n=>n.scrollTop=n.scrollHeight);expect(await page.getByTestId('news-summary-body').evaluate(n=>n.scrollTop)).toBeGreaterThan(0);expect((await page.getByTestId('news-summary-metadata').boundingBox())!.y).toBe(metadata);expect((await page.getByTestId('news-detail-navigation').boundingBox())!.y).toBe(nav);await page.screenshot({path:info.outputPath('news-long-body-scroll.png')});
 for(const viewport of [{width:465,height:370},{width:396,height:725},{width:725,height:396},{width:370,height:465}]){await page.setViewportSize(viewport);await frame(page);}
 await page.getByRole('button',{name:'다음 ›'}).click();await page.getByRole('button',{name:'다음 ›'}).click();await expect(page.getByTestId('news-content-summary')).toHaveText('요약 정보 없음');await frame(page);await page.screenshot({path:info.outputPath('news-no-summary-fill.png')});
});
test('detail loading and request failure keep same available card height',async({page})=>{
 await fixture(page);let release=()=>{};await page.route('**/api/accounts/*/stock-news/100**',async r=>{await new Promise<void>(resolve=>release=resolve);await r.fulfill({status:503,json:{error:{message:'요약 조회 실패'}}});});
 await page.goto('/detail/stock-news/100');await expect(page.getByTestId('news-summary-card')).toBeVisible();const before=await frame(page);release();await expect(page.getByRole('alert')).toContainText('소식 요약 조회 실패',{timeout:15000});const after=await frame(page);expect(after.card.height).toBe(before.card.height);
});
test('target condition confirmation uses fixed common toast only after saved and refreshed report',async({page},info)=>{
 let version=0,failSave=false,failRefresh=false,reads=0;const conditions=[{days:30,rate:'10'}];
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url()),p=u.pathname;if(p.startsWith('/api/pages/'))return r.fulfill({status:404,json:{error:{message:'legacy'}}});
 if(p==='/api/accounts')return r.fulfill({json:{data:[{id:'1',name:'검증 계좌',isActive:true,isDefault:true}]}});
 if(p.endsWith('/target-arrival-conditions')){if(r.request().method()==='PUT'){if(failSave)return r.fulfill({status:500,json:{error:{message:'저장 실패'}}});version++;}return r.fulfill({json:{data:{accountId:'1',scope:'ACCOUNT',version,conditions}}});}
 if(p.endsWith('/target-arrivals')){reads++;if(failRefresh)return r.fulfill({status:503,json:{error:{message:'홈 목록 갱신 실패'}}});return r.fulfill({json:{data:[],meta:{accountId:'1',conditionsVersion:version,total:0,enabled:true}}});}
 return r.fulfill({json:{data:[]}});});
 await page.goto('/detail/settings?view=target-arrival');const save=page.getByRole('button',{name:'저장',exact:true});await expect(save).toBeEnabled();const y=(await save.boundingBox())!.y;
 await save.click();const toast=page.getByRole('alert').filter({hasText:'저장했습니다. 홈 목록을 갱신했습니다.'});await expect(toast).toBeVisible();expect(reads).toBeGreaterThan(0);expect((await save.boundingBox())!.y).toBe(y);expect(await toast.evaluate(n=>!!n.closest('.MuiSnackbar-root'))).toBe(true);await page.screenshot({path:info.outputPath('save-toast.png')});await expect(toast).not.toBeVisible({timeout:10000});
 failSave=true;await save.click();await expect(page.getByText('저장 실패',{exact:true})).toBeVisible();await expect(toast).toHaveCount(0);
 failSave=false;failRefresh=true;await save.click();await expect(page.getByText('홈 목록 갱신 실패',{exact:true})).toBeVisible({timeout:15000});await expect(toast).toHaveCount(0);
});
