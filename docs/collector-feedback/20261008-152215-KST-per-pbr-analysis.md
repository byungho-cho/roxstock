# PER·PBR 수집 오류 원인 분석 — 2026.10.08 15:22:15 KST

- 작성 시각: 2026-10-08 15:22:15 KST (06:22:15 UTC)
- 분석 데이터: 2026-10-08 15시대의 운영 조회 결과. 실시간 상태는 이후 바뀔 수 있다.
- 대상 저장소: https://github.com/byungho-cho/roxstock
- 실제 실행 이미지 커밋: `22d3181993c36f41f1d9a48eda3370bb606b3570`
- 운영 코드 경로: `/opt/roxstock/.deploy/commits/22d3181993c36f41f1d9a48eda3370bb606b3570`
- 범위: 코드·실행 설정·운영 DB·API 읽기 전용 분석. UI 변경, 코드 수정, 운영 데이터 변경, 일괄 재수집, 배포는 수행하지 않았다.
- 이 문서는 앞선 분석 보고서를 저장한 것이다. 이번 저장 작업에서 추가 진단이나 운영 변경을 실행하지 않았다.
- 키 값·환경변수 값·개인키·요청 인증 헤더는 포함하지 않는다.

## 결론

주요 원인은 인증키 오류가 아니라 수집 설계·계산 제한·API 연결이 함께 작용하는 것이다. 현재 PER·PBR을 KRX에서 직접 수집하는 구현은 없으며, DART 재무자료와 과거 종가로 계산한다.

운영 원본 저장소의 코드가 오래되어 실제 실행 이미지와 일치하는 배포 worktree를 기준으로 분석했다. 아래 시각은 한국시간(KST)이다.

## 1. 실제 수집 원천과 실행 경로

| 항목 | 확인 결과 |
| --- | --- |
| 재무 원천 | Open DART `fnlttSinglAcntAll.json`: EPS·자본 등 |
| 주식수 원천 | Open DART `stockTotqySttus.json`: 동일 공시의 유통주식수 |
| 과거 종가 | KRX `https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=…` — 코스닥은 `ksq_bydd_trd` |
| 주식 기준 검증 | KRX `stk_isu_base_info` / `ksq_isu_base_info` |
| 작업·컨테이너 | `dart-financial-statements`, `roxstock-dart-collector` |
| 스케줄 | 시작 시 및 60초마다 점검. 일반 종목은 18~06시, 휴일은 종일. 우선 종목·수동 요청은 시간창 예외 |
| 대체 경로 | KRX 키가 없을 때만 공공데이터포털 과거 종가 사용. KRX 실패 후 자동 대체는 없음 |
| 별도 계산 경로 | 수동 재무·주가 변경 API가 `valuation_metrics`에 자체 계산값 저장 |
| 컨센서스 경로 | 구현은 있으나 운영에서 비활성, 저장 건수 0 |

KRX 일별매매 응답을 직접 확인했으며 PER·PBR·EPS·BPS 필드가 없다. 과거 종가와 종목기본정보 조회는 HTTP 200이었다. 종목코드 매핑도 정상이다. 분석 중 검토했던 일별 응답의 종목코드 불일치 가설은 실제 대조로 제외했다.

공식 서비스 목록: https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd

## 2. 최근 실행과 영향 범위

| 구분 | 결과 |
| --- | --- |
| 마지막 기록된 시도 | 실행 #533, 2026.10.08 12:11:51~12:12:43 |
| 실행 결과 | 공시 확인 10건, 신규 공시 저장 0건, 실패 0건, 미제공 2건 |
| 가치지표 결과 | 10개 기간 모두 `PARTIAL`, 완성 0건 |
| 마지막 정상 과거 종가 수신 | 2026.10.08 10:15:22, 삼성전자 2026년 Q2 종가 |
| 마지막 PER·PBR 정상 저장 | 현재 저장 데이터에서 확인되지 않음 |
| 가치지표 저장 범위 | 374종목·5,420개 기간 레코드, PER·PBR 모두 null |
| 상태 분포 | `PARTIAL` 4,795 / `INSUFFICIENT` 620 / `FAILED` 5 |
| 과거 종가 보유 | 10개 기간만 보유, 5,410개 기간 미보유 |
| 전체 가치분석 API | 2025년·2026년 각각 2,590종목 모두 PER·PBR null |

