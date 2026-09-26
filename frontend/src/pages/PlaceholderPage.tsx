import { ArrowBackRounded, ConstructionRounded } from '@mui/icons-material';
import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2.25} sx={{ alignItems: 'flex-start' }}>
          <ConstructionRounded color="warning" sx={{ fontSize: 40 }} />
          <div>
            <Typography variant="h6">{title} 임시 화면</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>{description}</Typography>
          </div>
          <Typography variant="body2" color="text.secondary">현재는 화면 이동 흐름을 확인하기 위한 연결 상태입니다.</Typography>
          <Button startIcon={<ArrowBackRounded />} variant="outlined" onClick={() => navigate(-1)}>이전 화면</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
