export const newsProviderNames:Record<string,string>={NAVER_NEWS:'네이버 뉴스',HANKYUNG_RSS:'한경 RSS',HANKYUNG_CONSENSUS:'리포트',DART:'DART'};
export function newsProviderReason(error:string|null){
 if(!error)return '정상 확인';
 if(error.startsWith('REPORT_OPTIONAL_SKIPPED:'))return /INVALID_REPORT/.test(error)?'리포트 형식 확인 필요 · 이번 회차 건너뜀':'리포트 제공처 응답 불가 · 이번 회차 건너뜀';
 const messages:string[]=[];
 if(/NAVER_CONFIG_MISSING/.test(error))messages.push('네이버 API 설정 필요');
 if(/NAVER_AUTH_FAILED/.test(error))messages.push('네이버 API 인증 또는 권한 확인 필요');
 if(/NAVER_UNSUPPORTED_LINK/.test(error))messages.push('일부 기사 링크 지원 대기');
 for(const [pattern,message] of [[/WINDOW_LIMIT|UNCONFIRMED_HISTORY/,'과거 구간 확인 불가'],[/CORP_MAPPING_MISSING/,'기업코드 없음으로 공시 수집 제외'],[/QUOTA|DAILY_CALL_LIMIT|020/,'공유 API 호출 한도 또는 제공처 이용 불가'],[/YIELDED|MANUAL_PRIORITY/,'기존 작업 우선 처리 대기'],[/PARSE_FAILED/,'제공처 자료 해석 실패'],[/UNAVAILABLE|SOURCE_UNAVAILABLE|API_FAILED/,'제공처 연결 또는 조회 실패'],[/PAGE_BOUND|CANDIDATE_BOUND/,'이번 조회 범위 상한 도달']] as const)if(pattern.test(error))messages.push(message);
 return messages.join(' · ')||'일부 자료 확인 불가';
}
