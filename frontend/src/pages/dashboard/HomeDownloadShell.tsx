import {Box} from '@mui/material';
import {HomeSummaryCards} from './HomeSummaryCards';
import {HomeListCard,HomeListLoading,HomeListBlank} from './HomeListCard';
export function HomeDownloadShell(){return <Box data-testid="home-shell" data-code-loading className="rox-home" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gridTemplateAreas:{sm:'"summary recent" "holdings targets"'},columnGap:'8px',rowGap:'8px',alignItems:'start'}}>
 <HomeSummaryCards pending/>
 {([{area:'holdings',id:'home-holdings-card',title:'보유종목',compact:true},{area:'recent',id:'recent-buys-card',title:'최근 매수',compact:true},{area:'targets',id:'target-arrival-card',title:'목표가 도래',compact:false}] as const).map(item=><Box key={item.id} sx={{gridArea:{sm:item.area}}}><HomeListCard blankLoading={item.compact} testId={item.id} title={item.title} pending stable naturalCover={item.area==='targets'} height="auto">{item.compact?<HomeListBlank compact/>:<HomeListLoading compact/>}</HomeListCard></Box>)}
 </Box>;}
