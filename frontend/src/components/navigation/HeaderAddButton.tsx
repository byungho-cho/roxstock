import { AddRounded } from '@mui/icons-material';
import { IconButton, Tooltip } from '@mui/material';
import { colors } from '../../styles/tokens';

/** Home's add action, shared by every page header. */
export function HeaderAddButton({ label, onClick, mobileVisible = true }: { label: string; onClick: () => void; mobileVisible?: boolean }) {
  return <Tooltip title={label}><IconButton aria-label={label} onClick={onClick} data-testid="header-add" sx={{ display: { xs: mobileVisible ? 'flex' : 'none', sm: 'flex' }, width: 32, height: 32, minWidth: 32, flexShrink: 0, p: 0, borderRadius: '50%', bgcolor: colors.raised, color: colors.textPrimary, '&:hover': { bgcolor: colors.borderStrong } }}><AddRounded sx={{ fontSize: 22 }} /></IconButton></Tooltip>;
}
