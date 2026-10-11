# 18차 QA 기록

[상세 계약/검증 범위](../handoff/20261011-phase18-current.md). 로컬 TS·두 빌드·단위181건 통과. 첫 PR head 실제 MariaDB migration 및 정확도/invalidation/CAS 통과. 화면 테스트에서 발견한 정상 차트 여백 collapse8px과 변경 API fixture를 수정해 재검증한다.

[개선 전 API n3 원본](phase18-api-before.json): 2026-10-11 외부 HTTPS, 계좌별 raw값을 기록하지 않으며 API 본문 decoded bytes, median/min/max. 계좌6.083s(5.671–7.839), 대시보드6.938s(6.010–7.850), 추이6.926s(6.088–7.773), 목표가6.955s(5.784–7.802), 전체 최근매수7.530s(6.672–8.625)/430758B. UI 시간이 아니다.

운영 화면 측정은 Phase18 Production Measurements에서 Chromium/Ubuntu, 커버370×465·태블릿725×396 각 n3, cold home 주요/최근/전체 및 warm 재진입, cold설정 기본/계좌영역, cold복리 기본/계산영역과 API횟수/응답시간/bytes/Server-Timing을 분리한다. production API는 읽기만 수행. 모의 slow-response 화면 시간과 운영 시간은 별도 artifact/JSON으로 기록. SHA/UTC/runner/round 포함. 운영 검증 결과는 배포 후 보완한다.
