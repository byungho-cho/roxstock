# Shared

> **2026.10.30 현행 정본:** [기획·설계·개발 상태](../docs/current-state-20261030.md). 이 파일의 날짜별 버전·수치는 당시 기록이며, 충돌 시 현행 정본과 주제별 최신 근거를 우선합니다.

API와 수집기가 함께 사용하는 DB 클라이언트/수집 제외 정책, DB 요청 큐/잠금 계약, 타입, 순수 계산·캐시/조회 유틸리티입니다. 스케줄러·외부 공급자 수집 엔진·HTTP 서버를 시작하지 않습니다.

두 서비스는 `@roxstock/shared/<모듈>` 또는 `@roxstock/shared/prisma`를 사용합니다. 서비스 간 production 소스 import는 허용하지 않으며, 교차 서비스 동작은 통합 테스트에서 검증합니다. `src/generated/prisma`는 `database/prisma/schema.prisma`에서 생성하고 빌드 시 `dist/generated`로 복사합니다. 패키지의 Prisma 타입과 런타임은 모두 이 한 경로를 사용하여 클래스·클라이언트 중복을 피합니다.

루트에서 `npm run prisma:generate`, `npm run build:shared`, `npm --workspace shared test`를 실행합니다. 이 디렉터리를 변경하면 API·수집기 양쪽을 빌드·검증·배포합니다. 스키마와 마이그레이션은 이 디렉터리에 복제하지 않습니다.
