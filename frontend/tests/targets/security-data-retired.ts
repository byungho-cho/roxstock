import {expect,type Page} from './authenticated-test';
/** Existing report views retain reads, but old ranges and persisted jobs cannot launch collection. */
export async function assertRetiredEntry(page:Page,path='/detail/value?view=chart&selected=1'){
 const requests:string[]=[];page.on('request',r=>{if(/\/financial-refresh(?:\/active|\/\d+)?(?:\?|$)/.test(new URL(r.url()).pathname))requests.push(r.method()+' '+new URL(r.url()).pathname);});
 await page.route('**/api/security-data/annual',r=>r.fulfill({json:{data:{asOf:'2026-10-27T00:00:00Z',buckets:[]}}}));
 await page.route('**/api/security-data/quarters',r=>r.fulfill({json:{data:{asOf:'2026-10-27T00:00:00Z',quarters:[]}}}));
 await page.goto(path);const button=page.locator('main').getByRole('button',{name:'종목 관리',exact:true});await expect(button).toBeEnabled();await expect(page.locator('main').getByRole('button',{name:'재무제표 갱신',exact:true})).toHaveCount(0);await button.click();await expect(page).toHaveURL(/\/detail\/security-data$/);await expect(page.getByTestId('security-data-page')).toBeVisible();await page.reload();await expect(page.getByTestId('security-data-page')).toBeVisible();expect(requests).toEqual([]);
}
