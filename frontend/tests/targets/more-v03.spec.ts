import { expect, test, type Page } from '@playwright/test';
const menus = [
  ['홈', '/'], ['종목목록', '/stocks'], ['매매일지', '/journal'],
  ['자산분석', '/assets'], ['예수금', '/detail/cash'], ['투자금', '/detail/investment'],
  ['투자손익', '/detail/investment-profit'], ['가치분석', '/detail/value'], ['재무제표', '/detail/financials'],
  ['복리계획', '/detail/compound'], ['모니터링', '/detail/collection-monitoring'], ['설정', '/detail/settings?view=settings'],
] as const;
async function fixture(page: Page) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/accounts') return route.fulfill({ json: {data: [{id:'1', name:'기본 계좌', brokerName:'CI', isActive:true, isDefault:true, cashBalance:'0'}]} });
    return route.fulfill({ status: 503, json: {error: {message: 'Navigation fixture: data unavailable'}} });
  });
}

test('more v0.3: 12 equal buttons, fixed header/nav, 8px edges and exact icon sizes', async ({page}, info) => {
  await fixture(page); await page.goto('/more');
  const menu=page.getByTestId('more-menu');await expect(menu.getByRole('button')).toHaveCount(12);
  await expect(menu.getByRole('button')).toHaveText(menus.map(([label])=>label));
  await expect(page.getByRole('heading',{name:'더보기',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'메뉴',exact:true})).toBeVisible();
  const title=await page.getByRole('heading',{name:'메뉴',exact:true}).boundingBox();expect(title!.x).toBe(8);expect(title!.y+title!.height).toBeLessThanOrEqual(44);
  expect(await page.locator('header .MuiToolbar-root').evaluate(n=>[getComputedStyle(n).paddingLeft,getComputedStyle(n).paddingRight])).toEqual(['8px','8px']);await expect(page.getByRole('button',{name:'뒤로가기'})).toHaveCount(0);
  await page.evaluate(()=>document.fonts.ready);
  const state=await page.evaluate(()=>{
    const main=document.querySelector('main')!,menu=document.querySelector('[data-testid="more-menu"]')!,nav=document.querySelector('.MuiBottomNavigation-root:not([hidden])')!;
    const visibleNav=[...document.querySelectorAll('.MuiBottomNavigation-root')].find(n=>getComputedStyle(n).display!=='none')!;
    const rect=(n:Element)=>n.getBoundingClientRect().toJSON();
    const buttons=[...menu.querySelectorAll('button')];
    const icons=[...menu.querySelectorAll('img')].map(n=>({loaded:n.complete&&n.naturalWidth>0,natural:[n.naturalWidth,n.naturalHeight],rect:rect(n)}));
    return {padding:[getComputedStyle(main).paddingTop,getComputedStyle(main).paddingLeft,getComputedStyle(main).paddingRight,getComputedStyle(main).paddingBottom],main:rect(main),menu:rect(menu),header:rect(document.querySelector('header')!),nav:rect(visibleNav),mainScroll:main.scrollHeight>main.clientHeight+1,bodyOverflow:document.documentElement.scrollWidth>innerWidth,buttons:buttons.map(rect),icons,labels:buttons.map(n=>{const t=n.querySelector('p')!;return {rect:rect(t),clipped:t.scrollWidth>t.clientWidth+1||t.scrollHeight>t.clientHeight+1};}),styles:buttons.map(n=>({background:getComputedStyle(n).backgroundColor,border:getComputedStyle(n).borderColor,radius:getComputedStyle(n).borderRadius})),navIcons:[...visibleNav.querySelectorAll('img')].map(n=>({natural:[(n as HTMLImageElement).naturalWidth,(n as HTMLImageElement).naturalHeight],rect:rect(n)}))};
  });
  expect(state.padding).toEqual(['0px','8px','8px','8px']);expect(state.header.height).toBe(44);expect(state.nav.height).toBe(44);expect(state.mainScroll).toBe(false);expect(state.bodyOverflow).toBe(false);expect(state.menu.x).toBe(8);expect(state.menu.y).toBe(44);expect(state.nav.y-state.menu.bottom).toBeCloseTo(8,1);
  for (const [index,b] of state.buttons.entries()) {
    expect(b.height).toBeCloseTo((state.main.height-8-24)/4,1);expect(b.y).toBeCloseTo(44+Math.floor(index/3)*(b.height+8),1);expect(b.left).toBeCloseTo(8+(index%3)*(b.width+8),1);expect(b.bottom).toBeLessThanOrEqual(state.nav.y-7.9);
    expect(state.styles[index]).toEqual({background:'rgb(9, 15, 28)',border:'rgb(33, 48, 74)',radius:'12px'});
    expect(state.labels[index].clipped).toBe(false);expect(state.labels[index].rect.bottom).toBeLessThan(b.bottom);expect(state.icons[index].rect.top).toBeGreaterThan(b.top);expect(state.icons[index].rect.bottom).toBeLessThan(b.bottom);
  }
  for(const icon of state.icons){expect(icon.loaded).toBe(true);expect(icon.natural).toEqual([20,20]);expect(icon.rect.width).toBe(20);expect(icon.rect.height).toBe(20);}
  const tablet=info.project.name.startsWith('tablet');expect(state.navIcons).toHaveLength(tablet?9:5);for(const icon of state.navIcons){expect(icon.natural).toEqual(tablet?[16,16]:[18,18]);expect(icon.rect.width).toBe(tablet?16:18);expect(icon.rect.height).toBe(tablet?16:18);}
  if(info.project.name==='cover-370x465')expect(state.buttons[0].height).toBeCloseTo(86.25,1);
  if(tablet) {
    const panel=await page.getByTestId('more-settings-panel').boundingBox();expect(panel).not.toBeNull();expect(panel!.x-state.menu.right).toBeCloseTo(16,1);expect(panel!.y).toBe(44);expect(panel!.height).toBeCloseTo(state.menu.height,1);
    const contained=await page.getByTestId('more-settings-panel').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('button,p')].every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom;});});expect(contained).toBe(true);
    if(info.project.name==='tablet-725x396')expect(state.buttons[0].height).toBe(69);
  } else await expect(page.getByTestId('more-settings-area')).toBeHidden();
  await expect(page.getByRole('button',{name:'맨 위로'})).toBeHidden();
});

