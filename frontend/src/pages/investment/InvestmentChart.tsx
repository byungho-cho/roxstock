import { SnapshotChart } from '../../components/common/SnapshotChart';
import { colors } from '../../styles/tokens';
import { moneyNumber, moneyText, type InvestmentPoint } from './investmentData';

export function InvestmentChart({ points, from, to, expanded = false }: { points: InvestmentPoint[]; from: string; to: string; expanded?: boolean }) {
  return <SnapshotChart testId="investment-chart" ariaLabel="선택 기간 평가금액과 투자금" from={from} to={to}
    height={expanded ? 'clamp(170px, 52dvh, 480px)' : 164} rightAxis={expanded} legend={!expanded} dottedTooltipDate
    series={[{ key: 'evaluation', label: '평가금액', color: colors.marketRise, lineTestId: 'investment-evaluation-line' }, { key: 'investment', label: '투자금', color: colors.marketFall, lineTestId: 'investment-principal-line' }]}
    points={points.map(point => ({ date: point.date, values: { investment: moneyNumber(point.investment), evaluation: moneyNumber(point.evaluation) }, text: { investment: moneyText(point.investment), evaluation: moneyText(point.evaluation) } }))} />;
}
