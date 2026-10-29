/** Display rounding only; preserve full precision in inputs, storage and calculations. */
export function financialNumber(value:string|null|undefined,digits=2):string {
 if(value==null||!/^[-+]?\d+(?:\.\d+)?$/.test(value))return '—';
 const negative=value.startsWith('-'),unsigned=value.replace(/^[-+]/,''),[whole,fraction='']=unsigned.split('.');
 const scale=10n**BigInt(digits),kept=fraction.slice(0,digits).padEnd(digits,'0');
 let rounded=BigInt(whole!)*scale+BigInt(kept||'0');
 if(Number(fraction[digits]??'0')>=5)rounded+=1n;
 const integer=(rounded/scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const decimals=digits?(rounded%scale).toString().padStart(digits,'0').replace(/0+$/,''):'';
 return (negative&&rounded!==0n?'-':'')+integer+(decimals?'.'+decimals:'');
}
export const currencyLabel=(currency='KRW')=>currency==='KRW'?'KRW':'외화 · '+currency;
/** Original foreign source figures retain precision unless a metric explicitly requests rounding. */
export function originalAmount(value:string|null|undefined,currency='KRW',digits?:number) {
 if(value==null)return '—';
 if(digits!==undefined)return financialNumber(value,digits)+' '+currency;
 const [integer,fraction]=value.split('.');
 return integer!.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'')+' '+currency;
}
