import {Card,Stack,Box,Typography} from '@mui/material';
import {colors} from '../../styles/tokens';
import type {StockListType} from '../../types/models';
export function StockLoadingRows({active}:{active:StockListType}) {
 const height=active==='holding'?139:active==='traded'?112:148;
 const labels=active==='holding'?['보유','평가','평가손익']:active==='traded'?['마지막 매도일','누적 실현손익']:['현재가','전일대비'];
 return <Stack spacing="8px" aria-label="종목 행 조회 중">{Array.from({length:3},(_,i)=><Card key={i} data-testid="stock-loading-row" sx={{height,p:'12px 14px 10px',borderRadius:'8px',bgcolor:colors.surface,border:'1px solid '+colors.border,overflow:'hidden'}}><Stack spacing="4px"><Box sx={{height:22}}><Box sx={{width:140,height:15}}/></Box><Box sx={{height:1,bgcolor:colors.border}}/>{labels.map(label=><Stack key={label} direction="row" sx={{height:20,alignItems:'center',justifyContent:'space-between',gap:1}}><Typography sx={{fontSize:12,fontWeight:600,color:colors.textSecondary}}>{label}</Typography><Box sx={{width:100,height:12}}/></Stack>)}</Stack></Card>)}</Stack>;
}
