import { Box, Button, ButtonBase, IconButton, InputBase, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { listSecurities, type SecurityDto } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';

function Highlight({ text, query }: { text: string; query: string }) {
  const lower = text.toLocaleLowerCase(), needle = query.toLocaleLowerCase();
  const parts = []; let cursor = 0, index = lower.indexOf(needle);
  if (!needle) return <>{text}</>;
  while (index >= 0) {
    parts.push(text.slice(cursor, index), <Box component="span" key={index} sx={{ color: colors.marketRise }}>{text.slice(index, index + needle.length)}</Box>);
    cursor = index + needle.length; index = lower.indexOf(needle, cursor);
  }
  parts.push(text.slice(cursor)); return <>{parts}</>;
}
export function CashSearch({ accountId, onSelect }: { accountId?: string; onSelect: (security: SecurityDto) => void }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [composing, setComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = !composing && query.trim() === search ? search : '';
  const result = useQuery({ queryKey: ['cashSecuritySearch', accountId, search], enabled: !!accountId && !!current,
    queryFn: ({ signal }) => listSecurities({ accountId, query: search }, signal) });
  useEffect(() => { if (composing) return; const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query, composing]);
  const run = () => { if (!composing) setSearch(query.trim()); };
  const rows = current ? result.data ?? [] : [];
  return <Stack spacing="8px" data-testid="cash-search">
    <Box sx={{ height: 48, display: 'flex', alignItems: 'center', pl: '8px', pr: '24px', gap: '8px', bgcolor: '#1f2b40', border: '1px solid #334766', borderRadius: '8px' }}>
      <IconButton aria-label="검색 실행" onClick={run} sx={{ p: 0, width: 17, height: 16 }}><Box component="img" src="/cash-v04/search.svg" alt="" sx={{ width: 17, height: 16 }} /></IconButton>
      <InputBase autoFocus inputRef={input} value={query} onChange={e => setQuery(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); run(); } }} inputProps={{ 'aria-label': '배당 종목 검색', 'data-initial-focus': 'true', enterKeyHint: 'search', maxLength: 100 }} placeholder="종목명·종목코드 검색" sx={{ flex: 1, minWidth: 0, fontSize: 12 }} />
      <IconButton aria-label="검색어 지우기" disabled={!query} onClick={() => { setQuery(''); setSearch(''); input.current?.focus(); }} sx={{ p: 0, width: 17, height: 16 }}><Box component="img" src="/cash-v04/search-clear.svg" alt="" sx={{ width: 17, height: 16 }} /></IconButton>
    </Box>
    {current && !result.isError && !result.isPending && <Typography sx={{ fontSize: 13, fontWeight: 600, height: 20 }}>‘{current}’ 검색 결과 {rows.length}개</Typography>}
    {current && result.isError ? <Button role="alert" onClick={() => void result.refetch()}>종목 검색 실패 · 다시 시도</Button> : current && result.isPending ? <Typography role="status" sx={{ fontSize: 12 }}>검색 중입니다.</Typography> : rows.length ? rows.map(s =>
      <ButtonBase data-testid="cash-search-result" key={s.id} onClick={() => onSelect(s)} sx={{ height: 52, flexShrink: 0, p: '7px 14px', bgcolor: colors.surface, border: '1px solid #25344d', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: '20px', color: colors.textMuted }}><Highlight text={s.name} query={current} /></Typography>
        <Typography sx={{ fontSize: 10, lineHeight: '15px', color: colors.textMuted }}><Highlight text={s.symbol} query={current} /> · <Highlight text={s.marketType} query={current} /></Typography>
      </ButtonBase>) : <Typography role="status" sx={{ p: '16px', fontSize: 12, color: colors.textMuted }}>{current ? '내용이 없습니다.' : '종목명 또는 종목코드를 입력해 주세요.'}</Typography>}
  </Stack>;
}