실행 #533의 성공 10건은 공시 확인 성공이지 PER·PBR 수집 성공이 아니다. 미제공 2건은 2026년 Q3·연간 공시이며 아직 발표되지 않은 기간으로 구분해야 한다.

DART 사용 기록은 당일 호출 예산 10,000/10,000건이다. 추가 DART 요청은 하지 않았다. 과거 실행의 모든 HTTP 상태·요청별 건수는 저장되어 있지 않아 복원할 수 없다.

| 실행 ID | KST 시각 | 상태·의미 |
| --- | --- | --- |
| 533 | 10/08 12:11:51~12:12:43 | 삼성전자 수동 확인: 공시 10건 성공, 지표 10건 PARTIAL, 미제공 2건 |
| 532 | 10/08 11:18:26~11:19:47 | 삼성SDI 수동 확인: 공시 12건 성공, 지표 12건 PARTIAL |
| 531 | 10/08 10:14:25~10:15:23 | 삼성전자 수동 확인: 공시 10건 성공, 지표 10건 PARTIAL |
| 530 | 10/08 07:33:29~07:35:12 | 삼성전자 공시 확인 후 과거 종가 보충 실패가 기록됨 |
| 527 | 10/08 05:59:43~06:00:16 | 작업 상태 SUCCESS, 공시 2건 확인. 가치지표 완성의 증거는 아님 |

### 요청 기준일과 응답

진단용 KRX 조회는 과거 종가·종목기본정보를 확인하는 읽기 전용 요청이었다. 수집 worker나 저장 함수를 호출하지 않았다.

| 서비스 | 요청 기준일 | 응답 |
| --- | --- | --- |
| `stk_bydd_trd` | 2025.12.30 | HTTP 200, 958건 |
| `stk_bydd_trd` | 2025.12.31 | HTTP 200, 0건 |
| `stk_isu_base_info` | 2025.12.30 | HTTP 200, 958건 |
| `stk_isu_base_info` | 2026.03.10 | HTTP 200, 951건 |

`2025.12.31`은 연말 휴장일의 정상적인 빈 응답이며 `12.30`에는 데이터가 있다. 코드도 전체 시장의 빈 응답에서는 이전 날짜로 이동한다.

