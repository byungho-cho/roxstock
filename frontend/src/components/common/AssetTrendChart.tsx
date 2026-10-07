import { Box, Typography } from '@mui/material';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { colors } from '../../styles/tokens';
import { formatWon } from '../../utils/format';

export type AssetTrendPoint = { date: string; value: number };
export function AssetTrendChart({ points, height, dateMode = 'month', color = colors.marketFall }: { points: AssetTrendPoint[]; height: number | { xs: number; sm: number }; color?: string; dateMode?: 'day' | 'year' | 'month' }) {
  const [selected, setSelected] = useState<string | null>(null);
  const gesture = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
  useEffect(() => setSelected(null), [points]);
  const values = points.map(p => p.value).filter(Number.isFinite);
  const min = Math.min(...values), span = Math.max(1, Math.max(...values) - min);
  const start = Date.parse(points[0]?.date), duration = Math.max(1, Date.parse(points.at(-1)?.date ?? '') - start);
  const x = (date: string) => 8 + (Date.parse(date) - start) / duration * 324;
  const y = (value: number) => 92 - (value - min) / span * 80;
  let continuous = false;
  const path = points.map(p => { if (!Number.isFinite(p.value)) { continuous = false; return ''; } const command = continuous ? 'L' : 'M'; continuous = true; return `${command}${x(p.date)},${y(p.value)}`; }).join(' ');
  const formatDate = (date: string) => dateMode === 'year' ? date.slice(0, 4) : dateMode === 'day' ? date.slice(5).replace('-', '/') : `${date.slice(2, 4)}.${date.slice(5, 7)}`;
  const seen = new Set<string>();
  const labels = points.filter(p => { const label = formatDate(p.date); if (seen.has(label)) return false; seen.add(label); return true; })
    .reduce<AssetTrendPoint[]>((result, p) => { if (!result.length || x(p.date) - x(result.at(-1)!.date) >= 58) result.push(p); return result; }, []);
  const selectAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(), target = ((event.clientX - rect.left) / rect.width * 340 - 8) / 324 * duration + start;
    const nearest = points.reduce<AssetTrendPoint | null>((best, p) => !best || Math.abs(Date.parse(p.date) - target) < Math.abs(Date.parse(best.date) - target) ? p : best, null);
    setSelected(nearest?.date ?? null);
  };
  const point = points.find(p => p.date === selected);
  return <Box data-no-detail-swipe data-no-pull-refresh data-testid="asset-trend-chart" sx={{ position: 'relative', minWidth: 0, mt: '7px' }}>
    <Box sx={{ height, position: 'relative' }}>
      <Box component="svg" role="img" aria-label="자산추이 · 날짜별 금액 조회" viewBox="0 0 340 104" preserveAspectRatio="none"
        onPointerDown={e => { gesture.current = { x: e.clientX, y: e.clientY, vertical: false }; selectAt(e); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { const g = gesture.current; if (!g) { if (e.pointerType === 'mouse') selectAt(e); return; } if (Math.abs(e.clientY-g.y)>Math.abs(e.clientX-g.x) && Math.abs(e.clientY-g.y)>8) g.vertical=true; if (!g.vertical) selectAt(e); }}
        onPointerUp={() => { gesture.current=null; }} onPointerCancel={() => { gesture.current=null; }}
        sx={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y', userSelect: 'none' }}>
        {[12,52,92].map(v => <path key={v} d={`M8 ${v} H332`} stroke={colors.border} />)}
        <path d={path} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />
        {point && <path data-testid="asset-trend-guide" d={`M${x(point.date)} 4 V100`} stroke={colors.textMuted} />}
      </Box>
      {point && Number.isFinite(point.value) && <Box data-testid="asset-trend-selection" sx={{ position: 'absolute', left: `${x(point.date)/340*100}%`, top: `${y(point.value)/104*100}%`, width: 6, height: 6, borderRadius: '50%', bgcolor: color, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />}
    </Box>
    <Box sx={{ height: 16, position: 'relative', color: colors.textMuted }}>{labels.map(p => <Typography key={p.date} data-testid="asset-trend-date" sx={{ position: 'absolute', left: `${x(p.date)/340*100}%`, transform: x(p.date)>300?'translateX(-100%)':x(p.date)<20?'none':'translateX(-50%)', fontSize: 9, whiteSpace: 'nowrap' }}>{formatDate(p.date)}</Typography>)}</Box>
    {point && <Box role="status" data-testid="asset-trend-tooltip" sx={{ position: 'absolute', top: 18, ...(x(point.date)>170 ? {left:4} : {right:4}), maxWidth: 'calc(100% - 8px)', px: '8px', py: '4px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '4px', pointerEvents: 'none', overflowWrap: 'anywhere' }}><Typography sx={{ fontSize: 10 }}>{point.date}</Typography><Typography sx={{ fontSize: 11 }}>{formatWon(point.value)}</Typography></Box>}
  </Box>;
}
