# Collector

> **2026.10.30 현행 정본:** [기획·설계·개발 상태](../docs/current-state-20261030.md). 이 파일의 날짜별 버전·수치는 당시 기록이며, 충돌 시 현행 정본과 주제별 최신 근거를 우선합니다.

수집기 구현 디렉터리입니다. 일반·실시간·DART 진입점과 스케줄러, 공급자, 파싱·저장·재시도, 수집 전용 테스트·설정·Dockerfile을 포함합니다. API 서버를 시작하지 않습니다.

| 역할 | 개발 실행 | 이미지 실행 |
| --- | --- | --- |
| 일반·스냅샷·보완 | `npm --workspace collector run collector` | `node collector/dist/worker.js daemon` |
| 실시간 | `npm --workspace collector run collector:realtime` | `node collector/dist/realtime-worker.js` |
| DART·수동 요청 처리 | `npm --workspace collector run collector:dart` | `node collector/dist/dart-worker.js` |

루트에서 `npm ci && npm run prisma:generate` 후 실행합니다. 개발 환경은 이 디렉터리의 `.env.example`을 `.env`로 복사하고 같은 DB와 API의 `COLLECTOR_INTERNAL_TOKEN`을 설정합니다. 스케줄·대상·계산식·제공자 정책은 이전 구현을 유지합니다. 운영 환경 파일은 첫 분리 시 기존 서버의 `backend/.env.production`을 계속 공유합니다.

`npm run typecheck:collector`, `npm run build:collector`, `npm --workspace collector test`, `npm --workspace shared test`로 검사합니다. `tests/`의 통합 검증은 격리 MariaDB 전용이며 운영 DB에서 실행하지 않습니다. 수동 일괄 실행 명령은 운영 재수집 허가를 대신하지 않습니다.

일반·실시간·DART 컨테이너는 하나의 `newrox/roxstock-collector:sha-<40자리 SHA>` 이미지를 공유하고 명령만 다르게 사용합니다. 공통 DB 접근·계산·타입은 `@roxstock/shared`를 통해 사용합니다. DB 스키마/마이그레이션 원본은 `database/prisma` 하나이며 수집기 시작 시 마이그레이션을 수행하지 않습니다.

실행·환경변수·독립 배포·복구는 [운영 문서](../docs/collector-service-split.md)를 참고합니다. 분리 전 소스 복구 기준 `v0.2` (`c351ae61a5315cb80c3f9019a83dfa7c0d403c99`)은 보존합니다. 실제 구현은 최신 main과 PR #228 이후 변경을 모두 포함합니다.
