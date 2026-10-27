import {test} from './authenticated-test';
import {setup} from './financial-ui-fixture';
import {assertRetiredEntry} from './security-data-retired';
test('historical refresh is retired and cannot resume from a retained browser job',async({page})=>{await setup(page);await page.addInitScript(()=>sessionStorage.setItem('financialRefresh:fixture-user:1','99'));await assertRetiredEntry(page);});
