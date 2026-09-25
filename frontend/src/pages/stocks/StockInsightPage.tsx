import { ArrowBackIosNewRounded } from '@mui/icons-material';
import { Box, Button, Card, CardContent, IconButton, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { stockItems } from '../../data/mockData';
import { colors } from '../../styles/tokens';

export function StockInsightPage({ mode }: { mode: 'value' | 'financials' }) {
  const navigate = useNavigate(); const { stockId = 'samsung' } = useParams();
  const stock = stockItems.find((item) => item.id === stockId) ?? stockItems.find((item) => item.id === 'samsung')!;
  const [annual, setAnnual] = useState(true);
  return <Stack spacing="12px" sx={{ pb: 2 }}>
    <Stack direction="row" sx={{ position: 'sticky', top: 0, zIndex: 2, height: 40, alignItems: 'center', justifyContent: 'space-between', bgcolor: colors.canvas }}><IconButton onClick={() => navigate(-1)} sx={{ width: 36, justifyContent: 'flex-start', p: 0 }}><ArrowBackIosNewRounded sx={{ fontSize: 18 }} /></IconButton><Box sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 17, lineHeight: '21px', fontWeight: 600 }}>{stock.name}</Typography><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{stock.symbol}</Typography></Box><Box sx={{ width: 36 }} /></Stack>
    {mode === 'value' ? <ValueContent stock={stock} /> : <FinancialContent annual={annual} onToggle={() => setAnnual((value) => !value)} />}
  </Stack>;
}

