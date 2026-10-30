import {useEffect, useState} from 'react';
import {skipToken,useQuery,useQueryClient} from '@tanstack/react-query';
import type {LiveQuote, QuoteMarket} from '../../../../shared/src/domain/live-quotes';

export type QuoteRow = {symbol:string; status:string; quote:LiveQuote|null; retained?:boolean};
type Packet = {marketOpen?:boolean;connection:string; active:number; limit:number; quotes:QuoteRow[]};
type Cached = Record<string,LiveQuote>;
const prefix = ['live-last-quotes'];
// The existing auth clear removes this user-scoped memory. No disk, DB or extra REST.
export function useQuoteStream(market:QuoteMarket,symbols:string[],identity:string) {
  const client=useQueryClient(), key=symbols.join(','), scope=market+':'+identity+':'+key;
  const cacheKey=[...prefix,identity,market];
  // Keep the memory entry while this screen is mounted, without fetching or subscribing to data renders.
  useQuery<Cached>({queryKey:cacheKey,queryFn:skipToken,enabled:false,gcTime:30*60_000,notifyOnChangeProps:[]});
  const restored=()=>{
    const cached=client.getQueryData<Cached>(cacheKey)??{};
    return symbols.filter(s=>cached[s]?.market===market).map(symbol=>({symbol,status:'LAST_QUOTE',retained:true,quote:cached[symbol]!}));
  };
  const initial=():Packet=>({connection:key?'CONNECTING':'IDLE',active:0,limit:41,quotes:restored()});
  const [packet,setPacket]=useState<Packet&{scope:string}>(()=>({...initial(),scope}));
  useEffect(()=>{
    let alive=true,stream:EventSource|null=null;
    setPacket({...initial(),scope});
    if(!key||!identity)return;
    const unavailable=(connection:string)=>setPacket(p=>({...p,connection,quotes:p.quotes.map(r=>({...r,status:connection,retained:!!r.quote}))}));
    const offline=()=>{stream?.close();stream=null;if(alive)unavailable('RECONNECTING');};
    const connect=()=>{
      if(!alive||!navigator.onLine){offline();return;}
      if(stream)return;
      const current=new EventSource(`/api/live-quotes/stream?market=${market}`,{withCredentials:true});stream=current;
      current.addEventListener('quotes',event=>{
        if(!alive||stream!==current||!navigator.onLine)return;
        try{
          const next=JSON.parse((event as MessageEvent).data) as Packet;
          if(!Array.isArray(next.quotes)||next.quotes.some(r=>r.quote&&r.quote.market!==market))return;
          const cached={...(client.getQueryData<Cached>(cacheKey)??{})};
          for(const r of next.quotes)if(r.quote&&Number.isFinite(r.quote.price)&&r.quote.price>0)cached[r.symbol]=r.quote;
          // One latest entry per symbol, bounded even after many display-list changes.
          const bounded=Object.fromEntries(Object.entries(cached).sort((a,b)=>b[1].receivedAt-a[1].receivedAt).slice(0,500));
          client.setQueryData(cacheKey,bounded);
          setPacket(p=>({...next,scope,quotes:symbols.map(symbol=>{
            const row=next.quotes.find(r=>r.symbol===symbol),old=p.scope===scope?p.quotes.find(r=>r.symbol===symbol)?.quote:null;
            const quote=row?.quote??old??bounded[symbol]??null;
            return {symbol,quote,status:row?.status??next.connection,retained:!!quote&&row?.status!=='LIVE'};
          })}));
        }catch{unavailable('DISCONNECTED');}
      });
      current.onerror=()=>{if(alive&&stream===current)unavailable('RECONNECTING');};
    };
    window.addEventListener('offline',offline);window.addEventListener('online',connect);connect();
    return()=>{alive=false;window.removeEventListener('offline',offline);window.removeEventListener('online',connect);stream?.close();stream=null;};
  },[market,key,identity,client]);
  return packet.scope===scope?packet:initial();
}
