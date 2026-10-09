// The separate Android web-only package deliberately exposes no native notification bridge.
export const isWebOnlyApp = typeof navigator !== 'undefined' && /\bRoxStockWebOnly\//.test(navigator.userAgent);
