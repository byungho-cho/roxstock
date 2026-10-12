> 이 문서는 PR #207의 초기 구현·검증 기록입니다. 현재 기준은 [24차 최종 문서](phase24-security-editor-20261012.md)이며, 아래 초기 확인 문구·전체 OFF 기능별 설정·개별 gate 복원·재조회 실패 처리 설명은 최신 명세로 대체됩니다.

# 종목관리 편집 v0.6 · 2026-10-12

기준 main: `3d4eeb5a2c4703e32785448130b40cdb326980e9` (23차 기능 PR #205, 검증 보고 PR #206 반영). 열린 PR #204/#197은 명세 문서, #170은 APK, #137은 소통 문서, #128은 운영키 도구로 이번 편집 화면 변경과 중복하지 않는다. 이 PR은 초안 유지하여 저장소의 ready PR 자동 병합을 방지한다. main 직접 push·병합·운영 배포 없음.

## Figma 및 구현

- 커버 전체 콘텐츠: https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3833-227
- 태블릿 전체 콘텐츠: https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3833-1104
- 사용자/Z99: https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3833-64

세 노드의 design context와 스크린샷을 대조했다. REVIEW 높이를 서비스에 고정하지 않는다. 공통 44px 헤더/메뉴와 본문 하나의 스크롤을 유지한다. 커버 1열, 태블릿 2열(정보/설정), 8px 카드 간격·패딩, 36px 정보 입력/삭제·저장 버튼, 제목·출처·코드 권한 설명을 맞춘다. 기존 StockSearchFrame/AppCard/InputBase/ButtonBase/ConfirmActionDialog/Navigation 및 디자인 토큰을 재사용한다. 수집 설정에 상태별로 변하는 아이콘/행별 안내를 제거하고 상태 기반 스위치를 구성한다. 다른 모니터링 화면의 기존 제외 아이콘은 변경하지 않는다.

설정의 제목 스위치와 개별 스위치는 트랙 36×20px, 손잡이 16×16px, 터치 영역 44×24px다. 행 24px, 간격 4px로 클릭 영역이 겹치지 않는다. 키보드 Space/Enter·포커스 표시·접근성 상태 지원. 혼합 상태는 중앙 손잡이/대시/노란 트랙, `aria-checked=mixed` checkbox와 전체 활성화 이름으로 구분한다. 자동 제외/비활성 종목은 OFF disabled. 제목/목록 아래 구분선, 목록 다음의 고정 안내 위치에 일반 설명·자동 제외 사유·오류를 표시한다.

전체 ON→OFF: ‘전체 비활성화 하시겠습니까?’, OFF/혼합→ON: ‘전체 활성화 하시겠습니까?’. 확인 전 상태 불변. 취소 무변경. 개별 OFF는 기존 제외 확인, ON은 기존 즉시 재활성화 정책을 유지한다. 전체 제외에서 개별 ON은 기존 정책대로 전체 gate를 먼저 해제하며 다른 기능별 제외는 보존한다. 종목 수정·삭제·출처·코드 권한·이력 보존 정책은 동일하다.

## API

기존 `PATCH /api/security-management/:id/collection`에 `allFeatures?: boolean`을 추가한다. `feature: ALL, excluded: boolean, confirmed: true, allFeatures: true`를 제목의 전체 스위치가 사용한다. 서버 행 잠금과 한 트랜잭션에서 전체 gate를 변경하고 기능별 제외 배열을 비워 모든 변경 가능 항목에 적용한다. revision은 한 번 증가하며 기존 캐시/지연 요청 보호가 유지된다. 기존 ALL 요청은 기능별 제외를 보존하여 호환된다. allFeatures는 ALL만 허용, 잘못된 타입/조합은 400. Z99 전체 활성화는 기존 서버 정책으로 409. 확인 없는 제외는 400. 수집/대량 재수집을 시작하지 않는다. 마이그레이션 없음.

저장 중 모든 편집 스위치와 확인 중복 실행을 막는다. 응답 성공·실패 모두 관련 목록/상세 캐시를 무효화하고 서버 재조회한다. 낙관적 UI 갱신을 하지 않는다. 응답 실패지만 서버가 이미 저장한 경우도 실제 재조회 값으로 표시한다. 재조회 자체가 실패하면 React Query 기존 자료를 유지하고 오류를 남긴다.

## 검증 상태

로컬 frontend/backend TypeScript 및 build 통과. backend 회귀검사 206/206 통과. 변경 범위 diff check 통과. 로컬 Chromium 설치는 네트워크가 유효한 ZIP 대신 잘못된 파일을 반환하여 중단했고 반복 실행하지 않았다. 격리 MariaDB API 검증과 커버/태블릿 Chromium 검증도 통과했다. 최종 기록은 아래 및 QA 문서에 저장한다.

추가 검증: 기존 실제 DB 통합검사에 원자적 전체 ON/OFF·기능별 제외 초기화·기존 ALL 호환·확인·잘못된 scope·Z99 차단을 추가했다. 전용 Playwright는 전체/개별/혼합/자동 제외·키보드·확인/취소·503 저장 전/후 실패·서버 재조회·새로고침 유지·중복 클릭·단일 스크롤·마지막 항목/안내 접근·실제 스위치/행 치수를 검증한다. 기존 23차 페이지·코드 정정·모니터링·APK 회귀검사도 유지한다. 실제 Android 키보드/WebView/실기기 검증은 미확인. 운영 데이터 및 두 종목의 등록 출처 변경은 이번 범위에 없으며 수정하지 않는다.

## 최종 결과

최종 코드 `50062cc65f3a3be8c1f9a5e4b283cea3a907e704`, PR [#207](https://github.com/byungho-cho/roxstock/pull/207) 초안 유지. [Backend Check 38222082784](https://github.com/byungho-cho/roxstock/actions/runs/38222082784), [화면 검사 38222082689](https://github.com/byungho-cho/roxstock/actions/runs/38222082689) 성공. 신규14건+기존23차14건, backend206건, 격리 MariaDB 통합 및 백업복구 회귀 통과. 화면/치수/오류 분류는 [QA 기록](../qa/security-editor-v06-20261012.md), 실행번호·API 근거·실측 값은 [JSON](evidence/security-editor-v06-20261012.json).

변경 파일: `CollectionSettingsCard.tsx`(전용 상태 스위치/전체 설정/재조회), `SecurityManagementPage.tsx`(편집 정보/버튼/2열), `AppLayout.tsx`·`PageLayout.tsx`(편집 경로만 여백/헤더), `security-management.ts`(원자적 전체 옵션), `security-management.integration.ts`(실제 DB API), `security-v06.spec.ts`·`playwright.security-v06.config.ts` 및 기존 phase23 CI workflow(변경 화면 검사), 이 개발·QA 문서와 6개 캡처/JSON. 기존 23차 모니터링 아이콘과 종목 목록 배치는 유지했다.
