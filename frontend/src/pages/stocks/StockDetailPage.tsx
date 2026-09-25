import { ArrowBackIosNewRounded, FavoriteRounded, MoreHorizRounded } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { stockItems } from '../../data/mockData';
import { colors } from '../../styles/tokens';
import { formatRate, getMarketColor } from '../../utils/format';

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
type DetailTab = 'summary' | 'holding' | 'trades';

export function StockDetailPage() {
  const { stockId = 'hyundai' } = useParams(); const navigate = useNavigate();
  const stock = stockItems.find((item) => item.id === stockId) ?? stockItems[0];
  const holding = stock.listType === 'holding';
  const [tab, setTab] = useState<DetailTab>(holding ? 'holding' : 'summary');
  const [dialog, setDialog] = useState<'price' | 'category' | 'delete' | null>(null);
  const invested = (stock.quantity ?? 0) * (stock.averagePrice ?? 0); const market = stock.marketValue ?? 0; const profit = stock.profitAmount ?? market - invested;
  return <Stack spacing="12px" sx={{ pb: 2 }}>
    <StockHeader name={stock.name} symbol={stock.symbol} onBack={() => navigate('/stocks')} />
    <Card sx={{ height: 64, borderRadius: '16px' }}><CardContent sx={{ height: '100%', px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', '&:last-child': { pb: 1 } }}><Box><Typography sx={{ fontSize: 22, fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{won(stock.currentPrice)}</Typography><Typography sx={{ fontSize: 12, color: getMarketColor(stock.priceChangeRate) }}>{won(stock.currentPrice * stock.priceChangeRate / 100)} ({formatRate(stock.priceChangeRate)})</Typography></Box><Button onClick={() => holding ? navigate(`/trade?type=buy&stock=${stock.id}`) : setDialog('category')} sx={{ minHeight: 32, bgcolor: colors.raised }}>{holding ? '매수 +' : `W ${(stock.pbr ?? 1).toFixed(2)} · ${stock.listType === 'recommended' ? '추천종목' : '관심종목'} ›`}</Button></CardContent></Card>
    {holding && <Tabs value={tab} onChange={(_, value: DetailTab) => setTab(value)} variant="fullWidth" sx={{ minHeight: 40, p: '3px', bgcolor: colors.surface, borderRadius: '14px', '& .MuiTab-root': { minHeight: 34, py: 0, fontSize: 12, borderRadius: '9px' }, '& .MuiTabs-indicator': { display: 'none' }, '& .Mui-selected': { bgcolor: colors.buttonPrimary, color: '#fff !important' } }}><Tab value="summary" label="요약" /><Tab value="holding" label="보유 현황" /><Tab value="trades" label="거래내역" /></Tabs>}
    {holding ? <HoldingDetail tab={tab} invested={invested} market={market} profit={profit} stock={stock} onDelete={() => setDialog('delete')} navigate={navigate} /> : <InterestDetail stock={stock} onCategory={() => setDialog('category')} onDelete={() => setDialog('delete')} />}
    <SimpleDialog type={dialog} onClose={() => setDialog(null)} onDelete={() => navigate('/stocks')} />
  </Stack>;
}

function StockHeader({ name, symbol, onBack }: { name: string; symbol: string; onBack: () => void }) { return <Stack direction="row" sx={{ height: 40, alignItems: 'center', justifyContent: 'space-between' }}><IconButton onClick={onBack} sx={{ width: 36 }}><ArrowBackIosNewRounded sx={{ fontSize: 18 }} /></IconButton><Box sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 18, fontWeight: 600 }}>{name}</Typography><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{symbol}</Typography></Box><FavoriteRounded sx={{ width: 36, color: colors.warning }} /></Stack>; }

