import {Box, Button, CardActionArea, Stack, Typography} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {AssetTrendChart, type AssetTrendPoint} from '../../components/common/AssetTrendChart';
import {colors} from '../../styles/tokens';

export function DashboardTrend({points, pending, failed, retry}: {
  points: AssetTrendPoint[]; pending: boolean; failed: boolean; retry: () => void;
}) {
  const navigate = useNavigate();
  return <Box data-testid="dashboard-trend" sx={{minWidth: 0, borderTop: '1px solid #25344D', borderBottom: '1px solid #25344D', px: 0, py: '8px'}}>
    <CardActionArea aria-label="자산추이 (상세보기)" onClick={() => navigate('/assets')} sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', minHeight: 24}}>
      <Typography component="h2" sx={{fontSize: 16, fontWeight: 600, lineHeight: '24px'}}>자산추이 <Box component="span" sx={{fontSize: 11, color: colors.textMuted, fontWeight: 400}}>(상세보기)</Box></Typography>
      <Typography sx={{fontSize: 10, lineHeight: '14px', fontWeight: 500, color: colors.focus}}>{pending ? '' : points.length > 1 ? '1개월' : '—'}</Typography>
    </CardActionArea>
    <Box data-testid="dashboard-trend-region" aria-busy={pending} sx={{mt: '10px', height: {xs: 48, sm: 90}, position: 'relative', display: 'flex', alignItems: 'center', '& > *': {width: '100%'}, '& [data-testid="asset-trend-chart"]': {mt: 0}}}>
      <AssetTrendChart points={points.length>1?points:[]} height={{xs:32,sm:74}} dateMode="day"/>
      {!pending&&points.length<2&&<Stack sx={{position:'absolute',inset:0,alignItems:'center',justifyContent:'center'}}>{failed?<><Typography role="alert" sx={{fontSize:11}}>자산 추이 조회 실패</Typography><Button size="small" onClick={retry}>재시도</Button></>:<Typography role="status" sx={{fontSize:11,color:colors.textMuted}}>내용이 없습니다.</Typography>}</Stack>}
      {failed && points.length > 0 && <Button size="small" sx={{position: 'absolute', top: 0, right: 0, p: 0, fontSize: 9, minHeight: 18, width: 'auto!important'}} onClick={retry}>조회 실패 · 이전 결과 · 재시도</Button>}
    </Box>
  </Box>;
}
