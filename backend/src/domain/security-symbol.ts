/** Registration preserves invalid characters for validation. */
export const normalizeSecuritySymbol = (symbol: string): string => symbol.trim().replace(/[a-z]/g, letter => letter.toUpperCase());
export const isSecuritySymbol = (symbol: string): boolean => /^[A-Z0-9]{6}$/.test(symbol);
/** Strip vendor A only from seven-character codes, preserving six-character A codes. */
export const normalizeProviderSymbol = (symbol: string): string => normalizeSecuritySymbol(symbol).replace(/^A(?=[A-Z0-9]{6}$)/, '');