- [2025년 연말 휴장 안내](https://securities.koreainvestment.com/main/customer/notice/Notice.jsp?cmd=TF04ga000002&num=45922)
- [KRX 2024년 연말 휴장 안내](https://kind.krx.co.kr/external/2024/12/17/000106/20241217000237/99303.htm)

## 3. 원천 → DB → API 대조

재무 기준은 모두 2025년 연간·연결(CFS)이다. EPS·BPS·종가는 원 단위, PER·PBR은 배수다. DART 원천은 저장된 공시 계정값이며, KRX 종가는 진단 시 직접 재조회했다. 당일 DART 호출 예산 소진으로 DART 원문을 새로 요청하지 않았다.

| 종목 | 원천·계산 재료 | DB 저장값 | 가치분석 API |
| --- | --- | --- | --- |
| 삼성전자 `005930` | EPS 6,605; 지배주주 자본 424,313,255,000,000; 12/30 종가 119,900 | EPS 6,605 / BPS null / PER null / PBR null | DB와 동일 |
| SK하이닉스 `000660` | 저장 공시에 EPS·지배주주 자본 계정 없음; 12/30 종가 651,000 | 네 지표 모두 null | DB와 동일 |
| NAVER `035420` | 저장 공시에 EPS 없음; 지배주주 자본 27,581,956,984,245; 유통주식수 149,579,777; 12/30 종가 242,500 | EPS null / BPS 184,396.297 / PER null / PBR null | DB와 동일 |

KRX 일별매매·종목기본정보 응답에는 네 지표가 없으므로, 위 DB값은 KRX의 PER·PBR·EPS·BPS 원본 저장값이 아니다.

NAVER BPS는 `27,581,956,984,245 ÷ 149,579,777`로 DB값과 일치한다. 삼성전자의 저장 종가도 KRX 재조회값과 일치한다. SK하이닉스·NAVER의 위 종가는 진단 중 원천에서 확인한 값이며 운영 DB에 새로 저장하지 않았다.

| 종목 | 공시 자료 수신 시각 | 가치지표 갱신 시각 |
| --- | --- | --- |
| 삼성전자 | 10/08 07:35:01 | 10/08 12:12:39 |
| SK하이닉스 | 10/01 19:44:35 | 10/08 00:05:21 |
| NAVER | 10/06 14:01:03 | 10/08 00:07:28 |

삼성전자 2025년 종가의 기준일은 2025.12.30, 저장된 종가 수신 시각은 2026.10.08 10:15:08이다. 공시 재무기간 말은 2025.12.31, 공시일은 2026.03.10이다.

계산식은 `PER = 기간 말 종가 ÷ EPS`, `PBR = 기간 말 종가 ÷ BPS`다. 분기 EPS는 누적 EPS를 연환산하며 TTM이 아니다. 현재 실시간 주가는 이 기간별 계산에 사용하지 않는다. BPS는 연결 기준 지배주주 자본과 동일 공시의 유통주식수를 사용하되 우선주 근거 부족 시 계산을 제한한다.

## 4. 확인된 원인

### 4.1 운영 적용 대상 제한

`KRX_VALIDATED_SYMBOLS`가 미설정이므로 기본 대상은 삼성전자뿐이다. 다른 종목은 외부 요청 전에 `KRX_ROLLOUT_NOT_VALIDATED`로 차단된다. 삼성SDI 12개 기간에서 확인했다.

이 코드는 KRX의 HTTP 403이 아니라 내부 적용 제한이다. DART 기초계정 보충도 같은 제한을 사용한다. 이를 “과거 종가 API 서비스 활용 권한 오류”로 표시하는 분류 문제가 있다.

- [historical-close.ts:13](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/collector/historical-close.ts#L13)
- [valuation-supplement.ts:54](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/collector/valuation-supplement.ts#L54)

### 4.2 삼성전자 주식 기준 검증에 따른 계산 차단

2025년 말과 공시일의 KRX 보통주 정보는 일치하지만, DART에 우선주가 존재하고 EPS 계정명이 `기본주당이익`이라는 이유로 보통주 EPS 근거가 인정되지 않는다. BPS도 우선주 존재 시 계산하지 않는다.

2024년에는 상장주식수 변화까지 검증 차단 요인이다. 검증 조건을 없애기보다 보통주 EPS·우선주 자본 배분 근거를 보완해야 한다.

- [valuation-supplement.ts:71](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/collector/valuation-supplement.ts#L71)
- [period-valuation.ts:20](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/domain/period-valuation.ts#L20)

### 4.3 오래된 정규화와 보충 미실행

삼성전자의 공시 정규화 버전은 3, SK하이닉스는 1, NAVER는 2다. 후자의 EPS 계정 누락이 실제 원천 미제공인지 구버전 매핑 누락인지는 이번에 확정하지 못했다. 원문 재조회와 계정 매핑 대조가 필요하다.

### 4.4 종목 분석 API의 저장 테이블 연결 누락

`/api/value-analysis/:id`는 `period_valuations`를 읽는다. 반면 `/api/securities/:id/analysis`는 `valuation_metrics`만 읽는다.

`valuation_metrics`는 0건이며 대표 세 종목 모두 종목 분석 API가 HTTP 200이지만 `valuation: null`을 반환했다. PER·PBR 계산이 해결되어도 이 API에는 별도 연결 수정이 필요하다.

- [securities.ts:190](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/routes/securities.ts#L190)
- [value-analysis.ts:83](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/routes/value-analysis.ts#L83)

## 5. 실패 유형·저장 처리·미확인 사항

| 분류 | 확인 결과 |
| --- | --- |
| 인증·접근 | 진단 시 KRX 조회 정상. 내부 적용 제한을 외부 권한 오류와 분리해야 함 |
| 정상 미제공 | 2025.12.31 전체 시장 빈 응답, 아직 미발표인 2026년 Q3·연간 공시 |
| 통신 실패 | 가치지표 5개 기간에 `NETWORK_ERROR`: 디씨엠·KB오토시스·콜마홀딩스 |
| 파싱·DB 저장 오류 | 대표 사례에서 저장 실패·소수점 변환 오류는 확인되지 않음 |
| API 연결 | 가치분석 API는 DB와 일치. 종목 분석 API는 새 저장 테이블 연결 누락 |

계산값은 소수점 4자리로 저장한다. 기간별 저장은 종목 ID·연도·기간으로 UPSERT한다.

실패 시 정상값을 0/null로 덮는 패턴은 기간별 저장 경로에서 확인되지 않았다. `preserveValues`는 기존 non-null 값을 유지한다. 다만 잘못된 기존 값도 계속 유지될 수 있어 정정 시 공시·계산 버전을 판단하는 정책이 필요하다. 수동 재무·주가 변경 경로는 별도로 null을 기록할 수 있다.

- [preserveValues](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/domain/period-valuation.ts#L44)
- [수동 계산 경로](https://github.com/byungho-cho/roxstock/blob/22d3181993c36f41f1d9a48eda3370bb606b3570/backend/src/routes/securities.ts#L159)

### 증거와 한계

- 관련 DB 실행 기록: `collector_runs` #531~533 및 이전 실행 기록.
- 상세 실패·누락 근거: `period_valuations.supplemental/errors/reasons`, `dart_financial_filings.account_sources`.
- 현재 수집기 컨테이너는 재배포 이후 로그만 남아 있고 관련 실패 이벤트가 없어 과거 원문 로그는 확보하지 못했다.
- 과거 요청별 HTTP 상태·응답 건수·파싱 전 원문·저장 건수 전체는 복원하지 못했다.
- DART 원천 재조회 미수행: 당일 호출 예산 소진. 저장 공시의 EPS 부재를 원천의 정상 미제공으로 단정하지 않는다.
- 브라우저 화면 표시는 미검증이다.
- 현재 운영 값의 이력 전체가 없어 과거 정상값 존재·정정 이력을 완전히 증명하지 못한다.

## 6. 수정안 및 데이터 보충 범위

1. KRX 직접 지표와 DART 기반 계산 지표의 목표·기준을 확정한다.
2. 내부 적용 제한을 외부 권한 오류와 분리하고 종목별 검증 후 적용 범위를 확대한다.
3. 삼성전자 보통주 EPS·우선주 자본 배분 및 기업행위 검증을 보완한다.
4. 종목 분석 API를 기간별 지표 저장 테이블에 연결한다.
5. 마지막 시도·성공 시각, 요청 기준일·상태, 지표별 처리 건수를 별도로 기록한다.
6. 검증 후 대표 종목부터 누락된 계정·종가·계산 지표만 보충한다. 전체 공시 일괄 재수집은 우선 필요하지 않다.

재처리 후보는 5,420개 기간이다. 그중 5,410개는 종가 미보유, 10개는 종가 확보 후 기준 검증 문제다. 원천 미제공·정상 계산 불가 건은 제외한 뒤 실제 정정 범위를 확정해야 한다.

이 분석 요청만으로 운영 DB 변경·일괄 재수집·코드 수정·배포를 승인한 것으로 처리하지 않는다. 수정안 검토 후 별도 범위와 검증 계획을 정해 진행한다.
