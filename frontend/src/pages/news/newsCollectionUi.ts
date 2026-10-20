export const newsProviderNames:Record<string,string>={HANKYUNG_RSS:'한경 RSS',HANKYUNG_CONSENSUS:'리포트',DART:'DART'};
export function newsProviderReason(error:string|null){
 if(!error)return '정상 확인';
 const messages:string[]=[];
 for(const [pattern,message] of [[/WINDOW_LIMIT|UNCONFIRMED_HISTORY/,'과거 구간 확인 불가'],[/CORP_MAPPING_MISSING/,'일반 기업 공시 매핑 누락'],[/QUOTA|DAILY_CALL_LIMIT|020/,'공유 API 호출 한도 또는 제공처 이용 불가'],[/YIELDED|MANUAL_PRIORITY/,'기존 작업 우선 처리 대기'],[/PARSE_FAILED/,'제공처 자료 해석 실패'],[/UNAVAILABLE|SOURCE_UNAVAILABLE|API_FAILED/,'제공처 연결 또는 조회 실패'],[/PAGE_BOUND|CANDIDATE_BOUND/,'이번 조회 범위 상한 도달']] as const)if(pattern.test(error))messages.push(message);
 return messages.join(' · ')||'일부 자료 확인 불가';
}
