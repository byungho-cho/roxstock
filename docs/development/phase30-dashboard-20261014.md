# 30차 대시보드 개선

기준 main: fc25804037ac5cc35f092b24d3310b346ebe3561. 홈은 변경하지 않는다.

## 최종 설계
- 독립 평가자산·태블릿 보유종목 요약 제거. 자산구성 제목 우측 16px 평가자산, 기존 일별손익 색상 유지.
- 커버: 구성 막대 → 자산추이 → 도넛·범례 → 비중 전환 → 갱신시각.
- 태블릿: 왼쪽 구성 막대·도넛·비중·갱신시각, 오른쪽 기간 성과(시작·종료·손익·수익률)와 자산추이. 열 간격 8px, 본문 단일 스크롤.
- AssetAnalysisPage의 dashboardPanel 표현 옵션으로 기존 차트·기간 계산·API 재사용. 원본 자산분석 세부 항목 보존.
- accountId/from/to query key와 AbortSignal로 계좌·기간 응답 분리. 누락 Decimal은 NaN/— 유지.

## 검증
- phase30.spec.ts: 네 화면 크기, 배치·단일 스크롤·비중 전환·기간 연동·계좌 전환·오류 재시도.
- 기존 자산분석 기능 검사는 analysis-function-check.yml에서 유지.
- Phase29 Dashboard Layout CI는 대체된 배치 요구에 맞춰 phase30 검사로 현행화. 전후 화면은 phase30-screen-evidence artifact.
- 검사 결과는 PR 필수 검사와 실행 로그를 기준으로 확인한다.

## APK
webOnly MainActivity는 BuildConfig.SITE_ORIGIN을 loadUrl로 불러온다. 포함 웹 자산·네이티브 설정 변경이 없어 APK 재빌드 불필요.

## 배포
필수 검사 통과 후 이 PR만 병합하고 Production Deploy를 병합 SHA로 시작한다. 운영 반영 완료 대기는 생략한다.
