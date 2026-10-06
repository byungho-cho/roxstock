import { Box, Button, Dialog, DialogContent, DialogTitle } from '@mui/material';
import { useState } from 'react';

export function YearCalendar({ label, value, min = 1900, onChoose, onClose }: { label: string; value: number; min?: number; onChoose: (year: number) => void; onClose: () => void }) {
  const [first, setFirst] = useState(() => Math.floor(value / 12) * 12);
  return <Dialog open onClose={onClose} slotProps={{ paper: { sx: { width: 300, m: '16px', borderRadius: '8px', bgcolor: '#0E1729', color: '#F8FAFC', backgroundImage: 'none' } } }}>
    <DialogTitle sx={{ p: '12px', fontSize: 14 }}>{label} 선택</DialogTitle>
    <DialogContent sx={{ px: '12px', pb: '12px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '8px' }}><Button aria-label="이전 12년" disabled={first <= 1900} onClick={() => setFirst(y => y - 12)}>‹</Button><span>{Math.max(1900, first)}–{Math.min(2200, first + 11)}</span><Button aria-label="다음 12년" disabled={first + 11 >= 2200} onClick={() => setFirst(y => y + 12)}>›</Button></Box>
      <Box role="group" aria-label={label+' 캘린더'} sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '8px' }}>{Array.from({ length: 12 }, (_, i) => first + i).map(year => <Button key={year} autoFocus={year===value} disabled={year < min || year > 2200} aria-pressed={year===value} onClick={() => onChoose(year)} sx={{ height: 36, minWidth: 0, color: '#F8FAFC', bgcolor: year===value ? '#3B82F6' : '#1E293B', borderRadius: '8px' }}>{year}</Button>)}</Box>
      <Button onClick={onClose} sx={{ width: '100%', mt: '8px', color: '#94A3B8' }}>닫기</Button>
    </DialogContent>
  </Dialog>;
}
