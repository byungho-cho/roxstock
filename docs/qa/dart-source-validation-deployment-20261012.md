# DART 접수번호·보고기간 수정: 최종 배포와 대표 검증 결과

작성: 2026-10-12 09:35 KST 검증 완료 기준. 두 정상 야간 창 관측은 **미완료**이며 이번 결과와 구분한다.

## 배포·변경

- 구현 [PR #194](https://github.com/byungho-cho/roxstock/pull/194), 실제 GRT Q3 반례 교정 [PR #196](https://github.com/byungho-cho/roxstock/pull/196).
- 최종 배포 SHA: `0f660310ceec289228497a60cec338849d641963`.
- [Production Deploy](https://github.com/byungho-cho/roxstock/actions/runs/38187816934) 성공. 백엔드·배치/실시간/DART 수집기 09:29:40 KST healthy, 프론트엔드 09:32:05 KST healthy. 외부 API 검증 통과.
- 최신 main과 충돌 없이 PR로 병합했다. main 직접 push 및 소통 PR #137 병합은 하지 않았다. 별도 진행 중인 화면/앱 작업의 변경은 포함하지 않는다.
- Source 선택과 API 반환 번호를 각각 기록하며 반환 번호를 선택 번호로 바꾸지 않는다. 기업·보고서·요청 연도·실제 기간·정정 관계·혼합 접수번호·통화가 검증되지 않으면 저장하지 않는다.
- 비12월 분기는 하나의 연간 회계 주기라고 가정하지 않고, 보고서별 실제 월을 API 요청 연도와 연결한다. 기존 12/3/6/9월 고정 저장 일자 대신 검증된 공시 제목 기간의 월말을 사용한다. 과거 기간/결산월 근거가 부족하거나 변경되면 검토 대기다.
- 자동 과거/현재, 수동/보완에 공통 검증을 적용했다. 선택 alias/이전 선택 이력으로 중복 요청을 방지하고 source receipt는 그대로 둔다. 이전 rollover 캐시도 새 계약 표식으로 거절한다.
- 수집 시간·호출 한도·지연·CFS→OFS·독립 PER/PBR·RAM·DB pool·프로세스 종료 처리 변경은 없다. 신규 nullable 출처/진단 컬럼 외 자료 수정 migration은 없다. server-local DB 백업 후 기존 SHA 고정 배포를 수행했다.

## 검사

- 최종 [Backend Check](https://github.com/byungho-cho/roxstock/actions/runs/38187211675) / [PR Validation](https://github.com/byungho-cho/roxstock/actions/runs/38187211775) 통과.
- TypeScript, backend/frontend build, backend 201 단위·수집기 회귀, 안전한 진단 필터 2개 통과. 관련 수동 수집·탐색·로딩·재무 화면 UI 회귀도 통과했다. 별도 종합 회귀/Figma QA나 모바일 실기기 검사는 이번 범위가 아니다.
- 실제 격리 MariaDB migration과 GRT 네 기간·CJ·삼성 source/선택 번호, 날짜, KRW 단위/YTD, 중복, 잘못된 저장 거절, 기존 SUCCESS·미완료·금액·오류 기록 보존 검사 통과. 격리 금액/통화는 합성값이며 실제 GRT 통화를 KRW로 간주하지 않는다.
- 원/기재/첨부/추가/철회, 같은 날 여러 공시, 혼합 접수번호, 잘못된 기업/연도/보고서/기간, 결산월 변경/자료 부족, 12/3/6/9월 결산 fixture 통과. 이는 각 기업의 실제 응답을 전수 검증했다는 뜻이 아니다.
- CI의 기존 30ms 테스트 deadline 때문에 정상 파싱이 타임아웃된 fixture는 1000ms로 보완했다. 실제 운영 제한 120초 및 명시적인 timeout/cancellation 검사는 유지했다.

## 실제 DART: 총 11회

최초 [대표 run4782](https://github.com/byungho-cho/roxstock/actions/runs/38186396085)는 목록3+재무6=**9회**. 후속 [GRT Q3 run4783](https://github.com/byungho-cho/roxstock/actions/runs/38188536054)는 목록1+CFS1=**2회**. 최초 전체 요청을 반복하지 않았다. 각 실행은 일일 앱 사용량·lock·버전별 1회 marker·호출 cap 및 기존 응답 후 지연 이상을 확인했다. 앱 counter는 5065→5074→5076, API error0/noData515 유지. 분석 보고서의 기존 8회 요청 및 같은 키의 외부 서비스 사용량은 이번 11회와 별개이며 전체 키 사용량은 미확인이다.

| 사례 | API/작업 연도·코드 | 최종 선택 / 실제 반환 | 실제 기간 | 결과·저장 |
| --- | --- | --- | --- | --- |
| GRT 연간 | 2024 / 11011 / CFS | 20241018000064 / 동일 | 2024.06 | 번호/기간 일치, NON_KRW_STORAGE_UNSUPPORTED, 저장0; 기존 SUCCESS 보존 |
| GRT Q1 | 2024 / 11013 / CFS | 20241125000285 / 동일 | 2024.09 | 번호/기간 일치, 비KRW로 저장0; 기존 작업 변경0 |
| GRT 반기 | 2024 / 11012 / CFS | 20250304000174 / 동일 | 2024.12 | 번호/기간 교정 확인, 비KRW로 저장0; 원래 실패 보존 후 시도3→4/검토 대기 |
| GRT Q3 | 2024 / 11014 / CFS | 20240530000884 / 동일 | 2024.03 | 후속2회에서 일치 확인, 비KRW로 저장0·작업 변경0; 기존 SUCCESS 보존 |
| CJ대한통운 연간 | 2024 / 11011 / CFS | 첨부정정20250317001020 / 원공시20250317000953 | 2024.12 | 관계·KRW 검증 후 신규1건 저장; 시도6→7/FAILED→SUCCESS |
| 삼성전자 연간 | 2024 / 11011 / CFS | 20250311001085 / 동일 | 2024.12 | 정상 대조 통과; 금융자료/작업 변경0 |

GRT Q3는 최초031c0bd에서 잘못된2025.03 후보와 불일치했다. 실제 API 반례2024.03을 확인해 PR196에서 교정하고, 실응답 ID를 회귀 fixture 및 MariaDB 네 기간 검사에 추가한 후 재배포했다. 최종 소스/기간은 맞아도 외화를 원화처럼 저장할 수 없어 GRT 자료는 계속 차단했다. 외화 지원/환산 또는 기존 자료 복구를 수행하지 않았다.

| 운영 보존 지표 | 최초 이전 | 최종 이후 |
| --- | ---: | ---: |
| SUCCESS 작업·filing 수 | 31548 | 31549 |
| FAILED 작업 | 459 | 458 |
| PENDING | 89492 | 89492 |
| NO_FILING | 5807 | 5807 |
| NOT_APPLICABLE | 182 | 182 |
| receipt 중복 | 0 | 0 |
| 기존 제목/저장 기간 불일치 후보 | 324 | 324 |

추가2회 전후에는 작업·financial 수/상태가 모두 같았다. 원래 오류/시도는 append-only 실행 항목과 진단에 보존했다. 오류/미완료 작업 삭제, REVIEW_REQUIRED 전체 초기화, 전량 재수집 또는 기존 금액/기간 일괄 UPDATE는 하지 않았다. 기존 자동 재시도 정책 외에 나머지 실패를 별도 재개하지 않았다.

자동 후속 workflow는 최초 배포 후 등록되지 않아, main SHA와 성공한 배포를 확인한 임시 dispatch 경로 [#195](https://github.com/byungho-cho/roxstock/pull/195)/[#199](https://github.com/byungho-cho/roxstock/pull/199)를 사용했다. PR 코드를 운영에서 실행하지 않고 이미 검토·배포된 main 전용 workflow만 호출했다. 두 임시 PR은 실행 완료 후 **미병합으로 닫았다**. 자동 후속 이벤트가 누락된 정확한 원인은 이번 결과에서 확정하지 않는다.

## 남은 원인·장기 관측

- GRT 비KRW 자료의 금액·EPS·가격·단위/환산 지원은 미해결이며 원화로 강제 저장하지 않는다. GRT 네 기간의 접수번호 연결 확인은 저장 가능 판정과 다르다.
- 원문 검증이 필요한 기재정정/철회/모호한 관계, 결산월 변경·과거 근거 부족 및 전체 실패의 하위 원인별 전수 분류는 미완료다. **남은458건이 모두 접수번호 불일치이거나 두 공통 원인으로 설명된다고 단정하지 않는다.** GRT 반기는 신규 단위 사유로 재분류됐고 NETWORK_ERROR1은 별도 미확인이다.
- [기존 기간 불일치 후보324건](evidence/dart-source-v2-20261012-period-inventory.json)은 읽기 전용 목록이다. 324건 모두 실제 오기재 확정이라는 뜻은 아니다. [개발 문서의 별도 복구안](../development/dart-source-validation.md)에 따라 원문/기간/단위/연결·별도 확인, 제한 백업·before/after·역복구 계획을 먼저 검토해야 한다.
- [두 정상 야간 창의 관측 기준](dart-source-validation.md)을 마련했다. 신규 mismatch/원래 원인별 REVIEW_REQUIRED, 성공/실패/NO_FILING, duplicate/보존, 앱/대표 API 사용량을 같은 조건으로 비교한다. **두 창 및 최소48시간 장기 관측은 아직 미완료**다. 배포나 대표 확인 완료로 대체하지 않는다.
- PROCESS_RESTARTED 기록으로 실제 종료 시각/비정상 종료 또는 접수번호 불일치가 프로세스를 종료시켰다고 단정하지 않는다. 과거 종료 원인은 별도 미확인 사항이다.

안전한 영구 증거: [최초9회 요약](evidence/dart-source-v2-20261012-initial-summary.json), [최종2회 요약](evidence/dart-source-v2-20261012-final-q3-summary.json). 공개 식별자/상태/사용량/기간만 포함하고 인증키·URL/헤더·원문 예외·원문 재무 금액·개인 계좌/보유 금액은 제외했다.
