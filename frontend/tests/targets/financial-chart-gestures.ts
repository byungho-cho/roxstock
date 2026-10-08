import type {Page} from '@playwright/test';
export async function swipeStock(page:Page,next:boolean){
 const bar=page.getByTestId('financial-sticky-header'),box=(await bar.boundingBox())!,cdp=await page.context().newCDPSession(page);
 const y=box.y+4,start=next?box.x+box.width-40:box.x+40,end=next?box.x+40:box.x+box.width-40;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:end,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
