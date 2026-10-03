import {Box,Button,ButtonBase,Dialog,IconButton,InputBase,Stack,Typography} from '@mui/material';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useContext,useEffect,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {StockInputContext} from './StockInputContext';
import {FormTextField} from '../../components/forms/Fields';
import {PageHeader} from '../../components/navigation/Navigation';
import {mapSecurity} from '../../data/liveData';
import {createSecurity,createWatchlistItem,updateWatchlistItem,listSecurities,type MarketType} from '../../data/roxstockApi';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {colors} from '../../styles/tokens';
import type {StockItem} from '../../types/models';
import '../dashboard/home-font.css';

export function StockAddPage(){const {accountId}=useActiveAccount();return <StockAddContent key={accountId} accountId={accountId}/>;}
function StockAddContent({accountId}:{accountId:string|undefined}){
 const navigate=useNavigate(),client=useQueryClient();const[params]=useSearchParams();
 const fromHome=params.get('from')==='home';
 const inputHost=useContext(StockInputContext);
 const[type]=useState<'holding'|'watchlist'>(fromHome||params.get('type')==='holding'?'holding':'watchlist');
 const[query,setQuery]=useState(''),[search,setSearch]=useState(''),[direct,setDirect]=useState(false),[composing,setComposing]=useState(false);
 const[name,setName]=useState(''),[symbol,setSymbol]=useState(''),[market,setMarket]=useState<MarketType>('KOSPI'),[year,setYear]=useState(String(new Date().getFullYear()));
 const[selected,setSelected]=useState<StockItem|null>(null),[confirm,setConfirm]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),alive=useRef(true),searchRef=useRef<HTMLInputElement>(null),symbolRef=useRef<HTMLInputElement>(null),yearRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const result=useQuery({queryKey:['securitySearch',accountId,search],enabled:!!accountId&&!direct&&!composing&&search.length>=2&&search===query.trim(),
  queryFn:async({signal})=> (await listSecurities({accountId,query:search,excludeRegistered:true},signal)).map(mapSecurity)});
 const currentSearch=!composing&&query.trim().length>=2&&search===query.trim()?search:'';
 const rows=currentSearch?(result.data??[]):[];
 useEffect(()=>{if(composing||direct)return;const value=query.trim();if(value.length<2){setSearch('');return;}const timer=window.setTimeout(()=>setSearch(value),250);return()=>window.clearTimeout(timer);},[query,composing,direct]);
 const valid=!!name.trim()&&name.trim().length<=100&&/^\d{6}$/.test(symbol)&&/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=new Date().getFullYear();
 const showConfirm=()=>{if(!busy&&accountId&&(!direct||valid)){setError('');setConfirm(true);}};
 const finish=async()=>{await Promise.all(['stocks','dashboard','targetArrivals','recentBuys'].map(key=>client.invalidateQueries({queryKey:[key]})));if(alive.current)navigate('/stocks?tab='+type,{replace:true});};
 const save=async()=>{
  if(!accountId||lock.current||!confirm||(!selected&&!direct)||(direct&&!valid))return;
  lock.current=true;setBusy(true);setError('');
  try{
   const listType=type==='holding'?'HOLDING':'WATCHLIST';
   if(direct)await createSecurity({accountId,name:name.trim(),symbol,marketType:market,listType,listingYear:Number(year)});
   else if(selected!.watchlistItemId)await updateWatchlistItem(selected!.watchlistItemId,{accountId,listType});
   else await createWatchlistItem({accountId,securityId:selected!.id,listType});
   if(alive.current)await finish();
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'등록에 실패했습니다.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const runSearch=()=>{if(composing)return;const value=query.trim();setSearch(value.length>=2?value:'');};
 const enterDirect=()=>{setDirect(true);setSelected(null);setError('');};
 const title='종목추가('+(type==='holding'?'보유종목':'관심종목')+')';
 const button={height:44,minHeight:44,borderRadius:'8px',fontSize:12,fontWeight:600,boxShadow:'none'};
 const primaryButton={...button,bgcolor:colors.buttonPrimary,color:colors.textPrimary,border:'1px solid '+colors.focus,'&:hover':{bgcolor:colors.buttonPrimary}};
 const clearField=(label:string,value:string,change:(s:string)=>void)=><IconButton aria-label={label+' 지우기'} disabled={!value||busy} onClick={()=>change('')} sx={{width:16,height:16,p:0}}><Box component="img" src="/stocks-v03/clear.svg" alt="" sx={{width:16,height:16,opacity:value?1:.4}}/></IconButton>;
 useEffect(()=>{inputHost?.setTitle(`${direct?'종목 직접추가':'종목추가'}(${type==='holding'?'보유종목':'관심종목'})`);},[direct,type,inputHost?.setTitle]);
 useEffect(()=>{inputHost?.setBusy(busy);return()=>inputHost?.setBusy(false);},[busy,inputHost?.setBusy]);
 const chosenName=direct?name.trim():selected?.name,chosenSymbol=direct?symbol:selected?.symbol;
 const chosenMarket=direct?market:selected?.marketType;
 return <Box data-testid="stock-add-content" className="rox-home" sx={{fontFamily:'RoxHomeInter, sans-serif'}}>
  <PageHeader embedded variant="more" backIcon={<Box component="span" aria-hidden sx={{width:28,fontSize:36,lineHeight:"36px",textAlign:"left"}}>‹</Box>} showAdd={false} title={title} onBack={()=>direct?setDirect(false):navigate(-1)} showBackTablet/>
  {!direct?<Stack spacing="8px">
   <Box sx={{height:48,display:'flex',alignItems:'center',gap:'8px',px:'8px',bgcolor:colors.raised,border:'1px solid '+colors.borderStrong,borderRadius:'8px'}}>
    <IconButton aria-label="검색 실행" onClick={runSearch} sx={{p:0,width:17,height:16}}><Box component="img" src="/stocks-v03/search.svg" alt="" sx={{width:17,height:16}}/></IconButton>
    <InputBase inputRef={searchRef} autoFocus value={query} onFocus={e=>e.target.select()} onChange={e=>setQuery(e.target.value)} onCompositionStart={()=>setComposing(true)} onCompositionEnd={e=>{setQuery((e.target as HTMLInputElement).value);setComposing(false);}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();runSearch();}}} inputProps={{'aria-label':'전체 종목 검색',enterKeyHint:'search'}} placeholder="종목명·종목코드 검색" sx={{flex:1,minWidth:0,fontSize:13}}/>
    {query&&<IconButton aria-label="검색어 지우기" onClick={()=>{setQuery('');setSearch('');searchRef.current?.focus();}} sx={{p:0,width:16,height:16}}><Box component="img" src="/stocks-v03/search-clear.svg" alt="" sx={{width:16,height:16}}/></IconButton>}
   </Box>
   {currentSearch&&<Typography sx={{fontSize:13,lineHeight:'19px',fontWeight:600}}>‘{currentSearch}’ 검색 결과 {rows.length}개{result.isFetching&&rows.length>0?' · 갱신 중':''}</Typography>}
   {currentSearch&&result.isError?<Box role="alert" sx={{p:'20px',fontSize:13}}>검색에 실패했습니다. 기존 검색 상태를 유지합니다.<Button onClick={()=>void result.refetch()}>다시 시도</Button></Box>:currentSearch&&result.isFetching&&!rows.length?<Typography role="status" sx={{py:4,textAlign:'center'}}>검색 중입니다.</Typography>:currentSearch&&rows.length?
    <Box data-testid="stock-search-results" sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:'8px'}}>{rows.map(s=><ButtonBase key={s.id} data-testid="security-search-result" onClick={()=>{setSelected(s);showConfirm();}} sx={{height:52,p:'8px 14px',display:'flex',flexDirection:'column',alignItems:'flex-start',justifyContent:'center',borderRadius:'8px',bgcolor:colors.surface,border:'1px solid #25344d',minWidth:0,textAlign:'left'}}>
     <Typography noWrap sx={{fontSize:14,fontWeight:600,lineHeight:'20px',maxWidth:'100%'}}><Highlight text={s.name} query={currentSearch}/></Typography>
     <Typography sx={{fontSize:10,lineHeight:'15px',color:colors.textMuted}}><Highlight text={s.symbol} query={currentSearch}/> · {s.marketType}</Typography>
    </ButtonBase>)}</Box>:
    <Box sx={{height:currentSearch?210:180,mt:currentSearch?'4px !important':'14px !important',p:currentSearch?'24px 16px':'30px 16px',textAlign:'center',bgcolor:colors.surface,border:'1px solid '+colors.border,borderRadius:'8px'}}>
     {!currentSearch&&<Typography aria-hidden sx={{fontSize:30,lineHeight:'44px',color:colors.textMuted}}>⌕</Typography>}
     <Typography sx={{fontSize:currentSearch?16:15,fontWeight:600,mt:currentSearch?'12px':'6px'}}>{currentSearch?'내용이 없습니다.':'코스피·코스닥 전체 종목 검색'}</Typography>
     <Typography sx={{fontSize:currentSearch?11:12,lineHeight:'15px',color:colors.textMuted,mt:'14px'}}>{currentSearch?'전체 종목에 없는 경우 직접 추가해 주세요.':'종목명 또는 종목코드를 입력해 주세요.'}</Typography>
     {currentSearch&&<Button variant="contained" onClick={enterDirect} sx={{...primaryButton,mt:'24px',px:'20px'}}>종목 직접 추가</Button>}
    </Box>}
   {!currentSearch&&<Stack direction="row" sx={{height:46,mt:'16px !important',px:'14px',border:'1px solid #25344d',borderRadius:'8px',bgcolor:'#0f172a',alignItems:'center',justifyContent:'space-between'}}><Typography sx={{fontSize:11,color:colors.textMuted}}>검색되지 않는 종목인가요?</Typography><Button sx={{fontSize:11,p:0,minWidth:0,color:colors.focus}} onClick={enterDirect}>직접 추가 ›</Button></Stack>}
   {currentSearch&&rows.length>0&&<Button onClick={enterDirect} sx={{fontSize:11,alignSelf:'flex-end'}}>직접 추가 ›</Button>}
  </Stack>:<Box data-testid="stock-direct-add" sx={{'& .MuiInputBase-input':{fontSize:'13px !important'},'& .MuiFormControl-root > .MuiStack-root > .MuiBox-root > .MuiTypography-root':{flex:'0 0 60px',mr:'8px'}}}>
   <FormTextField size="small" clearIconSrc="/stocks-v03/clear.svg" label="종목명" endAdornment={clearField('종목명',name,setName)} value={name} placeholder="예: 신규테크" onChange={setName} autoFocus onEnter={()=>symbolRef.current?.focus()} disabled={busy}/>
   <Box sx={{mt:'12px'}}><FormTextField size="small" clearIconSrc="/stocks-v03/clear.svg" label="종목코드" endAdornment={clearField('종목코드',symbol,setSymbol)} value={symbol} placeholder="예: 123456" onChange={s=>setSymbol(s.replace(/\D/g,'').slice(0,6))} inputRef={symbolRef} onEnter={()=>yearRef.current?.focus()} disabled={busy}/></Box>
   <Typography sx={{mt:'16px',fontSize:10,lineHeight:'15px',color:colors.textMuted,textAlign:'right',px:'8px'}}>6자리 숫자 · 기존 전체종목과 직접 추가 종목의 코드 중복 확인</Typography>
   <Typography sx={{mt:'33px',mb:'8px',fontSize:11,lineHeight:'14px',color:colors.textMuted}}>시장 구분</Typography>
   <Stack direction="row" spacing="8px">{(['KOSPI','KOSDAQ'] as const).map(value=><Button key={value} aria-pressed={market===value} disabled={busy} onClick={()=>setMarket(value)} variant={market===value?'contained':'outlined'} sx={{...button,flex:1,border:'1px solid '+(market===value?colors.focus:'#25344d'),bgcolor:market===value?colors.buttonPrimary:'#0f172a',color:market===value?colors.textPrimary:colors.textMuted}}>{value==='KOSPI'?'코스피':'코스닥'}</Button>)}</Stack>
   <Box sx={{mt:'14px'}}><FormTextField size="small" clearIconSrc="/stocks-v03/clear.svg" label="상장 연도" endAdornment={clearField('상장 연도',year,setYear)} value={year} onChange={s=>setYear(s.replace(/\D/g,'').slice(0,4))} inputRef={yearRef} onEnter={showConfirm} disabled={busy}/></Box>
   <Button fullWidth variant="contained" disabled={busy||!valid||!accountId} onClick={showConfirm} sx={{...primaryButton,mt:'16px'}}>종목 추가</Button>
  </Box>}
  <Dialog data-testid="stock-add-confirm" open={confirm} onClose={()=>!busy&&setConfirm(false)} slotProps={{backdrop:{sx:{bgcolor:'rgba(0,0,0,.6)'}},paper:{sx:{width:{xs:'calc(100% - 64px)',sm:306},maxWidth:368,m:'32px',p:'19px',borderRadius:'8px',border:'1px solid #25344d',bgcolor:colors.surface,backgroundImage:'none',fontFamily:'RoxHomeInter, sans-serif'}}}}>
   <Typography component="h2" sx={{fontSize:18,lineHeight:'22px',fontWeight:700}}>{chosenName}</Typography>
   <Typography sx={{mt:'6px',fontSize:11,lineHeight:'15px',color:colors.textMuted}}>{chosenSymbol} · {chosenMarket}</Typography>
   <Typography sx={{mt:'20px',fontSize:12,lineHeight:'18px',color:colors.textMuted}}>{type==='holding'?'보유종목':'관심종목'}에 추가하시겠습니까?</Typography>
   {error&&<Typography role="alert" sx={{mt:'8px',fontSize:12,color:colors.marketRise}}>{error}</Typography>}
   <Stack direction="row" spacing="8px" sx={{mt:'20px'}}><Button disabled={busy} fullWidth onClick={()=>setConfirm(false)} variant="outlined" sx={{...button,borderColor:'#25344d',color:colors.textPrimary}}>취소</Button><Button disabled={busy} fullWidth variant="contained" onClick={()=>void save()} sx={primaryButton}>{busy?'저장 중':'추가'}</Button></Stack>
  </Dialog>
 </Box>;
}
function Highlight({text,query}:{text:string;query:string}){
 const needle=query.trim().toLocaleLowerCase();if(!needle)return <>{text}</>;
 const parts=[];let cursor=0,index=text.toLocaleLowerCase().indexOf(needle);
 while(index>=0){parts.push(text.slice(cursor,index),<Box component="span" key={index} sx={{color:'#f87171'}}>{text.slice(index,index+needle.length)}</Box>);cursor=index+needle.length;index=text.toLocaleLowerCase().indexOf(needle,cursor);}
 parts.push(text.slice(cursor));return <>{parts}</>;
}
