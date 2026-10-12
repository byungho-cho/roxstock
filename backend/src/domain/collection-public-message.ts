/** Public explanations retain actionable status, never request URLs, credentials, SQL or stack traces. */
export function collectionPublicMessage(value:string|null|undefined):string|null{
 if(!value)return null;
 const text=value.replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [민감정보 숨김]').replace(/(?:https?|mysql|postgres(?:ql)?):\/\/[^\s<>"']+/gi,'[요청 주소 숨김]')
 .replace(/(["']?(?:crtfc_key|api[_-]?key|authorization|password|passwd|token|secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;}]+)/gi,'$1[민감정보 숨김]')

 .replace(/\b[A-Za-z0-9_-]{40,}\b/g,'[원문 식별정보 숨김]');
 if(/\b(?:SELECT|INSERT|UPDATE|DELETE)\s+|PrismaClient|\bat\s+\S+\s*\(|\b(?:ECONN|EPIPE|ETIMEDOUT)\b/.test(text))return '수집 요청 또는 저장 처리에 오류가 발생했습니다. 서버 담당자가 원문 로그를 확인해야 합니다.';
 return text.slice(0,1000);
}
