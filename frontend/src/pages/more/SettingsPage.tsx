import { Box, Typography } from '@mui/material';
import { AccountResetSection } from './AccountResetSection';

export function SettingsPage() {
  return <Box sx={{ maxWidth: 600 }}>
    <Typography sx={{ fontSize: 18, fontWeight: 700 }}>설정</Typography>
    <AccountResetSection />
  </Box>;
}
