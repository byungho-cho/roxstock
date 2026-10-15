const whole=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
const short=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2});
/** Display only; stored share counts and calculation denominators stay untouched. */
export function formatShareCount(value:string|number|null|undefined){
 if(value==null||value===''||!Number.isFinite(Number(value)))return '—';
 const n=Number(value),absolute=Math.abs(n);
 return absolute>=1e8?short.format(n/1e8)+'억주':absolute>=1e4?short.format(n/1e4)+'만주':whole.format(n)+'주';
}
