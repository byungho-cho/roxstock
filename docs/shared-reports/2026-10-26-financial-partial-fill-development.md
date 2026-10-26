# 재무·가치지표 부분 보완 수정 — 1.2.27

## 범위와 근거

- 기준 main: `a7cfa620131999d91287bf1a7b3c991337b8fa0e` (1.2.26).
- 운영 인계: [PR #329](https://github.com/byungho-cho/roxstock/pull/329), 문서 head `f36f47a74ecd12a992d21c300562550273d20304`의 `2026-10-26-financial-fill-followup.csv`.
- 문서 병합과 관계없이 기존 운영 813종목 보완은 이미 수행된 작업으로 취급한다. 기존 값 삭제·재수집·상태 초기화는 하지 않는다.
- DEVELOPMENT_WAIT 319개 종목·2025 ANNUAL을 모두 비교했다. 314개 비양수 분모 경로와 금융업 5개다. SOURCE_REVIEW 추가 4개 사례는 별도로 재현했다.
- 원본 응답·보완 초안·DB 사본은 비공개 경로에 보관한다. 공유 결과는 [필드별 판정 CSV](assets/2026-10-26-development-wait-field-plan.csv)이며 개인 자산, 비밀값, 원본 로그는 포함하지 않는다.

## 계산·저장 변경

- EPS ≤ 0이면 PER, BPS ≤ 0이면 PBR을 생성하지 않는다. 검증된 음수·0 EPS/BPS는 그대로 보존한다. `EPS_NON_POSITIVE` / `BPS_NON_POSITIVE`는 정상 미적용이며 근거 부족과 구별한다.
- 미적용 PER/PBR 때문에 독립적으로 유효한 EPS·BPS·ROE를 보류하지 않는다. EPS/PER 및 BPS/PBR 의존성만 적용한다.
- 기존 수동값·정상값·기존 출처와 필드별 근거를 보존한다. 기존 분모의 공시·연결/별도·기간 근거가 다르거나 없으면 새 비율을 결합하지 않는다.
- 공통 공시·연결/별도·통화 불일치는 부분 저장으로 우회하지 않는다. 성공 행의 추가 근거 보충 경로와 전기 자본 보충 경로에도 동일한 차단을 적용한다.
- 명시된 회계기간 증명이 불일치할 때 12개월로 대체하지 않는다. 선별 도구는 실제 회계기간 증명 없는 새 EPS/ROE/PER을 보류하되 시점 지표 BPS/PBR은 독립 검증한다.
- 원본 filing을 재작성하지 않는다. 기존 `PeriodValuation` / `supplementedFilings` 투영과 collection write fence, financial lease, revision trigger를 사용한다.

## 319개 전체 읽기 전용 비교

2026-10-26 12:48 UTC 운영 스냅샷과 운영 담당의 검증 초안으로 비교했다. 외부 호출 0회, 운영 데이터 쓰기 0회다. 실행 직전 최신 DB에 대해 계획을 다시 만들어야 한다.

| 판정 | 필드 수 |
|---|---:|
| 저장 가능 | 590 |
| 기존 값 보존 | 4 |
| 정상 미적용 | 77 |
| 근거 부족·정책 검토 보류 | 74 |

저장 가능 범위는 309종목·309기간: EPS 31, BPS 248, ROE 8, PER 0, PBR 301, 보험수익 2필드다. **실제 저장 완료 수가 아니다.**

회계기간 근거 보류 45개 종목에 대해 추가 DART 확인도 준비했으나 공통 일일 예산의 `DAILY_CALL_LIMIT`로 첫 외부 호출 전에 중단됐다(외부 호출 0회). 한도를 변경하거나 우회하지 않았다.

보류 74필드: 회계기간 근거 49, BPS/주식수·우선주 자본 관련 15, 금융업 대응 정책 3, EPS 근거 2, 기초/기말 자본 2, 과거 종가 1, 원본 계정 근거 2. 한 종목에 저장 가능·정상 미적용·보류가 함께 존재할 수 있다.

수정 전 main 계산기를 같은 314개 초안으로 재현하면 314개 모두 기존 운영 후보 검증에 걸리는 비양수 분모 비율을 만들었으며 부적절한 비율은 총 318개였다. 수정 후 정상 미적용으로 분리하고, 추가 근거 보호까지 적용한 위 필드만 계획에 포함한다.

대표 056730 / 2025 ANNUAL / 20260318001655: 기존 EPS -182, ROE -19.544 보존. 잘못된 PER -3.3022는 생성하지 않는다. BPS 839.6473, PBR 0.7158은 독립 저장 가능하다.

## 금융업 대응 정책

| 종목 | 판정 | 실제 대응 근거 |
|---|---|---|
| 000400 롯데손해보험 | 저장 가능 | `ifrs-full_InsuranceRevenue`, 보험수익, 2,129,566,000,000원 |
| 000540 흥국화재 | 저장 가능 | 동일 표준 계정, 보험수익, 2,700,980,000,000원 |
| 003460 유화증권 | 정책 검토 | 이자·수수료 등은 존재하지만 검증된 비교 가능 최상위 계정 미확정 |
| 007330 푸른저축은행 | 정책 검토 | 동일, 순이자손익을 일반기업 매출로 대체하지 않음 |
| 279570 케이뱅크 | 정책 검토 | 동일, 구성 수익을 임의 합산하지 않음 |

보험수익은 IFRS 17의 보험서비스 수익으로 투자 구성요소를 제외한다([IFRS 공식 설명](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-17-insurance-contracts/)). 보험영업수익·투자수익·이자수익과 합산하지 않는다. 동일 금액의 IS/CIS 중복은 한 번만 사용하며 다른 금액·통화·보고기간·공시 혼입은 차단한다. 출처에 원 계정명·표준 ID·`displayName: 보험수익`·mappingPolicy를 남기고 상세 화면 안내에도 보험수익임을 명시한다. 나머지 3개는 수집 불가 확정이나 일반 실패로 바꾸지 않는다.

## SOURCE_REVIEW 별도 재현

- 서한 011370: 선택 첨부정정 `20260703000170` ↔ 실제 본문 `20260703000164`.
- 한국전자인증 041460: `20260327001600` ↔ `20260326000238`.
- 제이씨케미칼 137950: `20260318001500` ↔ `20260318001183`.
- 공식 DART main의 동일 발행사·보고서 family 링크와 이후 정정 순서를 검증한다. 원본 후보가 없다는 이유만으로 첨부정정 연결이 막히는 경로를 수정했다. 본문 반환 접수번호는 그대로 유지하며 두 문서 금액이 같다고 가정하지 않는다. 잘못된 호스트·발행사·후속 본문 정정·근거 없는 연결은 계속 차단한다.
- 폴레드 487580 / `20260330001188`: 당기 열의 필수 항목은 정상이나 금액 없는 선택 지배기업 지분 **구분 제목**을 읽다가 전체가 실패했다. 선택 항목의 빈 제목만 건너뛴다. 필수 금액 빈칸·잘못된 당기 열·연결/별도·통화·잔액 불일치는 계속 차단한다. 실제 공시 사본에서 당기 열 판정 성공, 지배기업 지분은 추정하지 않고 미확보 유지.
- 위 4개는 캐시된 실제 응답으로 재현 검증했고 319개 선별 apply 기본 범위에 추가하지 않았다.

## 검증

- shared 118개 통과, collector 275개 통과.
- backend 154개 통과, 기존 DB 조건부 검사 1개 skip. 이 skip을 DB 저장 검증으로 대체해 보고하지 않는다.
- 별도 로컬 DB 트랜잭션에서 실제 056730 2필드 저장, 기존 값 보존, 재실행 0건, 금융/global·종목 revision 증가 확인 후 강제 롤백. 원래 행과 revision 복구 확인.
- shared/collector/backend 타입 검사 및 collector/backend 빌드 통과. 영/음/양 분모, 부분 저장, 공통 출처 불일치, 수동값 보호, 순서 독립성, 재실행, 비12월 결산, 금융업 중복·당기 열·일반기업 회귀 포함.

## 선별 도구와 실행

`collector/dist/scripts/reprocess-financial-fill.js` (개발: `npm --workspace collector run supplement:financial-fill -- ...`). 기본은 읽기 전용이다. 전체 종목 수집·상태 초기화·원격 API 호출을 하지 않는다. 운영 검증 원본에서 준비한 비공개 evidence JSON 배열 `{symbol, receiptNo, supplemental, financialRows?}`을 사용한다. 금융업은 실제 행이 있어야 대응 판정을 허용한다.

아래 `$P`는 **Git 밖의 비공개 작업 폴더**, 실행 환경은 해당 immutable collector 이미지와 기존 운영 DB 설정이다. CSV는 PR #329의 위 SHA 파일을 사용한다. 증거 파일은 그대로 승인·해시 고정하며 운영 데이터 변동 시 새 계획을 검토한다.

```sh
node collector/dist/scripts/reprocess-financial-fill.js \
  --csv="$P/followup.csv" --evidence="$P/reviewed-evidence.json" --out="$P/plan"
# 대상·필드·현재/후보·출처·보류 사유 확인 후, 첫 배치는 한 종목부터:
node collector/dist/scripts/reprocess-financial-fill.js \
  --csv="$P/followup.csv" --evidence="$P/reviewed-evidence.json" \
  --symbols=056730 --out="$P/one-plan"
node collector/dist/scripts/reprocess-financial-fill.js --apply \
  --csv="$P/followup.csv" --evidence="$P/reviewed-evidence.json" \
  --symbols=056730 --plan="$P/one-plan/plan.json" --batch=1 --out="$P/apply-001"
```

`--fields=bps,pbr`처럼 추가 제한 가능하다. 제한이 달라지면 새 계획을 만든다. 연도/기간은 CSV의 2025 ANNUAL로 고정되고 임의 대상·필드는 거부한다. 기본 apply 배치는 5개, 최대 10개다. 기존 lease 획득 실패·소스 변화·승인 이후 상태 변화는 중단한다. 원래 성공 값은 보존하며 이미 완료된 행은 건너뛴다. 금융 호출 예산은 0회이고 소스 갱신이 필요하면 기존 예산 경로에서 새 증거를 준비해야 한다.

실제 실행 전 최신 운영 전체 DB 백업·압축 검사·체크섬과 별도 비공개 복제본을 보존한다. 코드 배포와 보정 작업의 동시 실행을 피한다. 각 행의 before/after, PREPARED → COMMIT_PENDING → COMMITTED journal과 checkpoint를 비공개 보관한다. COMMIT_PENDING만 남은 장애는 현재 DB/afterHash를 확인해 커밋 여부를 판정하고 해당 행을 재승인한다. 로그에 원본 응답·비밀값·개인 자산을 출력하지 않는다.

## 복구

```sh
node collector/dist/scripts/reprocess-financial-fill.js --rollback \
  --journal="$P/apply-001/journal.jsonl" --out="$P/rollback-001"
```

COMMITTED 행만 역순 복구한다. 현재 행 전체 hash가 저장 직후와 같을 때만 해당 PeriodValuation 사본을 복원한다. 이후 운영 담당이나 수집기가 변경했으면 자동 복구를 거부하고 필드별 대조한다. filing·개인 자산·운영 전체 DB는 덮어쓰지 않는다. revision trigger로 복구 후 캐시도 새 revision을 사용한다. 코드 복구는 배포 기록의 이전 backend/collector 이미지로 하며 인증·소유권 경계를 유지한다. APK 변경 없음, DB migration 없음.

## 코드 배포와 실제 데이터 반영

최초 보고서 작성 시점에는 코드 로컬 검증·319개 dry-run까지 완료했으며 실제 운영 저장은 0건이다. 사용자 후속 승인에 따라 개발 담당이 백업·최신 재대조 후 직접 선별 실행할 수 있다. PR·배포·실제 반영 수와 저장 후 검증은 실행 후 별도 결과로 추가한다. 083450 이후 조사 및 기존 813종목 보완값을 덮어쓰지 않는다. 오류 사건·발생 시각·메모·반복 이력은 이 도구가 변경하지 않는다.
