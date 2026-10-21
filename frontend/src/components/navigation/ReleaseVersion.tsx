import {ButtonBase} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../auth/AuthGate';
import { Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import release from '../../../../backend/src/release.json';
import { liveApiEnabled } from '../../data/liveData';
import { apiRequest } from '../../data/apiClient';
import { colors } from '../../styles/tokens';

export function ReleaseVersion() {
  const {user}=useAuth(),navigate=useNavigate();
  const { data } = useQuery({
    queryKey: ['release-version'],
    queryFn: async () => {
      const result = await apiRequest<{ version: string }>('/version', { cache: 'no-store' });
      if (!/^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(result.version)) throw new Error('Invalid release version');
      return result;
    },
    enabled: liveApiEnabled, staleTime: 0, refetchOnMount: 'always',
    refetchOnWindowFocus: true, refetchInterval: 60_000,
  });
  const label=<Typography data-testid="release-version" sx={{fontSize:11,color:colors.textMuted,textAlign:'right',whiteSpace:'nowrap'}}>V {data?.version ?? release.version}</Typography>;
  return user?.role==='ADMIN'?<ButtonBase aria-label="관리자 화면" onClick={()=>navigate('/detail/admin')}>{label}</ButtonBase>:label;
}
