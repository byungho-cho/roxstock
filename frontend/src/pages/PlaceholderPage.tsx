import { Card, CardContent, Stack, Typography } from '@mui/material';
export function PlaceholderPage({ title }: { title: string }) { return <Stack spacing={2}><Typography variant="h5">{title}</Typography><Card><CardContent><Typography color="text.secondary">이 화면은 다음 개발 단계에서 채워질 예정이에요.</Typography></CardContent></Card></Stack>; }
