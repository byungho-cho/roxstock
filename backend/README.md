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

# 수동 1회 실행
npm --workspace backend run collector:once:prices
npm --workspace backend run collector:once:snapshots
npm --workspace backend run collector:once
\`\`\`

스케줄은 \`Asia/Seoul\` 기준입니다. 가격은 기본 20:00~06:00 사이에 60분 간격, 계좌 스냅샷은 20·21·22·23시에 실행합니다. 23시는 당일 마지막 예정 실행입니다. \`COLLECTOR_*\` 환경변수로 시간·주기를 변경할 수 있습니다.

\`daily_account_snapshots\`는 같은 계좌·날짜를 UPSERT합니다. 현금과 보유 수량의 현재 평가액을 합산하며, 평가에 필요한 가격이 하나라도 없으면 해당 계좌 스냅샷 전체를 만들지 않습니다. 과거 날짜는 자동 재계산하지 않습니다. \`daily_position_snapshots\`는 1차 범위에서 제외했으며 계좌 스냅샷의 가격 완전성 검사 뒤에 확장하도록 코드 위치를 남겼습니다.

## 로그와 운영 확인

프로세스 로그는 JSON 한 줄 형식이며 실행별 결과는 \`collector_runs\`, 종목/계좌별 결과는 \`collector_run_items\`에 저장됩니다. DB 락 \`collector_locks\`가 중복 실행을 차단합니다.

\`\`\`bash
docker logs --tail=200 -f roxstock-collector
docker inspect --format='{{.State.Health.Status}}' roxstock-collector

# 운영 서버에서 수동 재실행 (스케줄러와 DB 락 공유)
cd /opt/roxstock
BACKEND_IMAGE_TAG="$(docker inspect --format='{{.Config.Image}}' roxstock-backend | sed 's/.*://')" \
  docker compose --project-name roxstock-backend -f infra/docker/compose.prod-backend.yml \
  run --rm --no-deps collector node backend/dist/collector/worker.js prices
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