function ValueContent({ stock }: any) {
  return <Stack spacing="12px">
    <InsightCard><Stack direction="row" sx={{ height: 34, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 22, fontWeight: 600, color: colors.marketRise }}>{stock.currentPrice.toLocaleString()}원</Typography><Box sx={{ px: 1, py: 0.5, border: `1px solid ${colors.warning}`, borderRadius: '7px', color: colors.warning, fontSize: 10, fontWeight: 600 }}>W 1.35</Box></Stack><Rows rows={[['전일대비','1,100원 (1.4%)',colors.marketRise],['상승여력(W 0.8 기준)','28,000원 (35.0%)',colors.marketRise]]} /></InsightCard>
    <InsightCard title="적정주가" caption="RIM · 원"><Stack direction="row" spacing="8px" sx={{ mt: '10px' }}>{[['0.7','92,000'],['0.8','108,000'],['0.9','123,500'],['1.0','142,000']].map(([w,p]) => <Box key={w} sx={{ flex: 1, minWidth: 0, height: 54, p: '7px 8px', border: '1px solid #596980', borderRadius: '9px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 10, fontWeight: 600, color: '#B8C2D1' }}>W {w}</Typography><Typography noWrap sx={{ textAlign: 'right', color: colors.marketRise, fontSize: 10, fontWeight: 600 }}>{p}원</Typography></Box>)}</Stack></InsightCard>
    <InsightCard title="계산 기준" caption="최근 결산"><Rows rows={[['자기자본','273조원'],['예상 ROE','13.4%'],['할인율','8.0%']]} /><Typography sx={{ mt: '8px', fontSize: 10, color: colors.textMuted }}>※ 화면의 금액은 디자인 검토용 예시 데이터입니다.</Typography></InsightCard>
    <InsightCard title="핵심 재무지표" caption="2026 예상"><Rows rows={[['BPS','58,200원'],['EPS','7,800원'],['예상 ROE','13.4%'],['요구수익률','8.0%']]} /></InsightCard>
    <InsightCard title="적정주가 계산식"><Stack spacing="8px" sx={{ mt: '10px' }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>기업가치 = 자기자본 + 초과이익 × 지속계수</Typography><Typography sx={{ fontSize: 11, color: colors.textMuted }}>적정주가 = 기업가치 ÷ 발행주식수</Typography><Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.warning }}>W = 지속계수 0.8 적정주가 ÷ 현재가</Typography></Stack></InsightCard>
    <InsightCard title="데이터 기준" caption="최근 갱신"><Rows rows={[['결산 기준','2025.12'],['실적 기준','2026 예상'],['주가 기준','80,000원',colors.marketRise]]} /></InsightCard>
  </Stack>;
}

type Metric = { name: string; unit: string; change: string; values: string[]; tone?: 'rise' | 'fall' };
const annualGroups: Array<{ title: string; metrics: Metric[] }> = [
  { title: '수익성', metrics: [{ name:'매출액',unit:'조원',change:'+7.5%',values:['258.9','281.4','302.5'] },{ name:'영업이익',unit:'조원',change:'+27.6%',values:['6.6','26.8','34.2'] },{ name:'순이익',unit:'조원',change:'+25.8%',values:['15.5','22.1','27.8'] },{ name:'ROE',unit:'%',change:'+2.1%p',values:['4.1','8.6','10.7'] }]},
  { title: '안정성', metrics: [{ name:'부채비율',unit:'%',change:'-3.2%p',values:['26.4','24.1','20.9'],tone:'fall' },{ name:'유동비율',unit:'%',change:'+8.7%p',values:['258.8','267.1','275.8'] }]},
  { title: '성장성', metrics: [{ name:'매출성장률',unit:'%',change:'+7.5%',values:['-14.3','8.7','7.5'] },{ name:'이익성장률',unit:'%',change:'+27.6%',values:['-84.9','306.1','27.6'] }]},
];

function FinancialContent({ annual, onToggle }: { annual: boolean; onToggle: () => void }) {
  const groups: Array<{ title: string; metrics: Metric[] }> = annual ? annualGroups : [{ title:'수익성', metrics:[{ name:'매출액',unit:'조원',change:'+4.8%',values:['72.1','75.6','79.2'] },{ name:'영업이익',unit:'조원',change:'+12.4%',values:['7.2','8.1','9.1'] },{ name:'순이익',unit:'조원',change:'+9.7%',values:['5.8','6.3','6.9'] },{ name:'ROE',unit:'%',change:'+0.6%p',values:['2.3','2.6','3.2'] }]}];
  const labels = annual ? ['2024','2025','2026E'] : ['2026 1Q','2026 2Q','2026 3QE'];
  return <Stack spacing="8px"><Stack direction="row" sx={{ height: 38, justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontSize: 13, fontWeight: 600 }}>전체 재무지표</Typography><Button onClick={onToggle} variant="outlined" sx={{ minHeight: 34, height: 34, width: 80, borderRadius: '10px' }}>{annual ? '연간 ↕' : '분기 ↕'}</Button></Stack>{groups.map((group) => <Box key={group.title}><Typography sx={{ mb: '8px', color: colors.warning, fontSize: 13, fontWeight: 600 }}>{group.title}</Typography><Stack spacing="8px">{group.metrics.map((metric) => <MetricCard key={metric.name} metric={metric} labels={labels} />)}</Stack></Box>)}</Stack>;
}

function MetricCard({ metric, labels }: { metric: Metric; labels: string[] }) { return <Card sx={{ height: 90, borderRadius: '16px', border: 0 }}><CardContent sx={{ p: '12px 16px !important' }}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: 15, fontWeight: 600 }}>{metric.name} <Box component="span" sx={{ fontSize: 9, color: colors.textMuted }}>{metric.unit}</Box></Typography><Typography sx={{ fontSize: 11, fontWeight: 600, color: metric.tone === 'fall' ? colors.marketFall : colors.marketRise }}>{metric.change}</Typography></Stack><Stack direction="row" sx={{ mt: '12px' }}>{metric.values.map((value,index) => <Box key={labels[index]} sx={{ flex: 1, textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{labels[index]}</Typography><Typography sx={{ mt: '2px', fontSize: 12, fontWeight: index === 2 ? 700 : 400 }}>{value}</Typography></Box>)}</Stack></CardContent></Card>; }
function InsightCard({ title, caption, children }: { title?: string; caption?: string; children: ReactNode }) { return <Card sx={{ borderRadius: '16px', border: 0 }}><CardContent sx={{ p: '16px !important' }}>{title && <Stack direction="row" sx={{ height: 24, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>{caption && <Typography sx={{ fontSize: 10, color: colors.textMuted }}>{caption}</Typography>}</Stack>}{children}</CardContent></Card>; }
function Rows({ rows }: { rows: Array<[string,string,string?]> }) { return <Stack spacing="10px" sx={{ mt: '10px' }}>{rows.map(([label,value,color]) => <Stack key={label} direction="row" sx={{ height: 22, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, color: colors.textMuted }}>{label}</Typography><Typography sx={{ fontSize: 12, fontWeight: 600, color: color ?? colors.textPrimary }}>{value}</Typography></Stack>)}</Stack>; }
