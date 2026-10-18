export const currencyLabel=(currency='KRW')=>currency==='KRW'?'KRW':'외화 · '+currency;
/** Exact original decimal display, without a binary floating point conversion. */
export function originalAmount(value:string|null|undefined,currency='KRW') {
 if(value==null)return '—';
 const [integer,fraction]=value.split('.');
 return integer!.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'')+' '+currency;
}
