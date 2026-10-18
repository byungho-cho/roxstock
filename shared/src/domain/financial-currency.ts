/** Legacy filings were accepted only in KRW. Never infer a new currency for them. */
export function financialCurrency(f:{sourceValidation?:unknown}|undefined):string {
 const proof=f?.sourceValidation as {currency?:unknown}|null;
 return typeof proof?.currency==='string'&&/^[A-Z]{3}$/.test(proof.currency)?proof.currency:'KRW';
}
export const currencyConversionRequired=(currency:string|undefined)=>!!currency&&currency!=='KRW';
export const FX_REQUIRED='CURRENCY_CONVERSION_REQUIRED';
export function sameFinancialCurrency(a:{sourceValidation?:unknown}|undefined,b:{sourceValidation?:unknown}|undefined){
 return !!a&&!!b&&financialCurrency(a)===financialCurrency(b);
}