test('more v0.3: all 12 routes retain their existing destinations',async({page})=>{
  test.setTimeout(60_000);
  await fixture(page);await page.goto('/more');
  for(const [label,path] of menus){await page.getByTestId('more-menu').getByRole('button',{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(path==='/'?'/$':path.replace(/[?]/g,'\\?')+'$'));await page.goBack();await expect(page.getByTestId('more-menu')).toBeVisible();}
});

test('more v0.3: tablet settings links and persisted theme selection',async({page},info)=>{
  test.skip(!info.project.name.startsWith('tablet'),'Inline settings are tablet-only');await fixture(page);await page.goto('/more');
  const panel=page.getByTestId('more-settings-panel');
  await expect(panel.getByRole('button',{name:'다크',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const [label,value] of [['라이트','light'],['시스템 설정','system'],['다크','dark']] as const){await panel.getByRole('button',{name:label,exact:true}).click();await expect(panel.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('roxstock-170-demo-settings-v2')!).theme)).toBe(value);}
  await page.reload();await expect(page.getByTestId('more-settings-panel').getByRole('button',{name:'다크',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const [label,view] of [['계좌 관리','account'],['시세 수집','collection'],['테마 설정','theme']] as const){await page.goto('/more');await page.getByTestId('more-settings-panel').getByRole('button',{name:new RegExp(label)}).click();await expect(page).toHaveURL(new RegExp('detail/settings\\?view='+view+'$'));}
});
