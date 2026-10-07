import { SnapshotChart } from '../../components/common/SnapshotChart';
import type { AssetHistoryDto } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';
import { money, moneyNumber, moneyText } from '../investment/investmentData';
import type { AnalysisPeriod } from './analysisPeriod';

export function AssetAnalysisChart({ points, period, expanded = false }: { points: AssetHistoryDto['data']; period: AnalysisPeriod; expanded?: boolean }) {
  const from = points[0].date, to = points.at(-1)!.date;
  const duration = Math.max(1, Date.parse(to) - Date.parse(from)), seen = new Set<string>();
  const labels = points.map(point => ({ date: point.date, label: period === 'all' ? point.date.slice(0, 4) : period === '1m' ? point.date.slice(5).replace('-', '/') : `${point.date.slice(2, 4)}.${point.date.slice(5, 7)}` }))
    .filter(item => { if (seen.has(item.label)) return false; seen.add(item.label); return true; })
    .reduce<{ date: string; label: string }[]>((result, item) => {
      if (!result.length || (Date.parse(item.date) - Date.parse(result.at(-1)!.date)) / duration * 252 >= 44) result.push(item);
      return result;
    }, []);
  return <SnapshotChart testId="asset-trend-chart" ariaLabel="자산추이 · 날짜별 금액 조회" from={from} to={to}
    height={200} fill={expanded} dateLabels={labels} dateColor={colors.textMuted}
    series={[{ key: 'asset', label: '자산금액', color: colors.marketRise, lineTestId: 'asset-trend-line' }]}
    points={points.map(point => { const value = money(point.totalAssetValue); return { date: point.date, values: { asset: moneyNumber(value) }, text: { asset: moneyText(value) } }; })} />;
}
