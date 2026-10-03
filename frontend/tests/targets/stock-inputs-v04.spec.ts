import {test,expect,type Locator,type Page} from '@playwright/test';
import {fixture,selected} from './stock-input-fixture';
const tablet=(page:Page)=>page.viewportSize()!.width>=600;
const flow=(page:Page)=>tablet(page)?page.getByRole('dialog'):page.locator('main');
async function center(page:Page,dialog:Locator,width:number){const b=(await dialog.boundingBox())!,v=page.viewportSize()!;expect(b.width).toBe(width);expect(b.x+b.width/2).toBeCloseTo(v.width/2,0);expect(b.y+b.height/2).toBeCloseTo(v.height/2,0);expect(b.height).toBeLessThanOrEqual(v.height-32);}
async function evidence(page:Page,path:string){await page.screenshot({path});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test('price editor is a cover screen or 338px tablet popup; failed Enter preserves input and retry refreshes',async({page},info)=>{
 const f=await fixture(page);await selected(page);await page.getByRole('button',{name:/65,000원/}).last().click();
 const editor=page.getByTestId('stock-price-form');await expect(editor).toBeVisible();const input=editor.getByRole('textbox',{name:'금액',exact:true});await expect(input).toBeFocused();
 if(tablet(page))await center(page,page.getByRole('dialog'),338);else{await expect(page).toHaveURL(/stocks\/1\/price/);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'현재가 수정'})).toBeVisible();expect(await page.locator('main').evaluate(n=>getComputedStyle(n).paddingLeft)).toBe('8px');}
 await evidence(page,info.outputPath('price-initial.png'));await input.fill('518000');f.fail();await input.press('Enter');await expect(editor.getByRole('alert')).toContainText('테스트 저장 실패');await expect(input).toHaveValue('518,000');await evidence(page,info.outputPath('price-input.png'));
 f.success();await editor.getByRole('button',{name:'변경',exact:true}).dblclick();await expect(editor).toHaveCount(0);expect(f.writes).toHaveLength(2);expect(f.writes[1]).toMatchObject({method:'PATCH',path:'/api/securities/1/price',body:{currentPrice:'518000'}});await expect(page.getByTestId('lot-lot1')).toContainText('36,260,000원');expect(f.reads.filter(p=>p.endsWith('/holdings')).length).toBeGreaterThan(1);
});
for(const type of ['buy','sell'] as const)for(const edit of [false,true])test(`${type} ${edit?'edit':'registration'} form: centered fixed header, body-only scroll, accessible final action and preserved background`,async({page},info)=>{
 const f=await fixture(page);await selected(page);
 const left=page.getByTestId('stock-left'),right=page.getByTestId('stock-right');
 if(tablet(page)){await left.evaluate(n=>n.scrollTop=60);await right.evaluate(n=>n.scrollTop=10);}
 const before=tablet(page)?[await left.evaluate(n=>n.scrollTop),await right.evaluate(n=>n.scrollTop)]:[];
 // Use the existing navigation entry while retaining the selected stock and both columns.
 if(type==='buy'&&!edit)await page.getByRole('button',{name:'매수',exact:true}).click();
 else if(type==='buy')await page.getByRole('button',{name:'lot1 매수 수정'}).click();
 else if(!edit)await page.getByTestId('lot-lot1').getByRole('button',{name:'2026-09-10 Lot 매도'}).click();
 else{await page.getByRole('tab',{name:'거래내역',exact:true}).click();await page.getByRole('button',{name:'s1 매도 수정'}).click();}
 const root=flow(page);await expect(page.getByTestId('trade-form')).toBeVisible();if(!tablet(page))await expect(page.locator('.MuiBottomNavigation-root:visible .Mui-selected')).toContainText('종목목록');
 if(tablet(page)){await center(page,root,370);expect((await page.getByTestId('stock-flow-modal-title').boundingBox())!.height).toBe(44);}else{await expect(page.getByRole('dialog')).toHaveCount(0);expect((await page.locator('header').boundingBox())!.height).toBe(44);}
 const quantity=root.getByRole('textbox',{name:type==='buy'?'매수수량':'매도수량',exact:true}),price=root.getByRole('textbox',{name:type==='buy'?'매수가격':'매도가격',exact:true});
 if(type==='buy'&&!edit){await quantity.fill('10');await price.fill('515000');}
 if(type==='buy'&&edit){await price.fill('240000');await expect(root.getByTestId('average-comparison')).toContainText('변경 후 231,000원');await expect(root).toContainText('203,300,000원');}
 if(type==='sell'){await expect(root.getByLabel('매수일자',{exact:true})).toHaveCSS('-webkit-text-fill-color','rgba(0, 0, 0, 0)');await expect(root.getByRole('textbox',{name:'매수가격',exact:true})).toHaveValue('230,000');if(!edit)await expect(root).toContainText('20,230,000원');}
 await evidence(page,info.outputPath(`${type}-${edit?'edit':'add'}-top.png`));
 const body=tablet(page)?page.getByTestId('stock-flow-modal-body'):page.locator('main');const header=tablet(page)?page.getByTestId('stock-flow-modal-title'):page.locator('header');const headerBefore=(await header.boundingBox())!.y;
 const confirm=root.getByRole('button',{name:edit?'변경':type==='buy'?'매수':'매도',exact:true});await confirm.scrollIntoViewIfNeeded();await expect(confirm).toBeInViewport();expect((await header.boundingBox())!.y).toBe(headerBefore);expect(await body.evaluate(n=>n.scrollHeight>=n.clientHeight)).toBe(true);await evidence(page,info.outputPath(`${type}-${edit?'edit':'add'}-bottom.png`));
 f.fail();await confirm.click();await expect(root.getByRole('alert')).toContainText('테스트 저장 실패');await expect(quantity).toHaveValue(type==='buy'&&!edit?'10':'70');f.success();await confirm.dblclick();await expect(page).not.toHaveURL(/\/trade/);expect(f.writes).toHaveLength(2);expect(f.writes[1].method).toBe(edit?'PATCH':'POST');expect(f.writes[1].path).toBe(`/api/${type}-trades${edit?(type==='buy'?'/lot1':'/s1'):''}`);
 if(tablet(page)){await expect(page.getByTestId('stock-right')).toContainText('519,000원');if(type==='buy'&&!edit){expect(await left.evaluate(n=>n.scrollTop)).toBe(before[0]);expect(await right.evaluate(n=>n.scrollTop)).toBe(before[1]);}}
});
