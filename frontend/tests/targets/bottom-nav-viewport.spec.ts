import {test,expect} from '@playwright/test';
import {fixture} from './stock-news-fixture';
test('shared footer stays at the usable viewport bottom across pages and resize cycles',async({page},info)=>{
 await fixture(page,{longSummary:true,long:true});
 for(const path of ['/more','/','/detail/stock-news','/detail/stock-news/100']){
  await page.goto(path);const nav=page.getByRole('navigation',{name:'하단 메뉴'});await expect(nav).toBeVisible();
  const original=page.viewportSize()!;
  for(const viewport of [original,{width:original.height,height:original.width},{width:original.width,height:Math.max(300,original.height-160)},original]){
   await page.setViewportSize(viewport);
   await expect.poll(async()=>nav.evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight))).toBeLessThanOrEqual(1);
   const bounds=await page.locator('main').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,scrollHeight:el.scrollHeight,height:el.clientHeight}));
   expect(bounds.bottom).toBeLessThanOrEqual((await nav.boundingBox())!.y+1);
   await page.locator('main').evaluate(el=>el.scrollTop=el.scrollHeight);
   expect(await nav.evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight))).toBeLessThanOrEqual(1);
  }
  if(path==='/more'){
   const shortcuts=page.getByTestId('more-menu');await shortcuts.evaluate(el=>el.scrollTop=el.scrollHeight);
   await expect(page.getByTestId('more-shortcut').last()).toBeInViewport({ratio:1});
   expect((await page.getByTestId('more-shortcut').last().boundingBox())!.y+(await page.getByTestId('more-shortcut').last().boundingBox())!.height).toBeLessThanOrEqual((await nav.boundingBox())!.y+1);
  }
  await page.screenshot({path:info.outputPath(path.replaceAll('/','_')+'-footer.png')});
 }
 const nav=page.getByRole('navigation',{name:'하단 메뉴'});await expect(nav.getByRole('button',{name:'종목소식',exact:true})).toHaveAttribute('aria-current','page');
 const menu=page.getByTestId('bottom-menu-scroll');await menu.evaluate(el=>el.scrollLeft=el.scrollWidth);expect(await menu.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
});
