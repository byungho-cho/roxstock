import {inflateRawSync} from 'node:zlib';
import type {SecurityMasterItem,SupportedMarketType} from '../types.js';
type Classification=NonNullable<SecurityMasterItem['productClassification']>;
/** Public KIS master layout: stocks_info/kis_{kospi,kosdaq}_code_mst.py. No access token. */
export function parseKisProductMaster(text:string,market:SupportedMarketType,observedAt=new Date().toISOString()){
 const result=new Map<string,Classification>(),seen=new Set<string>(),tail=market==='KOSPI'?228:222;
 for(const raw of text.replaceAll('\r\n','\n').split('\n')){if(!raw)continue;const row=raw+'\n';if(row.length<tail+22)throw Error('PRODUCT_MASTER_LAYOUT');const symbol=row.slice(0,9).trim(),isin=row.slice(9,21),group=row.slice(-tail).slice(0,2);if(!/^[A-Z0-9]{1,9}$/.test(symbol)||! /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)||! /^[A-Z]{2}$/.test(group))throw Error('PRODUCT_MASTER_IDENTITY');if(!/^[A-Z0-9]{6}$/.test(symbol))continue;if(seen.has(symbol))throw Error('PRODUCT_MASTER_IDENTITY');seen.add(symbol);
  const type=({ST:'STOCK',RT:'REIT',EF:'ETF',EN:'ETN'} as const)[group as 'ST'|'RT'|'EF'|'EN'];if(type)result.set(market+':'+symbol,{type,source:'KIS_PUBLIC_MASTER',group,observedAt});
 }if(!seen.size)throw Error('PRODUCT_MASTER_EMPTY');return result;
}
export function decodeMasterZip(data:Uint8Array,name:string){
 if(data.length>5_000_000)throw Error('PRODUCT_MASTER_LIMIT');const b=Buffer.from(data);let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){end=i;break;}if(end<0)throw Error('PRODUCT_MASTER_ZIP');let pos=b.readUInt32LE(end+16);const count=b.readUInt16LE(end+10);if(count>10)throw Error('PRODUCT_MASTER_ENTRIES');
 for(let i=0;i<count;i++){if(pos+46>b.length||b.readUInt32LE(pos)!==0x02014b50)throw Error('PRODUCT_MASTER_ZIP');const len=b.readUInt16LE(pos+28),extra=b.readUInt16LE(pos+30),comment=b.readUInt16LE(pos+32);if(b.subarray(pos+46,pos+46+len).toString()===name){const size=b.readUInt32LE(pos+20),offset=b.readUInt32LE(pos+42);if(offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50)throw Error('PRODUCT_MASTER_ZIP');const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);if(start+size>b.length)throw Error('PRODUCT_MASTER_ZIP');const method=b.readUInt16LE(pos+10),compressed=b.subarray(start,start+size),out=method===0?compressed:method===8?inflateRawSync(compressed,{maxOutputLength:20_000_000}):null;if(!out||out.length>20_000_000)throw Error('PRODUCT_MASTER_COMPRESSION');return new TextDecoder('euc-kr',{fatal:true}).decode(out);}pos+=46+len+extra+comment;
 }throw Error('PRODUCT_MASTER_FILE');
}
export async function loadKisProductTypes(fetcher:typeof fetch=fetch){
 const result=new Map<string,Classification>();for(const market of ['KOSPI','KOSDAQ'] as const){const name=market.toLowerCase()+'_code.mst';const r=await fetcher('https://new.real.download.dws.co.kr/common/master/'+name+'.zip',{signal:AbortSignal.timeout(20000)});if(!r.ok||Number(r.headers.get('content-length'))>5_000_000)throw Error('PRODUCT_MASTER_HTTP');if(!r.body)throw Error('PRODUCT_MASTER_EMPTY');const reader=r.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>5_000_000)throw Error('PRODUCT_MASTER_LIMIT');chunks.push(value);}}finally{await reader.cancel();}const data=Buffer.concat(chunks);for(const [key,value]of parseKisProductMaster(decodeMasterZip(data,name),market))result.set(key,value);}return result;
}
