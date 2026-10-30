import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import {CloseRounded,SearchRounded} from '@mui/icons-material';
import {StockSearchFrame} from '../../components/common/StockSearchFrame';
import {SegmentedTabs,ActionButton} from '../../components/common/Common';
import {QuoteSelect} from './QuoteSelect';
import {MarketSwitch} from './MarketSwitch';
import {showSuccessToast} from '../../components/common/QueryErrorNotice';
import {QuoteCard,statusText,quoteCardHeight} from './QuoteCard';
import {useQuoteStream} from './useQuoteStream';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputBase, Typography } from '@mui/material';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { HeaderAddButton } from '../../components/navigation/HeaderAddButton';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { useAuth } from '../../auth/AuthGate';
import { apiRequest } from '../../data/apiClient';
import { colors } from '../../styles/tokens';
import { maxDisplayStocks, displayListWithinLimit, orderStocks, reorderVisible, type DisplayStock, type QuoteMarket, type QuoteSort } from '../../../../shared/src/domain/live-quotes';
type List = {
    ids: string[];
    version: string;
    stocks: DisplayStock[];
};
const sorts:{value:QuoteSort;label:string}[]=[{value:'manual',label:'직접설정순'},{value:'name',label:'종목명순'},{value:'price',label:'주가금액순'},{value:'rate',label:'등락률순'},{value:'holding',label:'보유금액순'},{value:'profit',label:'보유손익순'}];
const same=(a:string[],b:string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
type DragVisual={id:string;x:number;y:number;width:number;height:number;offsetX:number;offsetY:number;settling:boolean};
export function LiveQuotesPage() {
    const navigate = useNavigate(), location = useLocation(), { user } = useAuth(), { accountId, accounts } = useActiveAccount(), client = useQueryClient();
    const [market, setMarket] = useState<QuoteMarket>('TOTAL'), [filter, setFilter] = useState('all'), [sort, setSort] = useState<QuoteSort>('manual');
    const [draft, setDraft] = useState<string[] | null>(null), [base, setBase] = useState<{
        ids: string[];
        version: string;
    } | null>(null), [saving, setSaving] = useState(false), [error, setError] = useState(''), [dragId, setDragId] = useState<string | null>(null);
    const [dragVisual,setDragVisual]=useState<DragVisual|null>(null),visualRef=useRef<DragVisual|null>(null),landingTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
    const localOrder = useRef<{
        accountId: string | undefined;
        ids: string[];
        version: string;
    } | null>(null), busy = useRef(false), gesture = useRef<{
        id: string;
        pointerId: number;
        x: number;
        y: number;
        timer: ReturnType<typeof setTimeout>;
        armed: boolean;
        last?: string;
    } | null>(null), suppressClick = useRef(false);
    const queryKey = ['live-quote-list', user?.id, accountId];
    const query = useQuery({ queryKey, enabled: !accounts.isPending, queryFn: ({ signal }) => apiRequest<List>(`/live-quotes/list${accountId ? '?accountId=' + accountId : ''}`, { signal }), staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
    const list = query.data, order = draft ?? list?.ids ?? [], dirty = !!draft && !!base && !same(draft, base.ids), dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.key !== nextLocation.key);
    const symbols = useMemo(() => list?.stocks.map(s => s.symbol) ?? [], [list?.stocks]);
    const packet = useQuoteStream(market, symbols, user?.id ?? '');
    const live = useMemo(() => Object.fromEntries(packet.quotes.filter(r => r.quote).map(r => [r.symbol, r.quote!])), [packet]);
    const allRows = list?.stocks ?? [];
    const candidates = allRows.filter(s => filter === 'all' || filter === 'holding' && s.held || filter === 'watch' && s.watched || filter === 'trade' && s.traded);
    const frozen = useRef<DisplayStock[] | null>(null), [pointerHold,setPointerHold]=useState(false),releaseHold=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
    // A KRX cache must not determine TOTAL/NXT price or holding-value sorting.
    const sorted = orderStocks(candidates.map(s => ({ ...s, initial: null, marketValue: null, profit: null })), order, sort, live);
    const rows = dragId && frozen.current ? frozen.current.map(s => allRows.find(r => r.id === s.id) ?? s).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : pointerHold&&frozen.current?frozen.current:sorted;
    const rowSignature=rows.map(r=>r.id).join(',');
    const oldRects=useRef(new Map<string,DOMRect>());
    useLayoutEffect(()=>{
      const nodes=Array.from(document.querySelectorAll<HTMLElement>('[data-live-root] [data-quote-id]'));
      const next=new Map<string,DOMRect>();
      for(const el of nodes){el.getAnimations().forEach(a=>a.cancel());const rect=el.getBoundingClientRect(),id=el.dataset.quoteId!;next.set(id,rect);const old=oldRects.current.get(id);
        if(old&&typeof el.animate==='function'&&id!==dragId&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&(old.x!==rect.x||old.y!==rect.y))el.animate([{transform:`translate(${old.x-rect.x}px,${old.y-rect.y}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
      }oldRects.current=next;
    },[rowSignature,dragId]);
    const visibleIds = useRef<string[]>([]);
    visibleIds.current = rows.map(r => r.id);
    const orderRef = useRef(order);
    orderRef.current = order;
    const discard = () => { clearTimeout(landingTimer.current);clearTimeout(releaseHold.current);visualRef.current=null;setDragVisual(null);setDragId(null);setPointerHold(false);frozen.current=null; setDraft(null); setBase(null); showSuccessToast('순서 변경을 취소했습니다.'); };
    const confirmDiscard = () => !dirty || window.confirm('저장하지 않은 순서가 있습니다. 변경을 취소할까요?');
    useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
    } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, []);
    useEffect(() => { if (!draft)
        return; localOrder.current = { accountId: base ? localOrder.current?.accountId : accountId, ids: draft, version: base?.version ?? '' }; }, [draft, base, accountId]);
    useEffect(() => { if (dirty && base && localOrder.current?.accountId !== accountId) {
        setError('계좌가 변경됐습니다. 기존 편집 순서는 유지되며 취소하거나 저장할 수 있습니다.');
    } }, [accountId, dirty, base]);
    useEffect(() => { const move = (e: TouchEvent) => { if (gesture.current?.armed)
        e.preventDefault(); }; document.addEventListener('touchmove', move, { passive: false }); return () => document.removeEventListener('touchmove', move); }, []);
    useEffect(() => {
      if(!dragId)return;
      const main=document.querySelector<HTMLElement>('[data-live-root]')?.closest('main');
      if(!main)return;
      let frame=0,previous=performance.now();
      const tick=(now:number)=>{
        const g=gesture.current,v=visualRef.current;if(!g?.armed||!v||v.settling)return;
        const elapsed=Math.min(32,Math.max(0,now-previous));previous=now;
        const box=main.getBoundingClientRect(),top=Math.max(0,box.top),bottom=Math.min(window.innerHeight,box.bottom);
        const edge=Math.min(56,(bottom-top)/3),middle=(top+bottom)/2;
        // The lifted card can touch an edge before the finger does. Keep scrolling while held still.
        const pressure=g.y<middle?(top+edge-Math.min(g.y,v.y))/edge:(Math.max(g.y,v.y+v.height)-(bottom-edge))/edge;
        if(pressure>0){const speed=120+600*Math.min(1,pressure),direction=g.y<middle?-1:1;
          main.scrollTop=Math.max(0,Math.min(main.scrollHeight-main.clientHeight,main.scrollTop+direction*speed*elapsed/1000));
        }
        const grid=document.querySelector('[data-testid=live-grid]')?.getBoundingClientRect();
        if(grid&&visibleIds.current.length){
          // Clamp to actual cards as well as the viewport: footer padding is not another row.
          const y=Math.max(grid.top+1,Math.min(grid.bottom-1,Math.max(top+1,Math.min(bottom-1,g.y))));
          updateTarget(g.x,y);
        }
        frame=requestAnimationFrame(tick);
      };
      // Scrolling/reordering can release native pointer capture. End the drag even over header/footer padding.
      const finish=(event:PointerEvent)=>{if(gesture.current?.armed&&gesture.current.pointerId===event.pointerId)end();};
      const outsideMove=(event:PointerEvent)=>{if(gesture.current?.armed&&!(event.target instanceof Element&&event.target.closest('[data-quote-id]')))move(event);};
      window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
      window.addEventListener('pointermove',outsideMove,{passive:false});
      frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('pointermove',outsideMove);};
    },[dragId]);
    useEffect(() => () => {clearTimeout(releaseHold.current);clearTimeout(landingTimer.current);if (gesture.current)
        clearTimeout(gesture.current.timer); }, []);
    const save = async (next = order, version = base?.version ?? list?.version) => { if (busy.current || !version)
        return; busy.current = true; setSaving(true); setError(''); try {
        const saved = await apiRequest<{
            ids: string[];
            version: string;
        }>('/live-quotes/list', { method: 'PUT', body: JSON.stringify({ ids: next, version }) });
        setDraft(null);
        setBase(null);
        client.setQueryData(queryKey, (old: List | undefined) => old ? { ...old, ...saved, stocks: old.stocks.filter(s => saved.ids.includes(s.id)) } : old);
        showSuccessToast('저장했습니다.');
        await client.invalidateQueries({ queryKey: ['live-quote-list'] });
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        busy.current = false;
        setSaving(false);
    } };
    const end=()=>{
      const g=gesture.current;if(g){clearTimeout(g.timer);if(g.armed){suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},400);}gesture.current=null;}
      const v=visualRef.current;
      if(v){const target=document.querySelector<HTMLElement>(`[data-live-root] [data-quote-id="${v.id}"]`)?.getBoundingClientRect();const landing={...v,x:target?.left??v.x,y:target?.top??v.y,settling:true};visualRef.current=landing;setDragVisual(landing);clearTimeout(landingTimer.current);landingTimer.current=setTimeout(()=>{setDragId(null);setDragVisual(null);visualRef.current=null;setPointerHold(false);frozen.current=null;clearTimeout(releaseHold.current);},180);}else setDragId(null);
      clearTimeout(releaseHold.current);releaseHold.current=setTimeout(()=>{setPointerHold(false);frozen.current=null;},220);
    };
    const down=(id:string,e:React.PointerEvent)=>{
      if(visualRef.current?.settling)return;
      clearTimeout(releaseHold.current);frozen.current=sorted;setPointerHold(true);
      if(sort!=='manual'||saving||e.button!==0)return;
      const el=e.currentTarget as HTMLElement,rect=el.getBoundingClientRect(),offsetX=e.clientX-rect.left,offsetY=e.clientY-rect.top;
      const g={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,armed:false,last:undefined as string|undefined,timer:setTimeout(()=>{
        g.armed=true;frozen.current=sorted;setDragId(id);el.setPointerCapture(e.pointerId);
        const v={id,x:g.x-offsetX,y:g.y-offsetY,width:rect.width,height:rect.height,offsetX,offsetY,settling:false};visualRef.current=v;setDragVisual(v);
      },500)};gesture.current=g;
    };
    const updateTarget=(x:number,y:number)=>{
      const g=gesture.current;if(!g?.armed)return;
      // Hit-test logical grid cells, not neighbours currently moving under a FLIP transform.
      const grid=document.querySelector('[data-testid=live-grid]')?.getBoundingClientRect();
      if(!grid||x<grid.left||x>=grid.right||y<grid.top||y>=grid.bottom)return;
      const index=Math.floor((y-grid.top)/quoteCardHeight)*2+Math.floor((x-grid.left)/(grid.width/2));
      const target=visibleIds.current[Math.min(visibleIds.current.length-1,index)];
      if(!target||target===g.id)return;
      if(!base){setBase({ids:list!.ids,version:list!.version});localOrder.current={accountId,ids:list!.ids,version:list!.version};}
      const next=reorderVisible(orderRef.current,visibleIds.current,g.id,target);orderRef.current=next;setDraft(next);
    };
    const move=(e:Pick<React.PointerEvent,'clientX'|'clientY'|'pointerId'|'preventDefault'>)=>{
      const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
      if(!g.armed){if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)end();return;}
      g.x=e.clientX;g.y=e.clientY;e.preventDefault();
      const v=visualRef.current;if(v){const next={...v,x:e.clientX-v.offsetX,y:e.clientY-v.offsetY};visualRef.current=next;setDragVisual(next);}
      updateTarget(e.clientX,e.clientY);
    };
    const rowFor=(stock:DisplayStock)=>packet.quotes.find(r=>r.symbol===stock.symbol)??{symbol:stock.symbol,status:packet.connection,quote:null};
    return <Box data-live-root sx={{ pb: '80px', bgcolor: colors.surface, minHeight: '100%' }}><PageHeader title={<span style={{ fontSize: 16 }}>실시간 주가</span>} embedded showAdd={false} centerMobile center={dirty ? <Box sx={{ display: 'flex', gap: '8px' }}><IconButton disabled={saving} aria-label="순서 변경 취소" onClick={discard} sx={{ p: 0, width: 32, height: 32, bgcolor: colors.raised }}><img src="/live-quotes/cancel.svg" alt=""/></IconButton><IconButton disabled={saving} aria-label="순서 저장" onClick={() => void save()} sx={{ p: 0, width: 32, height: 32, bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': {bgcolor: 'primary.dark'} }}><Box component="span" aria-hidden="true" sx={{width:16,height:16,bgcolor:'currentColor',mask:'url(/live-quotes/save.svg) center/contain no-repeat',WebkitMask:'url(/live-quotes/save.svg) center/contain no-repeat'}}/></IconButton></Box> : undefined} action={<HeaderAddButton label="표시 종목 추가" onClick={() => navigate('/live-quotes/add', { state: { from: location.pathname } })} mobileVisible/>}/>
  <Box sx={{display:'grid',gridTemplateColumns:'minmax(114px,142px) 68px minmax(0,140px)',justifyContent:'space-between',gap:'8px',position:'sticky',top:0,zIndex:2,bgcolor:colors.surface,height:40,px:'12px',alignItems:'center',borderBottom:`1px solid ${colors.border}`}}>
    <MarketSwitch value={market} disabled={!!dragId} onChange={setMarket}/>
    <QuoteSelect label="표시 종목 필터" value={filter} disabled={!!dragId} options={[{value:'all',label:'전체'},{value:'holding',label:'보유'},{value:'watch',label:'관심'},{value:'trade',label:'거래'}]} onChange={setFilter}/>
    <QuoteSelect label="시세 정렬" value={sort} disabled={!!dragId} options={sorts} onChange={v=>{if(confirmDiscard()){setDraft(null);setBase(null);setSort(v as QuoteSort);}}}/>
  </Box>
  {query.isPending ? <Box sx={{ display: 'grid', placeItems: 'center', height: 160 }}><CircularProgress size={24} aria-label="표시 종목 불러오는 중"/></Box> : query.isError && !list ? <Box role="alert" sx={{ p: 2 }}><Typography>표시 종목 조회에 실패했습니다.</Typography><Button onClick={() => void query.refetch()}>재시도</Button></Box> : <><Box sx={{ fontSize: 10, color: colors.textMuted, px: '12px', py: '4px' }}>{packet.marketOpen===false?'장 운영시간 외 · ':''}{statusText[packet.connection] ?? packet.connection} · {rows.length}종목 · 공유 구독 {packet.active}/{packet.limit}{accounts.isError ? ' · 계좌 조회 확인 필요' : ''}</Box><Box data-testid="live-grid" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>{rows.map(stock=><QuoteCard key={stock.id} stock={stock} market={market} row={rowFor(stock)} closed={packet.marketOpen===false} dragged={stock.id===dragId} onOpen={()=>{if(!suppressClick.current)navigate(`/stocks/${stock.id}?detailTab=summary`);}} onDown={e=>down(stock.id,e)} onMove={move} onUp={end} onCancel={end}/>)}</Box>{query.isError&&list&&<Box role="alert" sx={{fontSize:12,p:'8px',color:colors.warning}}>목록 갱신에 실패했습니다. 기존 목록을 유지합니다.<Button onClick={()=>void query.refetch()}>재시도</Button></Box>}{rows.length === 0 && <Box sx={{ textAlign: 'center', py: '40px', fontSize: 12, color: colors.textMuted }}>표시할 종목이 없습니다.<Button onClick={() => navigate('/live-quotes/add')} sx={{ display: 'block', mx: 'auto' }}>종목 추가</Button></Box>}</>}
  {dragVisual&&allRows.find(s=>s.id===dragVisual.id)&&createPortal(<Box data-testid="live-drag-overlay" sx={{position:'fixed',left:dragVisual.x,top:dragVisual.y,width:dragVisual.width,height:dragVisual.height,pointerEvents:'none',zIndex:1500,transform:dragVisual.settling?'scale(1)':'scale(1.035)',boxShadow:dragVisual.settling?'none':'0 12px 30px #0009',transition:dragVisual.settling?'left 180ms ease,top 180ms ease,transform 180ms ease,box-shadow 180ms ease':'transform 120ms ease,box-shadow 120ms ease','@media(prefers-reduced-motion:reduce)':{transition:'none'}}}><QuoteCard stock={allRows.find(s=>s.id===dragVisual.id)!} market={market} row={rowFor(allRows.find(s=>s.id===dragVisual.id)!)} closed={packet.marketOpen===false} ghost/></Box>,document.body)}
  {dirty && base && list && base.version !== list.version && <Button onClick={() => { const current = new Set(list.ids), edited = draft!.filter(id => current.has(id)), known = new Set(edited); let i = 0; setDraft(list.ids.map(id => known.has(id) ? edited[i++]! : id)); setBase({ ids: list.ids, version: list.version }); setError('최신 추가·제거를 유지하며 편집 순서를 병합했습니다. 확인 후 저장해 주세요.'); }}>최신 목록과 병합</Button>}{error && <Box role="alert" sx={{ p: '12px', color: colors.warning, fontSize: 12 }}>{error}<Button onClick={() => void query.refetch()}>최신 목록 확인</Button></Box>}
  <Dialog open={blocker.state === 'blocked'}><DialogTitle>변경한 순서가 있습니다.</DialogTitle><DialogContent>저장하거나 취소한 뒤 이동해 주세요.</DialogContent><DialogActions><Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>계속 편집</Button><Button onClick={() => { setDraft(null); setBase(null); if (blocker.state === 'blocked')
        blocker.proceed(); }}>변경 취소 후 이동</Button></DialogActions></Dialog>
 </Box>;
}
export function LiveQuoteAddPage() {
    const navigate = useNavigate(), { user } = useAuth(), { accountId } = useActiveAccount(), client = useQueryClient();
    const [tab, setTab] = useState('search'), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [selected, setSelected] = useState<string[]>([]), [saving, setSaving] = useState(false), [error, setError] = useState('');
    const busy = useRef(false);
    useEffect(() => { const timer = setTimeout(() => setTerm(search), 250); return () => clearTimeout(timer); }, [search]);
    const query = useQuery({ queryKey: ['live-quote-candidates', user?.id, accountId, tab, term], queryFn: ({ signal }) => apiRequest<List>(`/live-quotes/candidates?tab=${tab}&q=${encodeURIComponent(term)}${accountId ? '&accountId=' + accountId : ''}`, { signal }), staleTime: 30000, refetchOnWindowFocus: false, refetchOnReconnect:false });
    const data = query.data, registered = new Set(data?.ids ?? []), rows = data?.stocks ?? [], available = rows.filter(s => !registered.has(s.id));
    const remaining=Math.max(0,maxDisplayStocks-registered.size);
    const toggle=(id:string)=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.filter(x=>!registered.has(x)).length<remaining?[...old,id]:old);
    const selectAll=(checked:boolean)=>{
      const next=checked?[...new Set([...selected,...available.map(s=>s.id)])]:selected.filter(id=>!available.some(s=>s.id===id));
      if(next.filter(id=>!registered.has(id)).length>remaining){setError('표시 종목은 최대 50개까지 추가할 수 있습니다. 남은 '+remaining+'개를 선택해 주세요.');return;}
      setSelected(next);
    };
    const add = async (ids = selected) => { if (busy.current || !data || !ids.length)
        return; busy.current = true; setSaving(true); setError(''); try {
        const fresh = await apiRequest<List>('/live-quotes/list');
        if (fresh.version !== data.version)
            throw Error('다른 화면에서 목록이 변경됐습니다. 최신 목록 확인 후 다시 추가해 주세요.');
        const next=[...new Set([...fresh.ids,...ids])];
        if(!displayListWithinLimit(next,fresh.ids))throw Error('표시 종목은 최대 50개까지 추가할 수 있습니다.');
        await apiRequest('/live-quotes/list', { method: 'PUT', body: JSON.stringify({ version: data.version, ids: next }) });
        await client.invalidateQueries({ queryKey: ['live-quote-list'] });
        await client.invalidateQueries({ queryKey: ['live-quote-candidates'] });
        navigate('/live-quotes');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        busy.current = false;
        setSaving(false);
    } };
    const selectionCount=selected.filter(id=>!registered.has(id)).length;
    return <Box sx={{bgcolor:colors.canvas,p:'0 8px 144px',minHeight:'100%'}}>
      <PageHeader title="표시 종목 추가" embedded showAdd={false} showBack showBackTablet backPath="/live-quotes" action={<Button size="small" disabled={saving} onClick={()=>navigate('/live-quotes')} sx={{fontSize:12,color:colors.textPrimary,minWidth:40}}>취소</Button>}/>
      <Box component="form" onSubmit={e=>{e.preventDefault();setTerm(search);}} sx={{pt:'8px',mb:'8px'}}><StockSearchFrame>
        <SearchRounded sx={{fontSize:18,color:colors.textMuted}}/><InputBase value={search} disabled={saving} onChange={e=>setSearch(e.target.value)} placeholder="종목명 또는 종목코드 검색" inputProps={{'aria-label':'표시 종목 검색',enterKeyHint:'search'}} sx={{flex:1,minWidth:0,fontSize:12}}/>
        {!!search&&<IconButton aria-label="검색어 지우기" disabled={saving} onClick={()=>setSearch('')} sx={{width:24,height:28,p:0}}><CloseRounded sx={{fontSize:16}}/></IconButton>}
      </StockSearchFrame></Box>
      <SegmentedTabs value={tab} onChange={setTab} items={[{value:'search',label:'검색'},{value:'holding',label:'보유'},{value:'watch',label:'관심'},{value:'trade',label:'거래'}].map(t=>({...t,disabled:saving}))}/>
      <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',minHeight:44,gap:'8px'}}><Box component="label" sx={{fontSize:12,display:'flex',alignItems:'center',gap:'4px'}}><Checkbox size="small" disabled={!available.length||saving||query.isFetching||search!==term} checked={!!available.length&&available.every(s=>selected.includes(s.id))} onChange={(_,checked)=>selectAll(checked)} sx={{p:'4px'}}/>전체 선택</Box>
        <ActionButton size="small" tone="muted" disabled={saving||query.isFetching||search!==term||!available.length||registered.size+available.length>maxDisplayStocks} onClick={()=>void add(available.map(s=>s.id))}>미등록 전체 추가</ActionButton></Box>
      {query.isPending?<Box sx={{textAlign:'center',py:3}}><CircularProgress size={24}/></Box>:query.isError?<Box role="alert">조회에 실패했습니다.<Button onClick={()=>void query.refetch()}>재시도</Button></Box>:<Box sx={{borderTop:`1px solid ${colors.border}`}}>{rows.map(s=><Box key={s.id} component="label" sx={{display:'flex',alignItems:'center',minHeight:52,gap:'8px',px:'4px',borderBottom:`1px solid ${colors.border}`}}>
        <Checkbox size="small" checked={registered.has(s.id)||selected.includes(s.id)} disabled={registered.has(s.id)||saving||(!selected.includes(s.id)&&selectionCount>=remaining)} onChange={()=>toggle(s.id)} slotProps={{input:{'aria-label':`${s.name}(${s.symbol}) 선택`}}} sx={{p:'4px'}}/>
        <Box sx={{flex:1,minWidth:0}}><Typography noWrap title={s.name} sx={{fontSize:12,fontWeight:600}}>{s.name}</Typography><Typography sx={{fontSize:10,color:colors.textMuted}}>{s.symbol}</Typography></Box>
        <Typography sx={{fontSize:10,color:colors.textMuted,flexShrink:0}}>{registered.has(s.id)?'추가됨':[s.held?'보유':'',s.watched?'관심':'',s.traded?'거래':''].filter(Boolean).join(' · ')}</Typography>
      </Box>)}</Box>}
      {!query.isPending&&!query.isError&&!rows.length&&<Typography sx={{textAlign:'center',py:4,fontSize:12}}>검색 결과가 없습니다.</Typography>}
      <Typography sx={{fontSize:10,color:colors.textMuted,mt:'16px'}}>시세 표시 목록에만 추가됩니다. 최대 50개까지 등록할 수 있습니다.</Typography>
      {error&&<Box role="alert" sx={{fontSize:12,color:colors.warning}}>{error}<Button onClick={()=>void query.refetch()}>최신 목록 확인</Button></Box>}
      <Box data-testid="live-add-actions" sx={{position:'fixed',bottom:'calc(45px + env(safe-area-inset-bottom, 0px))',left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:816,zIndex:4,p:'12px 8px',bgcolor:colors.canvas,borderTop:`1px solid ${colors.border}`,display:'flex',alignItems:'center',gap:'8px'}}>
        <Typography sx={{fontSize:11,flex:1}}>{selectionCount}개 선택 · {registered.size}/50개 등록</Typography><ActionButton size="small" tone="muted" disabled={saving} onClick={()=>navigate('/live-quotes')}>취소</ActionButton>
        <ActionButton size="small" disabled={saving||!selectionCount||query.isFetching||search!==term} onClick={()=>void add()}>{saving?'추가 중':`선택한 ${selectionCount}개 추가`}</ActionButton>
      </Box>
    </Box>;
}
