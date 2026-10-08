import type {Page} from '@playwright/test';
/** Navigation regression uses the same title touch sequence as phase8; ui13 also tests native CDP gestures. */
export async function swipeStock(page:Page,next:boolean){
 const title=page.getByText('재무지표',{exact:true}),dx=next?-120:120;
 await title.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:180,clientY:130}]});
 await title.dispatchEvent('touchmove',{touches:[{identifier:1,clientX:180+dx,clientY:134}]});
 await title.dispatchEvent('touchend',{touches:[],changedTouches:[{identifier:1,clientX:180+dx,clientY:134}]});
}
