import {useQuery} from '@tanstack/react-query';
import {Box,Button,Typography} from '@mui/material';
import {PageHeader} from '../../components/navigation/Navigation';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {newsTime} from './newsUi';
import {newsCollectionOptions,newsPanel} from './NewsCollectionSettings';
const names:Record<string,string>={HANKYUNG_RSS:'한경 RSS',HANKYUNG_CONSENSUS:'리포트',DART:'DART'};
export function NewsCollectionStatus(){
 const query=useQuery({...newsCollectionOptions,refetchInterval:30000}),d=query.data;
 const status=d?.status==='PARTIAL'?'일부 구간 확인 불가':d?.status==='FAILED'?'최근 확인 실패':d?.status==='RUNNING'?'수집 중':d?.status==='SUCCESS'?'정상 확인':'최초 수집 전';
 return <><PageHeader embedded title="종목소식 수집 상태" showBack showBackTablet backPath="/detail/collection-monitoring" showAdd={false}/><QueryErrorNotice active={query.isError} message="수집 상태 조회 실패 · 기존 결과 유지" onRetry={()=>void query.refetch()}/><Box data-testid="news-collection-status" sx={{pt:'8px',display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:'8px',alignItems:'start'}}>
  <Box sx={newsPanel}><Typography sx={{fontSize:15,fontWeight:600,lineHeight:'21px',color:['PARTIAL','FAILED'].includes(d?.status??'')?'#FBBF24':'#34D399'}}>{status}</Typography><Box sx={{fontSize:12,lineHeight:'18px'}}>{[['최근 시도',d?.lastAttemptAt],['실행 종료',d?.lastFinishedAt],['전체 정상 완료',d?.lastFullSuccessAt],['최근 신규 저장',d?.lastNewStoredAt]].map(([label,value])=><Box key={label} sx={{display:'flex',gap:'8px'}}><span>{label}</span><span>{newsTime(value)}</span></Box>)}</Box><Box sx={{fontSize:12,lineHeight:'18px',color:'#CBD5E1'}}>{d?`${d.intervalHours}시간마다 · 기준 ${d.startTime} KST`:'—'}<br/>다음 정규 실행　{newsTime(d?.nextAt)}{d?.nextRetryAt&&<><br/>다음 재시도　{newsTime(d.nextRetryAt)}</>}</Box></Box>
  <Box sx={newsPanel}><Typography sx={{fontSize:15,fontWeight:600,lineHeight:'21px'}}>제공처별 결과</Typography>{d?.providers.map(p=><Box key={p.id} sx={{fontSize:12,lineHeight:'18px',color:['PARTIAL','FAILED'].includes(p.status)?'#FBBF24':'#F8FAFC'}}>{names[p.id]??p.id} · {p.status==='SUCCESS'?'정상 조회':p.status==='EXCLUDED'?'정상 제외':p.error?.includes('WINDOW_LIMIT')||p.error?.includes('UNCONFIRMED_HISTORY')?'과거 구간 확인 불가':'일부 확인 실패'} · 신규 {p.diagnostics?.saved??0}건{p.diagnostics?.normalExcluded?` · 기업공시 정상 제외 ${p.diagnostics.normalExcluded}종목`:''}{p.diagnostics?.mappingMissing?` · 기업 매핑 누락 ${p.diagnostics.mappingMissing}종목`:''}{p.gaps?.map((g,i)=><Typography key={i} sx={{fontSize:11,lineHeight:'17px',color:'#CBD5E1'}}>{g.section?g.section+' · ':''}{newsTime(g.from)} ~ {newsTime(g.to)} 미확인</Typography>)}{p.nextRetryAt&&<Typography sx={{fontSize:11}}>재시도 {newsTime(p.nextRetryAt)}</Typography>}</Box>)}<Typography sx={{fontSize:11,lineHeight:'17px',color:'#CBD5E1'}}>대상: 활성 계좌의 중복 없는 종목 집합<br/>저장 중복과 선별 제외를 별도 집계</Typography><Button size="small" href="/detail/collection-monitoring/stock-news/runs">실행 이력</Button></Box>
 </Box></>;
}
