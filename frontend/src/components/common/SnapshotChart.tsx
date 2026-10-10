import {useChartDismiss} from '../../hooks/useChartDismiss';
import { Box, Stack, Typography } from '@mui/material';
import { useRef, useState, type PointerEvent } from 'react';
import { colors } from '../../styles/tokens';

export type SnapshotChartPoint = { date: string; values: Record<string, number | null>; text: Record<string, string> };
export type SnapshotChartSeries = { key: string; label: string; color: string; lineTestId?: string };
/** Numeric values are geometry only; tooltip text retains source precision. Stored dates only. */
export function SnapshotChart({ points, series, from, to, height = 164, rightAxis = false, legend = false, fill = false,
  dateLabels, dateColor = colors.textMuted, testId, ariaLabel, dottedTooltipDate = false }: {
  points: SnapshotChartPoint[]; series: SnapshotChartSeries[]; from: string; to: string;
  height?: number | string; fill?: boolean; rightAxis?: boolean; legend?: boolean; testId: string; ariaLabel: string;
  dateLabels?: { date: string; label: string }[]; dateColor?: string; dottedTooltipDate?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const gesture = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
  const boundary=useRef<HTMLDivElement>(null);
  useChartDismiss({boundary,clear:()=>setSelected(null),resetKey:JSON.stringify([points, from, to])});
  const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
  const values = points.flatMap(point => series.map(item => point.values[item.key])).filter(finite);
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 1;
  const padding = Math.max((high - low) * .1, Math.abs(high) * .02, 1), min = low - padding, max = high + padding;
  const start = Date.parse(from), duration = Math.max(1, Date.parse(to) - start);
  const x = (date: string) => 4 + (Date.parse(date) - start) / duration * 252;
  const y = (value: number) => 150 - (value - min) / (max - min) * 138;
  const path = (key: string) => {
    let continuous = false;
    return points.map(point => {
      const value = point.values[key];
      if (!finite(value)) { continuous = false; return ''; }
      const command = continuous ? 'L' : 'M'; continuous = true;
      return `${command}${x(point.date)},${y(value)}`;
    }).join(' ');
  };
  const selectAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const target = ((event.clientX - rect.left) / rect.width * 260 - 4) / 252 * duration + start;
    const nearest = points.reduce<SnapshotChartPoint | null>((best, point) => !best || Math.abs(Date.parse(point.date) - target) < Math.abs(Date.parse(best.date) - target) ? point : best, null);
    setSelected(nearest?.date ?? null);
  };
  const point = points.find(item => item.date === selected);
  const amounts = [0, 1, 2, 3].map(i => `${Math.round((max - i / 3 * (max - min)) / 10000).toLocaleString('ko-KR')}만`);
  const gutter = fill && !rightAxis ? Math.max(...amounts.map(label => label.length * 6)) + 4 : 0;
  const tooltipLeft = rightAxis ? 4 : Math.max(...amounts.map(label => label.length * 6)) + 8;
  const labels = dateLabels ?? Array.from({ length: 5 }, (_, i) => {
    const date = new Date(start + duration * i / 4).toISOString().slice(0, 10);
    return { date, label: date.slice(5).replace('-', '.') };
  });
  return <Box data-no-detail-swipe data-no-pull-refresh data-testid={testId} data-dates={points.map(item => item.date).join(',')} sx={{ position: 'relative', mt: '8px', minWidth: 0, ...(fill ? {display:'flex',flexDirection:'column',flex:1,minHeight:0} : {}) }}>
    <Box ref={boundary} sx={{ position: 'relative', height:fill?undefined:height, ...(fill?{flex:1,minHeight:0}:{}) }}>
      {[0, 1, 2, 3].map(i => <Box data-testid={`${testId}-amount`} key={i} sx={{ position: 'absolute', ...(rightAxis ? { right: 0 } : { left: 2 }), pointerEvents: 'none', zIndex: 1, bgcolor: '#111927bb', top: `${(12 + i * 46) / 164 * 100}%`, transform: 'translateY(-50%)', color: colors.textMuted, fontSize: 9 }}>{amounts[i]}</Box>)}
      <Box component="svg" role="img" aria-label={ariaLabel} viewBox="0 0 260 164" preserveAspectRatio="none"
        onPointerDown={event => { gesture.current = { x: event.clientX, y: event.clientY, vertical: false }; selectAt(event); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { const g = gesture.current; if (!g) { if (event.pointerType === 'mouse') selectAt(event); return; } if (Math.abs(event.clientY - g.y) > Math.abs(event.clientX - g.x) && Math.abs(event.clientY - g.y) > 8) g.vertical = true; if (!g.vertical) selectAt(event); }}
        onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}
        sx={{ display: 'block', ml:gutter+'px', width: `calc(100% - ${rightAxis ? 64 : gutter}px)`, height: '100%', touchAction: 'pan-y', userSelect: 'none' }}>
        {[0, 1, 2, 3].map(i => <path key={i} d={`M4 ${12 + i * 46} H256`} stroke={colors.border} />)}
        {series.map(item => <g key={item.key}><path data-testid={item.lineTestId} d={path(item.key)} stroke={item.color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />{points.map((point,index) => finite(point.values[item.key]) && !finite(points[index-1]?.values[item.key]) && !finite(points[index+1]?.values[item.key]) && <circle key={point.date} cx={x(point.date)} cy={y(point.values[item.key]!)} r="2" fill={item.color} />)}</g>)}
        {point && <g data-testid={testId === 'investment-chart' ? 'investment-selection' : `${testId}-selection-guide`}><path data-testid={testId === 'asset-trend-chart' ? 'asset-trend-guide' : undefined} d={`M${x(point.date)} 8 V154`} stroke={colors.textMuted} /></g>}
      </Box>
      {point && series.map(item => finite(point.values[item.key]) && <Box data-testid={testId === 'asset-trend-chart' ? 'asset-trend-selection' : undefined} key={item.key} sx={{ position: 'absolute', pointerEvents: 'none', left: `calc(${gutter}px + ${x(point.date) / 260 * 100}% - ${(rightAxis ? 64 : gutter) * x(point.date) / 260}px)`, top: `${y(point.values[item.key]!) / 164 * 100}%`, transform: 'translate(-50%, -50%)', width: 6, height: 6, borderRadius: '50%', bgcolor: item.color }} />)}
    {point && <Box data-testid={testId === 'investment-chart' ? 'investment-tooltip' : 'asset-trend-tooltip'} data-chart-tooltip role="status" sx={{ position: 'absolute', pointerEvents: 'auto', zIndex: 2, top: legend ? 32 : 18, left: x(point.date) > 130 ? `${tooltipLeft}px` : undefined, right: x(point.date) <= 130 ? rightAxis ? '68px' : '4px' : undefined, maxWidth: rightAxis ? 'calc(100% - 72px)' : `calc(100% - ${x(point.date) > 130 ? tooltipLeft + 4 : 8}px)`, p: '8px', bgcolor: '#111927', border: `1px solid ${colors.border}`, borderRadius: '8px', overflowWrap: 'anywhere' }}><Typography sx={{ fontSize: 10 }}>{dottedTooltipDate ? point.date.replaceAll('-', '.') : point.date}</Typography>{series.map(item => <Typography key={item.key} sx={{ fontSize: 11, color: item.color }}>{series.length > 1 ? `${item.label} ` : ''}{point.text[item.key] ?? '—'}</Typography>)}</Box>}
    </Box>
    {legend && <Stack data-testid="investment-legend" direction="row" spacing="8px" sx={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', bgcolor: '#111927dd', px: '4px', pointerEvents: 'auto', whiteSpace: 'nowrap' }}>{series.map(item => <Typography key={item.key} sx={{ fontSize: 10, color: item.color }}>● {item.label}</Typography>)}</Stack>}

    <Box sx={{ height: 16, flexShrink:0, ml:gutter+'px', position: 'relative', mr: rightAxis ? '64px' : 0, color: dateColor }}>{labels.map((item, index) => <Typography key={`${item.date}:${index}`} data-testid={testId === 'asset-trend-chart' ? 'asset-trend-date' : undefined} sx={{ position: 'absolute', left: `${x(item.date) / 260 * 100}%`, transform: x(item.date) > 232 ? 'translateX(-100%)' : x(item.date) < 20 ? 'none' : 'translateX(-50%)', fontSize: 9, color: 'inherit', whiteSpace: 'nowrap' }}>{item.label}</Typography>)}</Box>
  </Box>;
}
