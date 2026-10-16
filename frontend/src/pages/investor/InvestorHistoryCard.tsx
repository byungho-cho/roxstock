import {useInfiniteQuery} from '@tanstack/react-query';
import {Box,Button,Typography} from '@mui/material';
import {AppCard} from '../../components/common/Common';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {apiRequest} from '../../data/apiClient';
import {colors} from '../../styles/tokens';

type HistoryRow={date:string;close:string|null;closeChange:string|null;values:Record<string,string|null>};
type HistoryPage={rows:HistoryRow[];nextCursor:string|null};
const actors=['INDIVIDUAL','FOREIGN','INSTITUTION'];
export const investorPanel={p:'12px 16px',borderRadius:'8px',border:`1px solid ${colors.border}`,bgcolor:colors.surface,minWidth:0,width:'100%',boxSizing:'border-box'};
export function investorValue(value:string|null|undefined,metric:string,signed=false){
 if(value==null)return '—';
 const negative=value.startsWith('-'),absolute=value.replace(/^[+-]/,''),[whole='0',fraction='']=absolute.split('.');
 let integer=BigInt(whole),decimal=fraction.replace(/0+$/,'');
 if(metric==='amount'){
  // Display rounded hundredths of a million, retaining the exact source in tooltips.
  const hundredths=(integer*10000n+BigInt(fraction.padEnd(4,'0').slice(0,4))+50000000n)/100000000n;
  integer=hundredths/100n;decimal=(hundredths%100n).toString().padStart(2,'0').replace(/0+$/,'');
 }
 const zero=integer===0n&&!decimal;
 return (!zero&&negative?'-':!zero&&signed?'+':'')+integer.toLocaleString('ko-KR')+(decimal?'.'+decimal:'');
}
export function investorDailyValue(value:string|null|undefined,metric:string,market=false){
 if(value==null)return '—';
 const negative=value.startsWith('-'),[whole='0',fraction='']=value.replace(/^[+-]/,'').split('.');
 const scale=10n**BigInt(fraction.length);
 // Market quantity is stored in thousands of shares.
 const absolute=(BigInt(whole)*scale+BigInt(fraction||'0'))*(metric==='quantity'&&market?1000n:1n);
 const large=absolute>=100000000n*scale,divisor=(large?100000000n:10000n)*scale;
 const hundredths=(absolute*100n+divisor/2n)/divisor;
 const integer=hundredths/100n,decimal=(hundredths%100n).toString().padStart(2,'0').replace(/0+$/,'');
 const unit=metric==='amount'?(large?'억원':'만원'):(large?'억주':'만주');
 return (hundredths===0n?'':negative?'-':'+')+integer.toLocaleString('ko-KR')+(decimal?'.'+decimal:'')+unit;
}
export const investorColor=(value:string|null|undefined)=>value==null?colors.textMuted:Number(value)>0?colors.marketRise:Number(value)<0?colors.marketFall:colors.textPrimary;
export function InvestorHistoryCard({mode,target,date,metric}:{mode:string;target?:string;date:string;metric:string}){
 const query=useInfiniteQuery({queryKey:['investor-history',mode,target,date,metric],initialPageParam:null as string|null,
  queryFn:({signal,pageParam})=>apiRequest<HistoryPage>(`/investor-trends/history?${new URLSearchParams({type:mode==='stock'?'STOCK':'MARKET',target:target!,date,metric,...(mode==='stock'?{scope:'COMBINED'}:{}),...(pageParam?{cursor:pageParam}:{})})}`,{signal}),
  getNextPageParam:page=>page.nextCursor??undefined,enabled:!!target,staleTime:30000});
 const rows=query.data?.pages.flatMap(page=>page.rows)??[];
 return <AppCard sx={investorPanel} data-testid="investor-history-card">
  <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'4px',mb:'4px'}}><Typography component="h2" sx={{fontSize:14,fontWeight:600,lineHeight:'20px'}}>일자별 거래실적</Typography><Typography sx={{fontSize:10,lineHeight:'17px',color:colors.textMuted}}>{metric==='amount'?'백만원':mode==='market'?'천주':'주'}</Typography></Box>
  <QueryErrorNotice active={query.isError} message="투자동향 거래실적 조회에 실패했습니다." onRetry={()=>{void (query.isFetchNextPageError?query.fetchNextPage():query.refetch());}}/>
  <Box role="table" aria-label="일자별 거래실적" sx={{fontVariantNumeric:'tabular-nums'}}>
   <Box role="row" sx={rowStyle}>{['일자','종가','개인','외국인','기관'].map((label,index)=><Typography role="columnheader" key={label} sx={{...cellStyle,textAlign:index?'right':'left'}}>{label}</Typography>)}</Box>
   {rows.map(row=><Box role="row" key={row.date} data-testid="investor-history-row" sx={rowStyle}>
    <Typography role="cell" sx={{...cellStyle,whiteSpace:'nowrap'}}>{row.date.slice(2).replaceAll('-','.')}</Typography>
    <Typography role="cell" sx={{...cellStyle,textAlign:'right',color:row.closeChange==null?colors.textPrimary:investorColor(row.closeChange)}} title={row.close==null?'종가 미수집':`${row.close} ${mode==='market'?'포인트':'원'}`}>{row.close==null?'—':mode==='market'?Number(row.close).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}):investorValue(row.close,'quantity')}</Typography>
    {actors.map(actor=><Typography role="cell" key={actor} sx={{...cellStyle,textAlign:'right',color:investorColor(row.values[actor])}} title={row.values[actor]==null?'미제공 또는 미수집':`${investorValue(row.values[actor],'quantity',true)} ${metric==='amount'?'원':mode==='market'?'천주':'주'}`}>{investorValue(row.values[actor],metric,true)}</Typography>)}
   </Box>)}
  </Box>
  {!query.isFetching&&!query.isError&&!rows.length&&<Typography sx={{py:'8px',fontSize:11,color:colors.textMuted}}>저장된 거래실적 없음</Typography>}
  {query.hasNextPage&&<Button fullWidth disabled={query.isFetchingNextPage} onClick={()=>{void query.fetchNextPage();}} sx={{height:32,minHeight:32,p:0,mt:'4px',fontSize:11,fontWeight:400,color:colors.textPrimary}}>더보기</Button>}
 </AppCard>;
}
const rowStyle={display:'grid',gridTemplateColumns:'8ch repeat(4,minmax(0,1fr))',fontSize:11,columnGap:'4px',py:'2px',alignItems:'start'};
const cellStyle={fontSize:11,lineHeight:'17px',minWidth:0,overflowWrap:'anywhere'} as const;
