import { CloseRounded } from '@mui/icons-material';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography, type ButtonProps, type CardProps, Card } from '@mui/material';
import type { ReactNode } from 'react';
import { colors, radius, spacing } from '../../styles/tokens';
import { formatAmount, formatSignedAmount, getMarketColor } from '../../utils/format';

export function AppCard({ children, sx, ...props }: CardProps) {
  return <Card {...props} sx={{ bgcolor: colors.surface, backgroundImage: 'none', border: `1px solid ${colors.border}`, borderRadius: `${radius.lg}px`, boxShadow: 'none', ...sx }}>{children}</Card>;
}

export function SectionHeader({ title, action, status }: { title: string; action?: ReactNode; status?: ReactNode }) {
  return <Stack direction="row" sx={{ minHeight: 24, alignItems: 'center', justifyContent: 'space-between' }}><Stack direction="row" spacing="7px" sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>{title}</Typography>{status}</Stack>{action}</Stack>;
}

export function DataRow({ label, value, color = colors.textPrimary, emphasis = false, onClick }: { label: ReactNode; value: ReactNode; color?: string; emphasis?: boolean; onClick?: () => void }) {
  return <Stack direction="row" onClick={onClick} sx={{ minHeight: 18, alignItems: 'center', justifyContent: 'space-between', gap: 2, cursor: onClick ? 'pointer' : 'default' }}><Typography component="div" sx={{ fontSize: 11, color: colors.textMuted }}>{label}</Typography><Typography component="div" sx={{ fontSize: emphasis ? 13 : 12, fontWeight: 600, color, textAlign: 'right' }}>{value}</Typography></Stack>;
}

export function AmountText({ value, signed = false, colorByValue = false, color, size = 14, weight = 600 }: { value: number; signed?: boolean; colorByValue?: boolean; color?: string; size?: number; weight?: number }) {
  return <Typography component="span" sx={{ color: color ?? (colorByValue ? getMarketColor(value) : colors.textPrimary), fontSize: size, fontWeight: weight, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{signed ? formatSignedAmount(value) : formatAmount(value)}</Typography>;
}

export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'rise' | 'fall' | 'warning' | 'success' }) {
  const map = { neutral: colors.textMuted, rise: colors.marketRise, fall: colors.marketFall, warning: colors.warning, success: colors.positive };
  return <Chip size="small" label={label} sx={{ height: 24, borderRadius: `${radius.xs}px`, color: map[tone], bgcolor: `${map[tone]}12`, borderColor: `${map[tone]}55`, '& .MuiChip-label': { px: 1, fontSize: 10 } }} />;
}

export function ActionButton({ children, tone = 'primary', ...props }: ButtonProps & { tone?: 'primary' | 'danger' | 'muted' }) {
  const bg = tone === 'primary' ? colors.buttonPrimary : tone === 'danger' ? colors.marketRise : colors.surface;
  return <Button {...props} variant={tone === 'muted' ? 'outlined' : 'contained'} sx={{ minHeight: 48, borderRadius: `${radius.md}px`, bgcolor: bg, color: tone === 'muted' ? colors.textSecondary : '#fff', borderColor: colors.border, boxShadow: tone === 'muted' ? 'none' : `0 4px 10px ${bg}47`, '&:hover': { bgcolor: bg }, ...props.sx }}>{children}</Button>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = '확인', cancelLabel = '취소', danger = false, onConfirm, onClose }: { open: boolean; title: string; description: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} slotProps={{ paper: { sx: { bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: `${radius.lg}px`, minWidth: 300 } } }}><DialogTitle sx={{ pr: 6 }}>{title}<Button aria-label="닫기" onClick={onClose} sx={{ position: 'absolute', right: spacing.sm, top: spacing.sm, minWidth: 36 }}><CloseRounded /></Button></DialogTitle><DialogContent><Typography color="text.secondary">{description}</Typography></DialogContent><DialogActions sx={{ p: 2 }}><ActionButton autoFocus tone="muted" onClick={onClose}>{cancelLabel}</ActionButton><ActionButton tone={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</ActionButton></DialogActions></Dialog>;
}

export function SummaryRows({ rows }: { rows: Array<{ label: ReactNode; value: ReactNode; color?: string; emphasis?: boolean }> }) {
  return <Stack spacing={spacing.xs / 8}>{rows.map((row, index) => <DataRow key={index} {...row} />)}</Stack>;
}

export function StockIdentity({ name, symbol }: { name: string; symbol: string }) {
  return <Stack spacing="3px"><Typography sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.15 }}>{name}</Typography><Typography sx={{ fontSize: 10, fontWeight: 500, color: colors.textMuted }}>{symbol}</Typography></Stack>;
}

export function ResponsiveList<T>({ items, getKey, renderCard, renderTable }: { items: T[]; getKey: (item: T) => string; renderCard: (item: T) => ReactNode; renderTable: (items: T[]) => ReactNode }) {
  return <><Box sx={{ display: { xs: 'block', sm: 'none' } }}>{items.map((item) => <Box key={getKey(item)}>{renderCard(item)}</Box>)}</Box><Box sx={{ display: { xs: 'none', sm: 'block' } }}>{renderTable(items)}</Box></>;
}

export function SegmentedTabs<T extends string>({ value, items, onChange }: { value: T; items: Array<{ value: T; label: string; disabled?: boolean }>; onChange: (value: T) => void }) {
  return <Box sx={{ p: '5px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: `${radius.md}px` }}><Tabs value={value} onChange={(_, next: T) => onChange(next)} variant="fullWidth" sx={{ minHeight: 34, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minHeight: 34, py: 0, borderRadius: `${radius.sm}px`, color: colors.textMuted, fontSize: 12 }, '& .Mui-selected': { color: `${colors.navActive} !important`, bgcolor: colors.buttonPrimary } }}>{items.map((item) => <Tab key={item.value} value={item.value} label={item.label} disabled={item.disabled} />)}</Tabs></Box>;
}

export function PeriodSelector<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <SegmentedTabs value={value} items={options} onChange={onChange} />;
}
