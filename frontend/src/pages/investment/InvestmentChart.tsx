import { Box, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { colors } from '../../styles/tokens';
import { moneyNumber, moneyText, type InvestmentPoint } from './investmentData';

/** Shared SVG chart: stored dates only, pan-y keeps native vertical scrolling. */
export function InvestmentChart({ points, from, to, expanded = false }: { points: InvestmentPoint[]; from: string; to: string; expanded?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const gesture = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
  useEffect(() => setSelected(null), [points, from, to]);
  const values = points.flatMap(p => [moneyNumber(p.investment), moneyNumber(p.evaluation)]).filter(Number.isFinite);
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 1;
  const padding = Math.max((high - low) * 0.1, Math.abs(high) * 0.02, 1);
  const min = low - padding, max = high + padding;
  const start = Date.parse(from), duration = Math.max(1, Date.parse(to) - start);
  const x = (date: string) => 4 + (Date.parse(date) - start) / duration * 252;
  const y = (value: bigint | null) => 150 - (moneyNumber(value) - min) / (max - min) * 138;
  const path = (key: 'investment' | 'evaluation') => {
    let continuous = false;
    return points.map(p => {
      if (p[key] === null) { continuous = false; return ''; }
      const command = continuous ? 'L' : 'M'; continuous = true;
      return `${command}${x(p.date)},${y(p[key])}`;
    }).join(' ');
  };
  const selectAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const target = ((event.clientX - rect.left) / rect.width * 320 - 4) / 252 * duration + start;
    const nearest = points.reduce<InvestmentPoint | null>((best, p) => !best || Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(best.date) - target) ? p : best, null);
    setSelected(nearest?.date ?? null);
  };
  const point = points.find(p => p.date === selected);
  return <Box data-no-detail-swipe data-testid="investment-chart" data-dates={points.map(p => p.date).join(',')} sx={{ position: 'relative', mt: '8px', minWidth: 0 }}>
    <Box component="svg" role="img" aria-label="선택 기간 평가금액과 투자금" viewBox="0 0 320 164" preserveAspectRatio="none"
      onPointerDown={event => { gesture.current = { x: event.clientX, y: event.clientY, vertical: false }; selectAt(event); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const g = gesture.current; if (!g) { if (event.pointerType === 'mouse') selectAt(event); return; } if (Math.abs(event.clientY - g.y) > Math.abs(event.clientX - g.x) && Math.abs(event.clientY - g.y) > 8) g.vertical = true; if (!g.vertical) selectAt(event); }}
      onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}
      sx={{ display: 'block', width: '100%', height: expanded ? 'clamp(170px, 52dvh, 480px)' : 164, touchAction: 'pan-y', userSelect: 'none' }}>
      {[0, 1, 2, 3].map(i => { const lineY = 12 + i * 46, amount = max - i / 3 * (max - min); return <g key={i}><path d={`M4 ${lineY} H256`} stroke={colors.border} /><text x="262" y={lineY + 3} fill={colors.textMuted} fontSize="9">{Math.round(amount / 10000).toLocaleString('ko-KR')}만</text></g>; })}
      {(['evaluation', 'investment'] as const).map(key => <g key={key}><path data-testid={key === 'evaluation' ? 'investment-evaluation-line' : 'investment-principal-line'} d={path(key)} stroke={key === 'evaluation' ? colors.marketRise : colors.marketFall} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />{points.length === 1 && points[0][key] !== null && <circle cx={x(points[0].date)} cy={y(points[0][key])} r="2" fill={key === 'evaluation' ? colors.marketRise : colors.marketFall} />}</g>)}
      {point && <g data-testid="investment-selection"><path d={`M${x(point.date)} 8 V154`} stroke={colors.textMuted} />{(['investment', 'evaluation'] as const).map(key => point[key] !== null && <circle key={key} cx={x(point.date)} cy={y(point[key])} r="3" fill={key === 'evaluation' ? colors.marketRise : colors.marketFall} />)}</g>}
    </Box>
    {point && <Box data-testid="investment-tooltip" role="status" sx={{ position: 'absolute', pointerEvents: 'none', top: 32, left: x(point.date) > 130 ? '4px' : undefined, right: x(point.date) <= 130 ? '4px' : undefined, maxWidth: 'calc(100% - 8px)', p: '8px', bgcolor: '#111927', border: `1px solid ${colors.border}`, borderRadius: '8px', fontSize: 11, overflowWrap: 'anywhere' }}><Typography sx={{ fontSize: 10 }}>{point.date.replaceAll('-', '.')}</Typography><Typography sx={{ fontSize: 11, color: colors.marketFall }}>투자금 {moneyText(point.investment)}</Typography><Typography sx={{ fontSize: 11, color: colors.marketRise }}>평가금액 {moneyText(point.evaluation)}</Typography></Box>}
    <Stack direction="row" sx={{ justifyContent: 'space-between', pr: '19%', fontSize: 9, color: colors.textMuted }}>{Array.from({ length: 5 }, (_, i) => <span key={i}>{new Date(start + duration * i / 4).toISOString().slice(5, 10).replace('-', '.')}</span>)}</Stack>
  </Box>;
}
