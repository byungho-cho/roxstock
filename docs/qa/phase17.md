# 17차 QA

정규화·API·수집 경로 및 데이터 보존 기준은 ../development/phase17-alphanumeric-security-codes.md를 따른다.

자동 검사: npm run typecheck:backend, npm run typecheck:frontend, npm run build:backend, npm run build:frontend, npm --workspace backend test, 격리 MariaDB backend/tests/phase16.integration.ts, frontend playwright.phase16.config.ts.

회귀 기준: 0163Y0/0163y0/앞뒤 공백, 005930/069500, 별개 016300, 잘못된 문자/내부 공백/7자리/전각/Unicode 확장 문자, 계좌별 재사용과 분류 제한, 실시간 시세 캐시 구분. 운영 계좌에 테스트 종목/거래를 생성하지 않는다.
