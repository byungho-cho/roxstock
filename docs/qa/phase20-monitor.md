# 20차 후속: 수집 모니터링·APK 다운로드 검증

2026-10-11 (Asia/Seoul). 기준 main `69f7050` (#188~#190 포함), 작업 브랜치 `codex/phase20-monitor-apk`. 기존 로컬 작업은 별도 폴더에 보존했다. main 직접 push 및 소통용 PR #137 병합은 수행하지 않는다.

## 변경 및 검증 범위

커버 370×465, 태블릿 725×396, Playwright Chromium. 상태별 검증은 격리된 모의 API를 사용하며 운영 수집기를 실패시키거나 운영 데이터를 수정하지 않는다.

- 최초/느린 응답: 전체 상태·5개 수집 제목·현재 상태·처리건수 레이블·필터·새로고침을 즉시 표시한다. 값만 200ms 후 작은 표시기를 사용한다.
- 요약과 5개 상세 각각의 조회 전후 bounding box(너비·높이·위치)를 비교한다. 실행 이력/대상별 결과의 내용 영역도 고정 크기를 비교한다.
- 빠른 응답: DOM 관찰기로 표시된 데이터 스켈레톤이 없음을 확인한다. 유효 캐시 재진입에서 추가 요청이 없고 표시기가 생기지 않는지 확인한다.
- 같은 조건 재조회: 이전 건수·실행 이력을 유지하며 작은 갱신 표시만 표시한다. 조회 실패에도 내용을 유지하고 재시도로 복구한다.
- 최초 조회 실패: 정상/확정 빈 이력/0건을 보여주지 않고 조회 실패 및 재시도를 표시한다. 실제 수집 FAILED 응답은 오류 상태와 실제 원인을 표시하고 조회 실패 안내를 띄우지 않는다.
- 요약 완료·상세 대기: 확인된 상태는 표시하고 상세 이력/진행 수치만 대기한다.
- 다운로드 경로: 설정 직접 URL 2개, 메뉴 설정, 하단 설정 진입을 검사한다. 공통 제목/버튼 `APK 다운로드`, 기능 제한 안내, 원래 URL 및 download 속성을 확인한다.

## 검사 결과

- 프론트 타입 검사 및 production build 통과.
- 기존 20차 단위 검사 1개 통과.
- 신규 모니터링/다운로드 검사와 기존 20차·18차·16차·가치분석 회귀: 최종 실행 결과 및 PR Checks에 기록한다.
- 초기 로컬 검증에서 브라우저 실행 환경과 테스트의 응답 envelope/정지 시계/중복 설정 버튼 선택을 보정했다. 실패한 실행을 성공으로 집계하지 않는다.
- 캡처와 실패 trace는 `Phase20 Input and Loading` CI artifact에 보관한다.

## 운영 APK 읽기 검사

배포 전 2026-10-11: latest.json HTTP 200, 버전 `0.1.2-webonly-test`, 업데이트 `2026-10-10`, 경로 `/downloads/android/roxstock-web-only-0.1.2.apk`.
APK HEAD HTTP 200, Content-Type `application/vnd.android.package-archive`, 길이 61,360 bytes. 메타데이터 SHA-256 `ba6f1199a8268bee63f867079d3e29fbd6aef3e52465507ddb929b1fcc4c00ad`. 파일·메타데이터를 수정하지 않는다. 배포 후 같은 값인지 재검증한다.

## 배포 및 미확인 사항

PR 필수 검사 통과 후 기존 PR 자동 병합·Production Deploy 경로를 이용한다. 완료 보고에 병합 SHA·배포 실행·운영 읽기 검증 결과를 기록한다.

실제 Android 기기/WebView에서 신규 설치·업데이트는 이번 범위에서 재실행하지 않는다. 인위적 지연/실패는 모의 API 검사이며 실제 네트워크 지연의 전 기기 측정은 미실시다. 운영 수집 상태는 읽기만 확인한다.

## 최종 로컬 검사 기록

- 전체 관련 회귀 **136개 통과 (4.3분)**.
- DART 과거/현재 단계, 처리건수, 실시간 진단 카드까지 크기 비교를 확대한 최종 신규 검사 **22개 통과 (40.4초)**.
- 최종 타입 검사·production build 통과. entry gzip 139.73kB, 모니터링 lazy chunk gzip 10.10kB. 응답을 기다리는 초기 번들/API 순서는 유지한다.
- 실제 화면 캡처: [커버 조회 중](assets/phase20-monitor/monitor-cover-loading.png) · [커버 완료](assets/phase20-monitor/monitor-cover-ready.png) · [태블릿 조회 중](assets/phase20-monitor/monitor-tablet-loading.png) · [태블릿 완료](assets/phase20-monitor/monitor-tablet-ready.png).
- 최종 서버 CI와 병합·운영 배포 SHA/실행 결과는 [작업 PR #191](https://github.com/byungho-cho/roxstock/pull/191)의 Checks 및 완료 기록을 기준으로 한다. 운영 배포는 성공 상태와 실제 서비스 읽기 확인 후에만 완료로 보고한다.
