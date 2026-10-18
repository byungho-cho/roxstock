# 외화 원문 재무제표 (1.1.16)

## 저장과 계산

DART JSON 응답의 원문 금액 문자열을 환율 변환 없이 저장한다. 공시별 `sourceValidation.currency`, `amountUnit=CURRENCY_UNITS`, `amountMultiplier=1`, 접수번호·연결/별도·회계종료일·수집시각을 유지한다. 이미 검증된 실제 회계기간 길이(`fiscalDuration`)와 비정형 결산 검증을 재사용한다. 원화만 허용했던 구 데이터의 통화는 재분류하지 않는다.

DART 원문 금액 컬럼만 DECIMAL(24,0)에서 DECIMAL(65,30)으로 확장한다. 35자리 정수/30자리 소수 범위를 넘는 입력은 저장 전 검증 보류하며 DB의 자동 반올림을 허용하지 않는다. 원문 계정 금액은 JSON 문자열로도 보존한다. 같은 접수번호에서 통화·종목·기간·연결/별도가 달라지면 기존 값을 보존하고 충돌을 기록한다. 기존 값과 다른 공시 금액을 섞어 채우지 않는다.

동일 통화와 회계기준만 분기 차감·전년 비교·기초/기말 평균을 허용한다. 외화 EPS/BPS와 원화 주가로 PER/PBR·EPS 수익률·적정주가·주주가치를 생성하지 않는다. 미산출 이유는 CURRENCY_CONVERSION_REQUIRED(통화 환산 필요)이며 수집 오류가 아니다. 자동 환율 기능은 없다.

목록/상세/차트는 원문 통화와 표시 배율을 표시한다. 통화가 다른 금액은 차트 축을 분리하고 금액 정렬도 통화 그룹 안에서 수행한다. 일간 캐시 스키마는 8로 증가시켜 기존 스냅샷을 재생성하되 과거 주가 스냅샷 정책은 유지한다.

## 기존 보류 복구

`recover-foreign-financials`는 DB의 현재 `REVIEW_REQUIRED + NON_KRW_STORAGE_UNSUPPORTED` 대상만 최대 10개씩 keyset 조회하고 순차 처리한다. 317/14라는 과거 건수는 코드에 사용하지 않는다. 최신 종목 코드·제외 여부·기업 매핑·현재 공시·정정을 다시 검증한다. 기존 공용 잠금·실행 소유권·API 예산·최소 호출 간격을 재사용하며 수동 대기 요청이 있으면 양보한다. 파일 쓰기와 해당 task의 SUCCESS 변경은 하나의 트랜잭션으로 처리한다. 원문 저장과 지표 보완은 별도 집계한다.

새 보완 실행은 원래 보류 진단을 run item/task의 previousReview에 보존한다. 원문이 저장된 정확한 외화 보류 occurrence만 `NATIVE_CURRENCY_SOURCE_STORED`로 해결하며 다른 공시 보류·신규 경고는 처리하지 않는다. 종료·중단 후에는 미성공 task만 다시 대상이 된다. 자동 수집기도 동일 사유의 보류만 소량 재시도하므로 배포 후 잔여분을 정상 스케줄에서 이어간다.

```
node collector/dist/scripts/recover-foreign-financials.js --max-periods=10
node collector/dist/scripts/recover-foreign-financials.js --apply --max-periods=500 --max-calls=1800
```

후자는 최대 20분, API 최대 1800회, 실제 일일 잔여 한도를 모두 적용한다. 마지막 JSON에 before/stored/held/failed/metricsReady/conversionRequired/remaining/cursor/stopReason을 기록한다. 잠금·수동 우선권·예산 때문에 중단된 잔여분을 성공으로 집계하지 않는다.

## 배포와 롤백

기존 production-deploy 절차가 서버 로컬 DB 덤프를 생성하고 gzip/체크섬 검증 후 확장 마이그레이션을 적용한다. 백업과 비밀정보는 Git에 저장하지 않는다. backend → collector → frontend 배포가 모두 성공한 뒤 세 이미지 SHA와 API health를 확인하고 1.1.16의 외화 보완을 실행한다. 네이티브 변경은 없으므로 APK는 배포하지 않는다.

확장 스키마는 기존 정수값을 정확히 보존하고 이전 Prisma 클라이언트도 DECIMAL 값을 읽을 수 있다. 다만 이전 앱은 외화 표시·계산 방어가 없으므로 **외화 입력 후 이전 backend/frontend 이미지로 단순 롤백하면 안 된다.** 문제 시 collector를 먼저 정지/이전 이미지로 복구해 추가 입력을 막고, 통화 방어가 있는 backend/frontend를 유지한 채 수정 이미지를 배포하는 것이 기본 복구다. 전체 구버전 복구가 필요하면 먼저 배포 이후 거래·수집 변경분을 별도 보존하고 백업에서 격리 복구/차이를 대조한 다음 운영 복원을 결정한다. DECIMAL(24,0) 축소는 새 외화 소수점·큰 금액을 잃으므로 자동 down migration은 제공하지 않는다.

## 검증

로컬: shared 86건, backend 140건, collector 216건 및 배포 관련 42건 통과. frontend/backend/collector 타입 검사와 빌드 확인. 신규 테스트는 USD/CNY/JPY 문자열 소수점, 통화 누락·혼재·범위 초과, 같은 공시 보완 통화 충돌, 다른 통화의 평균/성장률/Q4 차감 차단, PER/PBR/RIM/EPS수익률 차단, 외화 오류 오분류 방지를 포함한다.

실제 MariaDB 정밀도 round-trip·원화 기존값 보존·보류 리포트 선택 해결 테스트를 Collector Split Check에 추가했다. 370×465/725×396 화면 테스트를 Frontend Check에 추가했다. 이 CI 결과와 운영 복구 집계는 PR/배포 로그가 최종 근거다. 로컬 환경의 Unix socket 제약 및 브라우저 바이너리 다운로드 실패로 로컬 DB·화면 시각 검증은 수행하지 못했다.

지정된 `codex/review-public-cfs-marker-20261019` / `146c42fa`는 원격에서 조회되지 않았다. main에 있던 CFS 해당사항 없음 인식을 재사용하고 `해당사항이 없습니다.`까지 인식하는 회귀 검증을 추가했다. 기존 정상 15개 기간을 대상으로 하는 초기화·삭제·일괄 재수집은 없다.
