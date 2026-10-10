const seoulTime=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function accountUpdatedAt(value:string|null|undefined){
 if(!value)return '—';
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—';
 const parts=Object.fromEntries(seoulTime.formatToParts(date).map(p=>[p.type,p.value]));
 return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}
