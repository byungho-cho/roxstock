const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export const hasInitialQuery = (query: string) => [...query].some(char => initials.includes(char));
/** Match a contiguous name/code substring; consonants may stand for Hangul syllable initials. */
export function matchesStockSearch(value: string, query: string): boolean {
 const text = [...value.normalize('NFC').toLocaleLowerCase()], search = [...query.trim().normalize('NFC').toLocaleLowerCase()];
 return text.some((_, start) => search.every((char, offset) => {
  const actual = text[start + offset];
  if (actual === undefined) return false;
  if (char === actual) return true;
  const code = actual.charCodeAt(0) - 0xac00;
  return initials.includes(char) && code >= 0 && code < 11172 && initials[Math.floor(code / 588)] === char;
 })) || search.length === 0;
}
