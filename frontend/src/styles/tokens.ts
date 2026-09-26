export const colors = {
  canvas: '#080D18', surface: '#111827', raised: '#1E293B',
  border: '#1E293B', borderStrong: '#334155', focus: '#60A5FA',
  textPrimary: '#F8FAFC', textSecondary: '#CBD5E1', textMuted: '#94A3B8',
  marketRise: '#F87171', marketFall: '#60A5FA', marketFlat: '#F8FAFC',
  positive: '#34D399', warning: '#FBBF24', navActive: '#FBBF24',
  error: '#F87171', disabled: '#64748B', buttonPrimary: '#3B82F6',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const pageGutter = { xs: 16, sm: 20 } as const;
export const pageMetrics = { top: 18, gap: 12, cardInset: 16, compactCardInset: 12, headerHeight: 44, navHeight: 72, tabletNavHeight: 64, bottomClearance: 32 } as const;
export const radius = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;
