# 2026-10-20 새벽 종목소식 미추가 조사

조사일: 2026-10-20. 본문 시각은 KST(UTC+9). DB 확인 10:47, 원문 재확인 시작 10:50. 운영 DB 조회와 공개 RSS/목록 조회만 수행했다. 수동 재수집·상태 초기화·운영 코드 변경은 수행하지 않았다.

## 결론

오늘 06:00:31.981~06:02:16.788 실행(run **12691**)은 중단되지 않았다. 대상 37종목, 후보 12건, 중복 12건, 신규 저장 0건, 관계 추가 0건으로 종료했다. 전체 상태는 **PARTIAL**이다. 한경 RSS의 짧은 제공 구간 경고와 다른 제공처의 중복 제거가 함께 발생했다.

“오늘 새 소식이 전혀 없었다”는 결론은 근거가 부족하다. 확정할 수 있는 것은 **해당 실행이 확보한 후보에서는 신규로 선택된 건이 없었다**는 사실이다. RSS는 요구 구간 일부가 누락될 수 있고, 현재 원문에는 실행 이후 기사와 게시 시각 미상의 오늘자 리포트가 존재한다.

## 제공처별 실행 결과

| 제공처 | 상태 | 후보 | 요청 | 신규 저장 0건의 원인 / 범위 |
|---|---|---:|---:|---|
| 한국경제 RSS | PARTIAL | 0 | 3 | finance/economy가 요구 시작 시각까지 거슬러 올라가지 못함. 조회·파싱에 성공한 범위에서 종목 관련성·중요도 조건을 통과한 후보 0건. 전체 구간의 신규 기사 부재는 증명하지 못함 |
| 한경 컨센서스 | SUCCESS | 4 | 1 | 4건 모두 기존 저장 또는 seen 키와 중복. 이 중 3건은 어제 선별에서 탈락해 화면에는 없지만 이미 검토한 것으로 처리됨 |
| DART | SUCCESS | 8 | 68 | 실행 메타데이터상 8건 모두 중복 판정. RSS와 Open DART가 동일 공시를 각각 후보로 만들 수 있으므로 8개의 서로 다른 공시라는 뜻이 아님. 매핑 없는 3종목 경고는 남음 |

어제 최초 실행(run 11531, 10/19 16:06:02~16:06:37)은 후보 8건(DART 4, 컨센서스 4) 중 5건을 저장했다. 현재 소식 테이블은 그 5건이며 오늘 실행으로 추가되지 않았다. 오늘 06시 실행은 from 메타데이터가 10/17 00:00이지만 실제 제공처 조회 하한은 최초 배포일인 **10/19 00:00**보다 앞설 수 없다.

## WINDOW_LIMIT의 정확한 조건

운영 수집기의 조건은 다음과 같다.

```ts
const dates = [...xml.matchAll(/<pubDate>(.*?)<\/pubDate>/g)]
  .map(m => new Date(m[1]).getTime()).filter(Number.isFinite);
if (dates.length >= 50
    && Math.min(...dates) > (requiredFrom ?? from).getTime()) {
  warnings.push('FEED_' + section.toUpperCase() + '_WINDOW_LIMIT');
}
```

- 유효한 pubDate가 **50개 이상**이며, 그중 가장 오래된 시각도 요구 하한보다 **엄격히 늦을 때** 발생한다.
- RSS 반환 구간이 필요한 과거 구간을 덮지 못할 가능성을 나타낸다. 8분 실행 제한, 요청 횟수 제한, 인증 오류를 뜻하지 않는다.
- dates는 XML 전체의 pubDate를 세므로 item 수와 항상 같다고 가정하면 안 된다.
- 후보 파싱은 경고 판정 전에 진행된다. 경고가 있다고 후보를 모두 폐기하는 구조가 아니다.
- INITIAL은 plan.from, 이후는 해당 제공처 watermark(없으면 plan.from)를 requiredFrom으로 사용한다. 실제 후보 조회 from은 72시간 중첩과 최초 배포일 하한을 적용한다.
- RSS는 이전 실행에서도 PARTIAL이라 watermark가 null이다. 오늘 요구 하한은 plan.from인 **10/17 00:00**이다. 최초 배포 이전까지 요구하는 비교 때문에 실제 조회 하한(10/19 00:00)보다 경고 기준이 넓다.
- 후보가 1건 이상이면 경고가 있어도 제공처 상태를 SUCCESS로 정하는 구현이다. 후보 0건일 때 available=false는 FAILED, 나머지 경고가 있으면 PARTIAL, 경고도 없으면 SUCCESS다. 따라서 SUCCESS 자체도 완전성 보증은 아니다.

