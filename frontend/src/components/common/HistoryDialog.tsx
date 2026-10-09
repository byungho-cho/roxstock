import { Dialog, type DialogProps } from '@mui/material';
import { usePopupHistory } from '../../hooks/usePopupHistory';

/** General local-state dialogs only; confirmation/alert and route dialogs use Dialog. */
export function HistoryDialog({ historyEnabled = true, ...props }: DialogProps & { historyEnabled?: boolean }) {
  const close = usePopupHistory(historyEnabled && props.open, () => props.onClose?.({}, 'escapeKeyDown'));
  return <Dialog {...props} onClose={historyEnabled ? () => void close() : props.onClose} />;
}
