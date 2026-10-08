# 수동 프로토타입 2차 구현 기준

이전 기록: [PER·PBR 분석](./20261008-152215-KST-per-pbr-analysis.md).

최신 main/배포는 a0936ac1000bacf11a7be8d8c896fb7893bd51e5이며 실제 배포 workflow 성공을 확인했다. 개발은 codex/manual-collector-phase2-20261008에서 진행한다. PR #137은 Draft·자동 병합 미등록 상태를 확인했으며 main에 병합하지 않는다.

완료 필수 항목: DART 연간 매출·영업이익·순이익·자산·부채·자본, 가치 EPS·BPS·PER·PBR·ROE. 적자/0 분모는 NOT_APPLICABLE로 근거와 함께 완료 판정에 포함하며 원천 미제공·근거 부족·통신/파싱 실패는 포함하지 않는다. 현재 연도는 원천 E 열만 컨센서스로 별도 저장한다. 최신 시도의 실패 사실과 기존 정상값을 분리한다.

NAVER의 새 종목분석 화면은 FnGuide v3 기업현황을 제공한다. 상단 펀더멘털 PER/PBR은 전 영업일 보통주 수정주가 기준이고, 연간 Financial Summary는 보통주 기말 수정주가 기준이다. EPS/BPS에는 보통주+우선주를 사용하는 제공자 산식이 명시돼 있어 DART EPS와 혼합하지 않는다. 삼성전자에서 실제 2024/2025 확정 열 및 2026/12(E) 컨센서스 열을 확인했다. 각 열의 CFS, 가격/주식 기준, 단위와 직접 수집·계산 구분을 저장한다. 계산 fallback의 기존 우선주/기업행위 검증은 제거하지 않는다.

원천: https://navercomp.wisereport.co.kr/v3/company/c1010001.aspx?cmp_cd=005930

수동 요청의 executionMode=MANUAL_PROTOTYPE 경로에만 새 어댑터를 연결한다. 자동 worker/스케줄/종목 제한/분기 계산은 유지한다. 2023은 별도 검토, 2022 이전 일괄 수집은 제외한다. 대표 종목 운영 검증은 배포 후 수행하며 이 기록은 구현 기준 확인 단계다.