운영 근거: [news-providers.ts](https://github.com/byungho-cho/roxstock/blob/d6fe9e482816c60797b1caf6eb6800b5db14c90f/collector/src/news-providers.ts), [news-collector.ts](https://github.com/byungho-cho/roxstock/blob/d6fe9e482816c60797b1caf6eb6800b5db14c90f/collector/src/news-collector.ts).

## 실제 신규 소식과 선별·중복 검증

### 한경 RSS

10:50부터 같은 운영 파서로 공개 피드를 읽어 06:00:31.962 컷오프와 그 이후를 나눴다.

| 피드 | 유효 pubDate 수 | 현재 피드 최저~최고 시각(KST) | 컷오프 이전 적격 후보 | 컷오프 이후 적격 후보 |
|---|---:|---|---:|---:|
| finance | 50 | 10/19 14:47:10~10/20 10:24:45 | 0 | 1 |
| economy | 50 | 10/19 18:34:08~10/20 10:03:14 | 0 | 0 |
| it | 50 | 10/18 10:00:06~10/20 10:18:45 | 0 | 0 |

finance에서 [삼성전자 관련 기사](https://www.hankyung.com/article/2026102020576)가 **10/20 07:58:38**에 발행됐다. 운영 파서의 대상·중요도 조건을 통과했다. 오늘 새벽 실행 이후 기사이므로 06시 실행 누락의 증거는 아니다.

RSS는 시간이 지나면 오래된 항목이 밀려나는 목록이다. 현재 피드 조회로 새벽 당시 전체 피드를 복원할 수 없다. 제목의 종목명/코드 일치와 중요도 규칙을 적용하므로 관련 기사 전체를 포괄하지도 않는다.

원문: [finance](https://www.hankyung.com/feed/finance), [economy](https://www.hankyung.com/feed/economy), [it](https://www.hankyung.com/feed/it).

### 한경 컨센서스

10:50 재조회에서 10/19자 후보 4건을 확인했다.

| 리포트 ID | 종목 | 현재 저장 | seen 최초 시각 |
|---|---|---|---|
| 653073 | 현대건설 | 소식 ID 5 | 10/19 16:06:37.921 |
| 653074 | 삼성물산 | 없음 | 10/19 16:06:37.921 |
| 653075 | KT&G | 없음 | 10/19 16:06:37.921 |
| 653078 | 대한항공 | 없음 | 10/19 16:06:37.921 |

네 건 모두 URL 해시와 fingerprint를 DB와 대조했다. 최초 실행에서는 DART 4건과 현대건설 리포트가 상위 5건으로 저장됐다. 나머지 3건도 전체 후보에 대한 seen 기록이 생성돼 이후 다시 선택되지 않는다. **“중복 12건”은 “화면에 12건이 이미 저장돼 있음”을 뜻하지 않는다.**

또한 [10/20자 SK하이닉스 리포트 653114](https://consensus.hankyung.com/analysis/downpdf?report_idx=653114)는 재조회에서 적격 후보였고 저장·seen 모두 없었다. 목록은 날짜만 제공하고 시스템은 00:00 KST로 정규화한다. **06시 이전에 실제 게시됐는지는 확인 불가**다. 새벽 실행 메타데이터의 컨센서스 후보 4건과 현재의 5건을 같은 시점 자료로 취급하지 않는다.

원문: [10/19~10/20 공개 리포트 목록](https://consensus.hankyung.com/analysis/list?sdate=2026-10-19&edate=2026-10-20&now_page=1&pagenum=80&report_type=&search_value=).

### DART

매핑된 34종목의 공개 기업 RSS를 재조회했고 조회 오류 없이 컷오프 이전 적격 후보 4건을 확인했다. 네 건 모두 URL/fingerprint와 기존 저장 기록을 대조했다.

| 접수번호 | 종목·공시 | 기존 소식 ID |
|---|---|---:|
| 20261019800376 | 기업은행 · 결산실적공시예고 | 1 |
| 20261019800197 | 현대건설 · 투자판단관련주요경영사항 | 2 |
| 20261019000039 | 삼성증권 · 증권발행실적보고서 | 3 |
| 20261019800001 | 삼성물산 · 투자판단관련주요경영사항 | 4 |

공시 원문은 [기업은행](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261019800376), [현대건설](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261019800197), [삼성증권](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261019000039), [삼성물산](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261019800001)이다.

오늘 실행은 RSS에 이어 Open DART 보완을 수행했다. 코드상 RSS 34회와 API 예약 34회가 합계 68 요청이며, apiCompleted 또는 후보 존재가 available을 결정한다. 신규 DART API 재호출은 공유 재무 수집 예산에 영향을 주므로 이번 조사에서는 하지 않았다. 실행의 후보별 원본은 별도 저장돼 있지 않아 8건 각각의 경로를 완전히 재구성할 수는 없다. 다만 전체 후보 12건이 모두 중복이고 다른 두 제공처가 각각 0건·4건이므로 **DART 8건도 모두 중복 판정된 사실**은 실행 기록으로 확정한다.

CORP_MAPPING_MISSING:3은 **KODEX 200(069500), KODEX 인버스(114800), KoAct 코스닥엑티브(0163Y0)**다. 일반 상장회사의 공시 매핑 누락과 ETF를 구분해야 한다. 이 3종목은 DART 기업 RSS/API 대상에서 제외되며, SUCCESS가 37종목 전체 공시 확인을 뜻하지 않는다. 이번 새벽에는 DART_API_UNAVAILABLE_OR_QUOTA 경고가 없다. 어제 INITIAL에서의 해당 경고를 오늘 원인으로 옮겨 해석하면 안 된다.

## 성공 시각 표시 확인

| 항목 | 실제 값(KST) | 의미 |
|---|---|---|
| 종목소식 목록 상단 시각 | 10/20 06:02 | stockNewsState.lastCollectedAt. 일부 제공처만 처리돼도 갱신되는 실행 종료 시각 |
| 모니터링 lastSuccessAt | 10/20 06:02:16.788 | stock-news는 SUCCESS **또는 PARTIAL** 실행을 성공 조회에 포함 |
| 컨센서스 제공처 lastSuccessAt | 10/20 06:02:16.788 | 후보가 모두 중복이어도 제공처 SUCCESS면 갱신 |
| DART 제공처 lastSuccessAt | 10/20 06:02:16.788 | 매핑 경고가 있어도 후보가 있으므로 SUCCESS로 갱신 |
| RSS 제공처 lastSuccessAt | null | 두 실행 모두 PARTIAL이어서 갱신되지 않음 |
| 최신 실제 소식 저장 시각 | **10/19 16:06:37.921** | stockNewsItem.collectedAt의 최신 값. 오늘 신규 저장 없음 |

API는 목록 collection.updatedAt에 lastCollectedAt을 전달하고, 프론트는 이를 KST 월/일 시:분으로 표시한다. 목록 상태 안내는 “일부 제공처 수집 실패 · 확인된 소식과 기존 목록을 표시합니다.”다. 운영 프론트 번들 StockNewsPage-D8hTUSfN.js에서도 동일 매핑을 확인했다. 실사용 계정으로 화면에 로그인한 시각 검증은 수행하지 않았으며, **DB→API 코드→배포 번들**을 대조한 결과다.

근거: [stock-news API](https://github.com/byungho-cho/roxstock/blob/d6fe9e482816c60797b1caf6eb6800b5db14c90f/backend/src/routes/stock-news.ts), [collection-status API](https://github.com/byungho-cho/roxstock/blob/d6fe9e482816c60797b1caf6eb6800b5db14c90f/backend/src/routes/collection-status.ts), [운영 목록 화면 소스](https://github.com/byungho-cho/roxstock/blob/70b59c65f1671651c29a2fba5f14dfd8d3cf3534/frontend/src/pages/news/StockNewsPage.tsx).

## 재시도와 개선 제안

오늘 completedDate=2026-10-20, attempts=1, nextRetryAt=null이다. 한 제공처라도 FAILED가 아닌 결과가 있으면 PARTIAL도 날짜 완료로 기록한다. newsSchedule은 당일 completedDate가 있으면 종료하므로 **RSS 경고만 해결하기 위한 당일 자동 재시도는 없다**. 다음 정규 수집은 **10/21 06:00 KST**다. 현재 확인한 새 원문이 생겨도 즉시 목록에 추가되는 실시간 수집 구조는 아니다.

후속 개발 검토 사항:

1. “최근 확인”, “신규 저장”, “전체 제공처 정상 완료” 시각을 구분하고 PARTIAL을 성공 시각에 포함하는 현재 의미를 명시한다.
2. RSS 요구 하한을 최초 배포일 및 실제 필요한 구간과 일치시키고, 과거 구간 확인 불가를 통신 실패와 다른 안내로 표시한다. 짧은 RSS만으로 전체 기간을 보장할 수는 없다.
3. 선별 탈락 후보를 영구 seen 처리하는 정책을 재검토한다. 기존 저장 중복과 과거 선별 제외를 별도 집계하면 원인을 설명할 수 있다.
4. 제공처별 부분 재시도와 완료 판정을 분리하고, 매핑된 대상 수 및 제외 사유를 표시한다. 후보 존재만으로 경고가 SUCCESS에 가려지는 상태 계산도 검토한다.
5. 후보별 식별자·중복 근거·선별 제외 사유를 제한된 진단 기록으로 남기면 과거 실행을 정확히 재구성할 수 있다.

## 확인 범위

수집기/API 운영 이미지 SHA: d6fe9e482816c60797b1caf6eb6800b5db14c90f. 프론트 이미지 SHA: 70b59c65f1671651c29a2fba5f14dfd8d3cf3534. 새벽 collector 로그의 stock news collection 이벤트와 DB run/state/provider/item/seen/run-item 기록을 대조했다. 자격증명·계좌·거래내역·전체 DB는 공유 보고서에 포함하지 않았다. 이 보고서는 원인 조사이며 제안한 정책 변경이나 재수집의 완료 보고가 아니다.
