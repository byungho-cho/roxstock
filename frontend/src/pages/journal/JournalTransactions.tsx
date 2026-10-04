import { Box, ButtonBase, Typography } from '@mui/material';
import { colors } from '../../styles/tokens';
import { sellEvaluation, type JournalEntry } from './journalMath';
export const journalWon = (amount: number | undefined) => amount === undefined ? '—' : `${Math.round(amount).toLocaleString('ko-KR')}원`;
export const journalSignedWon = (amount: number | undefined) => amount === undefined ? '—' : `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${journalWon(Math.abs(amount))}`;
export const journalProfitColor = (amount: number | undefined) => amount === undefined || amount === 0 ? colors.textPrimary : amount > 0 ? '#FF5C66' : '#429EFF';
export const journalRate = (amount: number | undefined) => amount === undefined ? '—' : `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount).toFixed(1)}%`;
const text = { fontSize: 10, lineHeight: '14px', minWidth: 0, overflowWrap: 'anywhere' } as const;
const expression = (quantity: number, price: number | undefined) => `${quantity.toLocaleString('ko-KR')} × ${journalWon(price)}`;
const columns = 'minmax(0, 1fr) minmax(0, 1.55fr) minmax(0, 1.35fr)';
const subColumns = '30px minmax(0, 1fr) minmax(0, .8fr)';
export function JournalTransactions({ entries, onOpen }: { entries: JournalEntry[]; onOpen: (entry: JournalEntry) => void }) {
  return <Box data-testid="journal-transactions">
    {(['buy', 'sell'] as const).map(type => <Box key={type}>
      <Typography sx={{ borderTop: '1px solid #407AC7', pt: '4px', pb: '4px', textAlign: 'center', color: colors.textSecondary, fontSize: 10, lineHeight: '14px' }}>{type === 'buy' ? '매수' : '매도'}</Typography>
      {entries.filter(entry => entry.type === type).map(entry => {
        const evaluation = sellEvaluation(entry);
        return <ButtonBase data-testid={`journal-entry-${entry.id}`} data-scroll-item={`${type}-${entry.id}`} key={entry.id} onClick={() => onOpen(entry)} aria-label={`${type === 'buy' ? '매수' : '매도'} ${entry.stockName} 거래 상세`}
          sx={{ display: 'block', width: '100%', py: type === 'buy' ? '4px' : '5px', textAlign: 'left', color: colors.textPrimary, borderBottom: type === 'sell' ? `1px solid ${colors.border}` : 0, '&:focus-visible': { outline: `2px solid ${colors.focus}` } }}>
          {type === 'buy' ? <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: '4px', alignItems: 'start' }}>
            <Typography sx={text}>{entry.stockName}</Typography>
            <Typography sx={{ ...text, textAlign: 'right', color: '#7A859E' }}>{expression(entry.quantity, entry.price)}</Typography>
            <Typography data-testid="transaction-amount" sx={{ ...text, textAlign: 'right' }}>{journalWon(entry.quantity * entry.price)}</Typography>
          </Box> : <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, .55fr)', gap: '4px', mb: '4px', color: journalProfitColor(evaluation.profit) }}>
              <Typography sx={text}>{entry.stockName} ({journalRate(evaluation.rate)})</Typography>
              <Typography data-testid="transaction-profit" sx={{ ...text, textAlign: 'right' }}>{journalSignedWon(evaluation.profit)}</Typography>
            </Box>
            <Box sx={{ pl: '16px', color: '#7A859E', display: 'grid', gridTemplateColumns: subColumns, columnGap: '4px', rowGap: '4px' }}>
              <Typography sx={text}>매수</Typography><Typography sx={{ ...text, textAlign: 'right' }}>{expression(entry.quantity, entry.buyPrice)}</Typography><Typography data-testid="transaction-cost" sx={{ ...text, textAlign: 'right' }}>{journalWon(evaluation.cost)}</Typography>
              <Typography sx={text}>매도</Typography><Typography sx={{ ...text, textAlign: 'right' }}>{expression(entry.quantity, entry.price)}</Typography><Typography data-testid="transaction-amount" sx={{ ...text, textAlign: 'right' }}>{journalWon(entry.quantity * entry.price)}</Typography>
            </Box>
          </>}
        </ButtonBase>;
      })}
      {!entries.some(entry => entry.type === type) && <Typography sx={{ ...text, color: '#7A859E', textAlign: 'center', py: '8px' }}>내용이 없습니다.</Typography>}
    </Box>)}
  </Box>;
}
