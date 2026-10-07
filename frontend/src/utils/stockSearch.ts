const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export function stockMatches(name: string, symbol: string, query: string) {
  const search = query.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const normalizedName = name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (!search || normalizedName.includes(search) || symbol.toLowerCase().includes(search)) return true;
  const initialSearch = [...search].every(char => {
    const code = char.codePointAt(0)!;
    return code >= 0x1100 && code <= 0x1112;
  });
  if (!initialSearch) return false;
  const nameInitials = [...normalizedName].map(char => {
    const code = char.codePointAt(0)!;
    return code >= 0xac00 && code <= 0xd7a3
      ? initials[Math.floor((code - 0xac00) / 588)].normalize('NFKC') : char;
  }).join('');
  return nameInitials.includes(search);
}
