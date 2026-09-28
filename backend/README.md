# Backend and collector

Fastify API와 별도 프로세스로 실행되는 가격·계좌 스냅샷 수집기입니다. 두 프로세스는 Prisma 연결과 타입만 공유하며 운영 Compose에서는 \`backend\`, \`collector\` 서비스로 분리됩니다. 수집기 장애나 재시작은 API 컨테이너에 영향을 주지 않습니다.

## 외부 가격 원천

1차 구현은 네이버 금융의 브라우저용 polling 응답 \`https://polling.finance.naver.com/api/realtime/domestic/stock/{종목코드}\`를 사용합니다. 공식 공개 API가 아니므로 응답 변경 가능성이 있습니다.

- 매핑: DB \`securities.symbol\`의 6자리 한국 종목코드 (\`A005930\`도 \`005930\`으로 정규화)
- 필드: \`closePriceRaw\`(현재가), \`compareToPreviousClosePriceRaw\`와 등락 방향(전일 종가 계산), \`localTradedAt\`, \`marketStatus\`
- 제한: 공개된 공식 호출 한도는 없습니다. 기본은 순차 호출 및 종목당 1초 간격이며 \`COLLECTOR_PROVIDER_DELAY_MS\`로 조정합니다.
- 인증키: 현재 원천에는 필요 없습니다. 이후 인증 원천 추가 시 키는 환경변수로만 전달합니다.
- 휴장/미갱신: \`localTradedAt\`의 한국 날짜가 실행일과 다르면 \`STALE\`로 기록하고 가격을 갱신하지 않습니다.
- 대체 검증: \`COLLECTOR_PRICE_PROVIDER=mock\`은 외부 통신 없이 결정적인 가격을 생성합니다. 운영에서는 \`naver\`를 사용합니다.

## KOSPI·KOSDAQ 종목 마스터

금융위원회 공공데이터포털의 KRX상장종목정보 \`getItemInfo_V2\` 응답에서 가장 최근 기준일의 종목코드(\`srtnCd\`), 종목명(\`itmsNm\`), 시장구분(\`mrktCtg\`)을 읽어 \`securities\`에 UPSERT합니다.

- 인증: 일반 인증키(Decoding)를 \`DATA_GO_KR_SERVICE_KEY\`로만 전달합니다.
- 휴장일: 서울 기준 오늘부터 최대 14일 전까지 조회해 데이터가 있는 가장 최근 거래일을 선택합니다.
- 페이징: \`totalCount\`를 기준으로 전체 페이지를 수집합니다.
- 안전장치: 기본 2,000개 미만이면 불완전 응답으로 판단하여 DB에 쓰지 않습니다.
- 상장폐지 처리: 기본값은 기존 종목을 자동 비활성화하지 않습니다. 전체 응답 확인 후 \`COLLECTOR_SECURITY_MASTER_DEACTIVATE_MISSING=true\`로 활성화할 수 있습니다.
- 자동 실행: Asia/Seoul 기준 매일 07시 1회이며 \`COLLECTOR_SECURITY_MASTER_HOUR\`로 조정합니다.

## 선택 종목 장중 실시간 수집

보유·관심·추천 종목은 \`watchlist_items\`에서 합쳐 종목코드 기준으로 중복 없이 조회합니다. 기본 최대 100종목을 평일 NXT 프리마켓 08:00~08:50, KRX 정규장 09:00~15:30, NXT 애프터마켓 15:40~20:00에 60초 간격으로 수집합니다. 세션 전환 공백에는 수집하지 않으며, 한 회차가 60초를 초과하면 회차를 겹치지 않고 완료 직후 다음 회차를 시작합니다.

- 프로세스: \`backend\`, 일일 \`collector\`, \`realtime-collector\`는 독립 실행됩니다.
- 화면 전달: 실시간 수집기가 \`POST /internal/realtime-prices\`로 API 프로세스 캐시에 전달하고 API가 \`GET /api/prices/stream\` SSE로 방송합니다.
- 인증: 내부 전달은 \`COLLECTOR_INTERNAL_TOKEN\` Bearer 토큰을 사용합니다. 실제 토큰은 \`.env.production\`에만 저장합니다.
- DB 저장: 정상 가격 캐시는 기본 60초마다 \`market_prices\`에 UPSERT합니다.
- 정합성: 공급자 거래시각이 기존 값보다 오래된 가격은 캐시와 DB를 덮어쓰지 않습니다.
- 장애 격리: API 전달 실패와 개별 종목 실패가 수집 루프나 DB 저장을 중단시키지 않습니다.
- 호출 제어: 기본 동시 요청은 5개이며 다음 회차와 중복 실행하지 않습니다.
- 휴장·미갱신: 공급자 거래일이 한국 기준 오늘과 다르면 \`STALE\`로 분류하고 전송·저장하지 않습니다.
- 전체 대상이 \`STALE\`이면 기본 300초 동안 원천 호출을 쉬어 휴장일의 불필요한 요청을 줄입니다.
- 네이버 응답의 \`overMarketPriceInfo\`가 프리·애프터마켓 \`OPEN\`일 때 NXT 가격과 거래시각을 우선 사용합니다. NXT 미지원 종목은 마지막 정상 KRX 가격을 유지합니다.

로컬 실행 시 API와 실시간 수집기를 별도 터미널에서 실행합니다.

\`\`\`bash
# 길고 임의적인 동일 토큰을 API와 수집기 환경에 설정
export COLLECTOR_INTERNAL_TOKEN='replace-with-a-long-random-value'
npm --workspace backend run dev

# 다른 터미널
export COLLECTOR_INTERNAL_TOKEN='replace-with-the-same-value'
npm --workspace backend run collector:realtime
\`\`\`

주요 환경변수는 다음과 같습니다.

\`\`\`env
COLLECTOR_REALTIME_ENABLED=true
COLLECTOR_REALTIME_INTERVAL_SECONDS=60
COLLECTOR_REALTIME_DB_FLUSH_SECONDS=60
COLLECTOR_REALTIME_TARGET_REFRESH_SECONDS=30
COLLECTOR_REALTIME_STALE_BACKOFF_SECONDS=300
COLLECTOR_REALTIME_MAX_SECURITIES=100
COLLECTOR_REALTIME_CONCURRENCY=5
COLLECTOR_REALTIME_PRE_MARKET_OPEN=08:00
COLLECTOR_REALTIME_PRE_MARKET_CLOSE=08:50
COLLECTOR_REALTIME_REGULAR_MARKET_OPEN=09:00
COLLECTOR_REALTIME_REGULAR_MARKET_CLOSE=15:30
COLLECTOR_REALTIME_AFTER_MARKET_OPEN=15:40
COLLECTOR_REALTIME_AFTER_MARKET_CLOSE=20:00
COLLECTOR_REALTIME_API_URL=http://backend:3300/internal/realtime-prices
COLLECTOR_INTERNAL_TOKEN=replace-with-a-long-random-value
\`\`\`

운영 로그와 상태는 다음으로 확인합니다.

\`\`\`bash
docker logs --tail=200 -f roxstock-realtime-collector
docker inspect --format='{{.State.Health.Status}}' roxstock-realtime-collector
curl -sS 'http://127.0.0.1:3300/api/prices/latest?symbols=005930,005380'
\`\`\`

## 계좌 보유종목과 대시보드

- `GET /api/accounts/:accountId/holdings`: Lot별 잔여수량을 종목별로 합산해 매입금액, 평가금액, 평가손익과 수익률을 반환합니다.
- `GET /api/accounts/:accountId/dashboard`: 예수금, 주식평가액, 총평가자산과 보유종목을 한 번에 반환합니다.
- 실시간 메모리 캐시와 DB 가격 중 거래시각이 최신인 값을 사용합니다.
- 보유종목 중 가격이 누락된 종목이 있으면 `pricingComplete=false`로 반환하고 주식평가액과 총평가자산을 `null`로 유지합니다.

## 실행

\`\`\`bash
cp backend/.env.example backend/.env
npm ci
npm --workspace backend run prisma:generate
npm --workspace backend run prisma:migrate:deploy

# API
npm --workspace backend run dev

# 스케줄러
npm --workspace backend run collector

# 장중 실시간 수집기
npm --workspace backend run collector:realtime

# 수동 1회 실행
npm --workspace backend run collector:once:securities
npm --workspace backend run collector:once:prices
npm --workspace backend run collector:once:snapshots
npm --workspace backend run collector:once
\`\`\`

실제 가격 원천을 소수 종목으로 먼저 확인할 때는 종목코드를 쉼표로 구분해 전달합니다. 종목코드를 생략하면 활성 종목 전체를 수집합니다.

\`\`\`bash
npm --workspace backend exec -- tsx src/collector/worker.ts prices 005930,005380
\`\`\`

스케줄은 \`Asia/Seoul\` 기준입니다. 가격은 기본 매일 20시에 한 번 수집하고 계좌 스냅샷은 23시에 생성합니다. 일부 종목 실패는 실패 종목만 즉시 한 번 재시도하고, 전체 원천 장애는 기본 60분 뒤 전체를 한 번 재시도합니다. 전 종목이 휴장·미갱신 데이터이면 \`SKIPPED\`로 기록하고 재시도하지 않습니다. \`COLLECTOR_PRICE_COLLECTION_HOUR\`, \`COLLECTOR_PRICE_RETRY_DELAY_MINUTES\`, \`COLLECTOR_SNAPSHOT_HOURS\`로 조정할 수 있습니다.

운영 서버에서 종목 마스터를 즉시 동기화하려면 다음을 실행합니다.

\`\`\`bash
cd /opt/roxstock
BACKEND_IMAGE_TAG="$(docker inspect --format='{{.Config.Image}}' roxstock-backend | sed 's/.*://')" \
  docker compose --project-name roxstock-backend -f infra/docker/compose.prod-backend.yml \
  run --rm --no-deps collector node backend/dist/collector/worker.js securities
\`\`\`

키 자체는 로그·명령행·Git에 출력하지 않습니다. 결과는 \`collector_runs\`의 \`job_type=security-master\`와 대응 \`collector_run_items\`에서 확인합니다.

\`daily_account_snapshots\`는 같은 계좌·날짜를 UPSERT합니다. 현금과 보유 수량의 현재 평가액을 합산하며, 평가에 필요한 가격이 하나라도 없으면 해당 계좌 스냅샷 전체를 만들지 않습니다. 과거 날짜는 자동 재계산하지 않습니다. \`daily_position_snapshots\`는 1차 범위에서 제외했으며 계좌 스냅샷의 가격 완전성 검사 뒤에 확장하도록 코드 위치를 남겼습니다.

## 로그와 운영 확인

프로세스 로그는 JSON 한 줄 형식이며 실행별 결과는 \`collector_runs\`, 종목/계좌별 결과는 \`collector_run_items\`에 저장됩니다. DB 락 \`collector_locks\`가 실행 중복을 차단하고, 실행 메타데이터의 \`scheduleDate\`가 컨테이너 재시작 후 같은 날짜의 자동 수집 중복을 방지합니다. 전체 종목 처리 시간을 고려해 가격 수집 락은 최소 2시간 유지됩니다.

\`\`\`bash
docker logs --tail=200 -f roxstock-collector
docker inspect --format='{{.State.Health.Status}}' roxstock-collector

# 운영 서버에서 수동 재실행 (스케줄러와 DB 락 공유)
cd /opt/roxstock
BACKEND_IMAGE_TAG="$(docker inspect --format='{{.Config.Image}}' roxstock-backend | sed 's/.*://')" \
  docker compose --project-name roxstock-backend -f infra/docker/compose.prod-backend.yml \
  run --rm --no-deps collector node backend/dist/collector/worker.js prices
\`\`\`

운영 서버에서 삼성전자와 현대차만 먼저 검증하려면 다음처럼 마지막 인수에 종목코드를 지정합니다.

\`\`\`bash
cd /opt/roxstock
BACKEND_IMAGE_TAG="$(docker inspect --format='{{.Config.Image}}' roxstock-backend | sed 's/.*://')" \
  docker compose --project-name roxstock-backend -f infra/docker/compose.prod-backend.yml \
  run --rm --no-deps collector node backend/dist/collector/worker.js prices 005930,005380
\`\`\`

실패·0원·빈 응답은 \`market_prices\`에 쓰지 않으므로 마지막 정상 가격이 유지됩니다. 수동 수정 가격도 다음 정상 수집 성공 시에만 갱신됩니다.

## 검증

\`\`\`bash
npm --workspace backend run prisma:validate
npm --workspace backend run prisma:generate
npm --workspace backend run typecheck
npm --workspace backend test
npm --workspace backend run build
docker compose -f infra/docker/compose.prod-backend.yml config
\`\`\`