function HoldingDetail({ tab, invested, market, profit, stock, onDelete, navigate }: any) {
  if (tab === 'trades') return <Stack spacing={1.5}>{['2026.09.10 매수 70주','2026.07.22 매수 20주','2026.03.14 매도 10주'].map((text, i) => <Card key={text} sx={{ borderRadius: '16px' }}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography>{text}</Typography><IconButton size="small" onClick={onDelete}><MoreHorizRounded /></IconButton></Stack><Typography sx={{ mt: 1, color: i === 2 ? colors.marketRise : colors.marketFall }}>{won((i + 1) * 4_370_000)}</Typography></CardContent></Card>)}</Stack>;
  if (tab === 'summary') return <Stack spacing={1.5}><InfoCard title="투자 요약" rows={[['매입금액',won(invested)],['평가금액',won(market)],['평가손익',won(profit)],['수익률',formatRate(stock.profitRate ?? 0)]]} /><Stack direction="row" spacing={1}><Button fullWidth variant="outlined" onClick={() => navigate(`/stocks/${stock.id}/value`)}>가치분석</Button><Button fullWidth variant="outlined" onClick={() => navigate(`/stocks/${stock.id}/financials`)}>재무지표</Button></Stack></Stack>;
  return <Stack spacing={1.5}>{[1,2].map((lot) => <Card key={lot} sx={{ borderRadius: '16px' }}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography color="text.secondary">2026.0{lot}.10</Typography><Typography color="text.secondary">보유 {lot === 1 ? 8 : 58}일</Typography></Stack><InfoRows rows={[['매수',`${lot === 1 ? 70 : 20} × ${won((stock.averagePrice ?? 0) - lot * 5000)}`],['예상',`${lot === 1 ? 70 : 20} × ${won(stock.currentPrice * 1.03)}`],['손익률',formatRate((stock.profitRate ?? 0) / lot)]]} /></CardContent></Card>)}</Stack>;
}

function InterestDetail({ stock, onCategory, onDelete }: any) { return <Stack spacing={1.5}><InfoCard title="가치지표" action={<Button onClick={onCategory} size="small">W {(stock.pbr ?? 1).toFixed(2)} · 분류 변경 ›</Button>} rows={[['현재가',won(stock.currentPrice)],['전일대비',formatRate(stock.priceChangeRate)],['주요지표',`PER ${stock.per ?? '-'} · PBR ${stock.pbr ?? '-'} · ROE ${stock.roe ?? '-'}%`]]} /><InfoCard title="계산 기초 데이터" rows={[['지배순이익','3.16조'],['발행주식수','92,331천주'],['자기주식수','1,245천주'],['자산','85.4조'],['부채','50.6조'],['주당배당금','5,000원']]} /><Card><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}><InfoRows rows={[["메모",stock.note ?? '재평가 구간 관찰']]} /></CardContent></Card><Stack direction="row" spacing={1.5}><Button fullWidth color="error" variant="outlined" onClick={onDelete}>삭제</Button><Button fullWidth variant="contained">수정</Button></Stack></Stack>; }
function InfoCard({ title, rows, action }: { title: string; rows: string[][]; action?: ReactNode }) { return <Card sx={{ borderRadius: '16px' }}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontWeight: 700 }}>{title}</Typography>{action}</Stack><InfoRows rows={rows} /></CardContent></Card>; }
function InfoRows({ rows }: { rows: string[][] }) { return <Stack spacing={0.75} sx={{ mt: 1 }}>{rows.map(([l,v]) => <Stack key={l} direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, color: colors.textMuted }}>{l}</Typography><Typography sx={{ fontSize: 12, fontWeight: 600 }}>{v}</Typography></Stack>)}</Stack>; }
function SimpleDialog({ type, onClose, onDelete }: { type: string | null; onClose: () => void; onDelete: () => void }) { return <Dialog open={Boolean(type)} onClose={onClose} fullWidth><DialogTitle>{type === 'delete' ? '종목을 삭제할까요?' : type === 'price' ? '현재가 수정' : '종목 분류 변경'}</DialogTitle><DialogContent><Typography color="text.secondary">{type === 'delete' ? '연결된 목록에서 이 종목이 제거됩니다.' : '목 화면에서 동작을 확인하는 임시 팝업입니다.'}</Typography></DialogContent><DialogActions><Button onClick={onClose}>취소</Button><Button variant="contained" color={type === 'delete' ? 'error' : 'primary'} onClick={type === 'delete' ? onDelete : onClose}>{type === 'delete' ? '삭제' : '확인'}</Button></DialogActions></Dialog>; }
