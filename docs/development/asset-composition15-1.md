# 15.1차 자산구성 최종 3안 구현 · 2026-10-09

기준 main a2edc1f, 작업 브랜치 codex/phase15-1-final-composition-20261009. [최종 명세](../handoff/20261009-phase15-1-cash-ratio-colors.md)가 앞선 색상 규칙을 대체한다.

- cashAllocation은 주식평가액+예수금의 반올림 전 비율로 판정한다. 20<r<30만 투자금 positive/예수금 warning, 나머지는 marketRise/marketFall이다. 금액·% 토큰과 막대 RGB 보간을 분리한다.
- stockBarColor/cashBarColor만 RGB 채널별 선형 보간 후 정수 반올림한다. r>=50에서는 농도만 고정하며 stockPercent=100-r, cashPercent=r로 실제 길이는 유지한다.
- 홈 공통 요약 카드, 평가자산, 자산분석, 현재예수금, 계좌별 예수금은 동일 함수를 재사용한다. 계좌별 조회와 최신 세후예수금 데이터 기준을 유지한다.
- 자산분석은 제목/좌우 금액/12px 막대/좌우 비율 순서다. 기존 주식·예수금 두 행을 제거하고 설명 라벨을 추가하지 않는다. 11px 글씨와 4px 간격, 16px 좌우·8px 상하 카드 패딩을 기존 MUI 컴포넌트에 적용한다. 글씨 줄높이14px로 잘림을 방지한다.
- 시세 누락·분모0·비유한 값·음수 구성은 중립색/—를 표시한다. 확인된 금액을 보존하며 정상 예수금0%는 계산 불가로 취급하지 않는다.
- 수집, API, DB, 손익 계산, 계좌 관리·삭제·초기화, 선택 테두리/제목 및 종목별 비중은 변경하지 않았다.

## 검증과 개발현황

앱 [PR #154](https://github.com/byungho-cho/roxstock/pull/154)를 병합했다. 반영 커밋 fb694b1b771092a4d8ab01b3a8f7ba56e65082c5, 검증한 PR head cbb20c4aacac7f294569d7df1b063457c10d0db2이며 두 커밋의 frontend/src는 동일하다. 로컬·CI TypeScript·프론트 빌드와 13건 단위 검사를 통과했다. Playwright 실행용 Chromium 다운로드가 이 환경에서 유효한 ZIP으로 제공되지 않아 화면 검사는 GitHub Actions에서 수행했다. 계좌 관리 기존 검사 기대색을 최종안으로 갱신하고 15.1차 전용 검사에서 12비율×5화면을 검증했다. 긴 단일 반복 검사를 비율별로 분리하고 API 모드의 production build + Vite preview에서 실행해 화면57/57을 확인했다. 운영 배포도 성공했고 실제 화면의 색상·배치를 확인했다. 브라우저 검증·운영 배포 결과는 [QA](../qa/asset-composition15-1.md)에 기록한다.
