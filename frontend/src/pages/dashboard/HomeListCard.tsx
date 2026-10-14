import {DelayedSkeleton, useDelayedIndicator} from '../../components/common/DelayedSkeleton';
import { Box, Button, ButtonBase, CardActionArea, Skeleton, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { AppCard } from '../../components/common/Common';
import { colors } from '../../styles/tokens';

export function HomeListCard({ title, count, testId, action, children, timestamp, more, moreDisabled=false, notice, titleAction, titleHint, timestampLabel = '', height = 290, compactFooter = false, stable = false, pending=false, compactEmpty=false, naturalCover=false }: {
  title: string; titleHint?: string; count?: string; testId: string; action?: ReactNode; children: ReactNode;
  timestamp?: string | null; updating?: boolean; more?: () => void; moreDisabled?: boolean; notice?: ReactNode; titleAction?: () => void; timestampLabel?: string; height?: number | 'auto'; compactFooter?: boolean; stable?:boolean; pending?:boolean; compactEmpty?:boolean; naturalCover?:boolean;
}) {
  return <AppCard data-testid={testId} data-empty-compact={compactEmpty} sx={{ minWidth: 0, height: compactEmpty?{xs:98,sm:height}:naturalCover?{xs:'auto',sm:height}:compactFooter || stable ? height : { xs: 'auto', sm: height }, border: 0, borderRadius: '8px', p: compactEmpty?{xs:'8px 14px',sm:'12px 14px'}:'12px 14px', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
    <Box sx={{ height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', mb: '4px' }}>
      <Typography component="h2" sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>{titleAction ? <ButtonBase aria-label={titleHint ? `${title} ${titleHint}` : `${title} 조건 설정`} onClick={titleAction} sx={{ font: 'inherit', color: 'inherit', lineHeight: 'inherit', gap: '6px' }}>{title}{titleHint && <Box component="span" data-testid="home-title-hint" sx={{fontSize:11,color:colors.textMuted,fontWeight:400}}>{titleHint}</Box>}</ButtonBase> : title}</Typography>
      <Box sx={{ display: 'flex', gap: '4px', alignItems: 'center' }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>{pending ? <DelayedSkeleton width={30} height={14}/> : count ?? '—'}</Typography>{action}</Box>
    </Box>
    <Box data-testid="home-list-region" aria-busy={pending} sx={{'& > [role="status"]':compactEmpty?{minHeight:26,pb:0}:undefined, flex: 1, minHeight: 0 }}>{children}</Box>
    <Box data-testid="home-card-footer" sx={{ height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
      <Box sx={{ minWidth: 0 }}><Typography title={timestamp ?? undefined} sx={{ minWidth: 0, fontSize: 9, lineHeight: notice ? '12px' : '16px', color: colors.textMuted }}>
        {pending ? <DelayedSkeleton width={90} height={12}/> : <>{timestampLabel}{homeTimestamp(timestamp)}</>}
      </Typography>{notice && <Box role="status" sx={{ fontSize: 8, lineHeight: '10px', color: colors.warning }}>{notice}</Box>}</Box>
      {more && <Button disabled={moreDisabled} onClick={more} sx={{ minHeight: 24, minWidth: 48, p: 0, fontSize: 11, lineHeight: '20px', fontWeight: 400, color: colors.focus }}>더보기</Button>}
    </Box>
  </AppCard>;
}

export function homeTimestamp(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  return parts.replaceAll('-', '.');
}

export function HomeEmpty({ children = '내용이 없습니다.' }: { children?: ReactNode }) {
  return <Typography role="status" sx={{ minHeight: 40, height: '100%', pb: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, lineHeight: '16px', color: colors.textMuted }}>{children}</Typography>;
}

// Both lines end at the same middle/right column edges in every home list.
export function HomeTwoLineRow({ testId, onClick, first, second, color = colors.textPrimary, large = false }: {
  testId: string; onClick: () => void; first: [ReactNode, ReactNode, ReactNode]; second: [ReactNode, ReactNode, ReactNode]; color?: string; large?: boolean;
}) {
  const compactSpacing=testId==='home-holding'||testId==='recent-buy-lot';
  return <CardActionArea data-testid={testId} onClick={onClick} sx={{ display: 'block', textAlign: 'left', color, borderRadius: 0, borderBottom: `1px solid ${colors.borderStrong}`, pl: '8px', pr: 0, py: compactSpacing?'4px':0, height: compactSpacing||large?'auto':43, minHeight: compactSpacing?0:43, '&:last-child': { borderBottom: 0, height:compactSpacing||large?'auto':38,minHeight:compactSpacing?0:38 } }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: large ? 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, .92fr)' : 'minmax(0, 1fr) minmax(max-content, 1fr) minmax(max-content, 1fr)', columnGap: '8px', rowGap: compactSpacing?'4px':'2px', alignItems: 'center', fontVariantNumeric: 'tabular-nums', '& > *': { minWidth: 0, fontSize: 10, lineHeight: '16px', textAlign: 'right', overflowWrap: large ? 'anywhere' : undefined, whiteSpace: large ? undefined : 'nowrap' }, '& > :nth-of-type(3n + 1)': { textAlign: 'left' }, '& > :first-child': { fontSize: 12, lineHeight: '20px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' } }}>
      {first.map((cell, i) => <Box key={`first-${i}`}>{cell}</Box>)}
      {second.map((cell, i) => <Box key={`second-${i}`}>{cell}</Box>)}
    </Box>
  </CardActionArea>;
}

/** Five two-line rows reserve the same body as the normal compact home list. */
export function HomeListLoading({rowCount=5,compact=false}:{rowCount?:number;compact?:boolean}={}) {
  const visible=useDelayedIndicator();
  return <Box aria-label="목록 조회 중" data-loading-indicator={visible?'visible':'waiting'} sx={{visibility:visible?'visible':'hidden'}}>{Array.from({length:rowCount},(_,i)=><Box key={i} sx={{height:compact?(i===rowCount-1?48:49):(i===rowCount-1?38:43),px:'8px',display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',alignContent:'center',gap:compact?'4px 8px':'2px 8px'}}>{Array.from({length:6},(_,j)=><Skeleton key={j} height={j<3?16:12} sx={{transform:'none'}}/>)}</Box>)}</Box>;
}
