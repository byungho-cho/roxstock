import { Box, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { useRef, type ReactNode } from 'react';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { colors } from '../../styles/tokens';

export function CashPopup({ open, title, onClose, children, input = false, actions }: { open: boolean; title: string; onClose: () => void; children: ReactNode; input?: boolean; actions?:ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  return <Dialog open={open} onClose={onClose} aria-labelledby={input ? 'cash-form-title' : undefined} slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,.6)' } }, transition: { onEntered: () => {
    const field = body.current?.querySelector<HTMLInputElement>('[data-initial-focus="true"]'); field?.focus({ preventScroll: true }); if (field?.type !== 'date') field?.select();
  } }, paper: { sx: { width: input ? 386 : 306, maxWidth: 'calc(100% - 64px)', m: input ? '16px' : '32px', maxHeight: 'calc(100dvh - 32px)', borderRadius: '8px', bgcolor: input ? '#0f1726' : colors.surface, backgroundImage: 'none', p: input ? '0 8px 16px' : '16px', fontFamily: 'RoxHomeInter, sans-serif', '& .MuiButton-root': { minHeight: 0 } } } }}>
    <DialogTitle id={input ? 'cash-form-title' : undefined} sx={{ p: input ? '8px' : 0, mb: input ? 0 : '16px', height: input ? 44 : 'auto', minHeight: input ? 44 : 'auto', boxSizing: 'border-box', bgcolor: input ? colors.canvas : undefined, display: 'flex', alignItems: 'center', gap: '16px', fontSize: input ? 22 : 16, fontWeight: input ? 600 : 400 }}>
      {input && <IconButton aria-label="입력 팝업 뒤로가기" onClick={onClose} sx={{ p: 0, width: 11, height: 28, fontSize: 30, color: colors.textPrimary }}>‹</IconButton>}{title}
    </DialogTitle>
    <DialogContent ref={body} data-testid={input ? 'cash-input-body' : 'cash-popup-body'} sx={{ p: input ? actions ? '0 8px 8px !important' : '0 8px 80px !important' : '0 !important', minHeight: 0, bgcolor: input ? colors.canvas : undefined, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>{children}</DialogContent>
    {open && <OverlayRegionScrollbar scrollRef={body} offset={-4} label="예수금 팝업 스크롤" />}
    {actions && <Box sx={{px:'8px',pt:'8px',flexShrink:0}}>{actions}</Box>}
  </Dialog>;
}
