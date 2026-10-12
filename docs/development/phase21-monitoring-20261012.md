# 21차 수집 모니터링 요약·상세 개선

기준 main: 031c0bd (PR #194 포함). 작업 브랜치: codex/monitoring-phase21-20261012. 진행 중 PR #195는 DART 일회 운영 검증으로 모니터링 UI/API와 범위가 다르다. PR #137은 병합하지 않는다. 이전 21차의 콘텐츠 높이 2.5배 확대는 이번 지시로 취소한다. 기존 재무제표 검색/추정 자료 표시와 DART 접수번호 개선은 유지한다.

## 구현 계약

- 공통 tokens의 textPrimary/positive/error로 대상·성공·실패의 제목과 수치를 통일한다. 건너뜀은 기존 숫자 색상 유지. PARTIAL 실행의 상태·결과 요약·오류 문구는 공통 warning 노란색이다. 다른 상태 판정/수집기/일정은 변경하지 않는다.
- 기능별 모니터링은 각각 최근 실행 3건과 대상 3건을 독립 조회한다. 필터/전체 기록은 실행 이력 상세로 이동한다. 영역은 콘텐츠 높이를 사용하고 빈 고정 높이를 남기지 않는다.
- 상세 URL: /detail/collection-monitoring/:feature/runs 및 /items. 최초/추가 페이지는 각 50건. 대상 조회는 run.jobType 관계로 해당 기능 전체 대상 기록을 조회하며 최근 실행 50건의 ID에 종속되지 않는다. 동일 종목의 다른 연도/보고서는 별도 ID로 유지한다.
- API: GET /api/collection/monitoring/:feature/runs 및 /items, limit=3(요약) 또는 50(상세), cursor, result/phase/symbol/market/accountId/from/to. 응답 rows/hasNext/nextCursor. 서버는 1건 lookahead를 포함해 최대51건만 읽는다. 전체 기록을 받은 뒤 클라이언트에서 자르지 않는다.
- 커서는 기능·목록 종류·필터·페이지 크기의 해시, 마지막 시각/BigInt ID, 최초 조회의 최대 ID를 담는다. 최신 시각 내림차순+ID 내림차순, 엄격한 이전 경계를 사용한다. 새 기록/과거 시각으로 삽입된 새 ID는 기존 페이지 스트림에 섞이지 않는다. 다른 필터/기능 커서는400. 실행 결과 자체가 조회 중 바뀌는 RUNNING→완료 상태까지 과거 시점에 고정하는 DB 스냅샷은 아니다.
- 일자 필터는 실행 startedAt, 대상 createdAt을 사용한다. 기존 날짜 입력의 UTC 일자 경계를 유지한다. 연도·보고기간은 저장 작업 식별자에서 읽으며 누락 메타는 임의로 만들지 않는다. 대상 상태 enum과 실행 상태 enum을 구분해 검증한다.
- 기존 상세 통계 API에 overview=1을 추가하여 신규 화면은 통계 조회에서 실행/대상 목록을 중복 조회하지 않는다. 기존 호출자의 기본 응답은 유지한다.
- 커버/태블릿 모두 공통 main 본문 하나만 세로 스크롤한다. 태블릿은 좌우 배치를 유지하지만 별도 패널 스크롤을 제거한다. 리스트/진행률/진단 영역 내부 스크롤도 제거한다. 헤더44px/하단44px 고정. 긴 문구는 줄바꿈하고 본문 아래로 이어진다.
- useInfiniteQuery의 기능·필터·종류별 캐시와 AbortSignal로 지연 응답을 격리한다. 추가 조회는 동기 ref 잠금+disabled로 중복을 막는다. 실패해도 기존 페이지를 유지하고 같은 커서를 재시도한다. 목록 캐시는30분, 상세는 자동 주기 재조회하지 않는다. 통계/요약3건은 기존60초 갱신을 유지한다.
- 상세 필터는 URL에 저장한다. 동일 조건 재조회는 기존 화면을 유지한다. 상세 뒤로가기는 원래 기능의 이력 엔트리로 돌아가며 공통 스크롤 복원과 캐시로 요약 위치/조회한 상세 페이지를 복원한다. 직접 상세 진입의 뒤로가기는 해당 기능으로 이동한다.
- 초기 데이터는 고정 제목/컨트롤을 즉시 표시하고 값만200ms 지연 로딩한다. 초기 미확정은 빈 목록/0건으로 표시하지 않는다. 추가 로딩에는 기존 목록을 교체하지 않는다. 조회 실패는 수집 상태 오류와 별도 문구다.

## 변경 파일

backend/src/routes/collection-pages.ts (독립 조회), collection-status.ts (등록/통계 전용 선택), collection-pages.test.ts, backend/tests/monitoring-pages.integration.ts. frontend/src/pages/more/CollectionMonitoringPage.tsx, App.tsx, layouts/AppLayout.tsx/PageLayout.tsx. 기존 phase20/utility/monitor-financial 회귀의 취소된 높이/이중 스크롤 계약을 새 명세로 갱신하고 phase21-monitor.spec.ts 추가. Backend Check에 실제 MariaDB API 검증 포함.

## 검증 계획·현황

- 로컬: 프런트/백엔드 TypeScript 및 빌드, 커서/조건/정렬/제한 API 단위 검사. 새 테스트의 optional 배열 타입 오류는 수정 후 검사 통과했다.
- 실제 MariaDB: 격리된 CI DB에서 0/49/50/51/105 실행과 대상 기록을 생성한다. API inject로 각50건·hasNext·이후 커서·같은 시각 ID 보조정렬·중복/누락·새 기록 삽입·필터 불일치 거절·최근 실행 종속 없는 대상 관계를 검사하고 검증용 기록만 정리한다. 운영 원본은 수정하지 않는다.
- Chromium: 커버370×465/태블릿725×396, 요약0/1/3, 상세 각0/49/50/51/105, 색상 일치/노란 PARTIAL, 내부 스크롤 없음, URL 요청 limit/cursor 증거, 연속 클릭/추가 실패/재시도/필터/복귀/느린 최초 로딩/지연 응답 격리.
- 동일 fixture를 기준 main(240px/300px 고정)과 변경 화면에 적용해 DOM 높이 JSON 및 전후 PNG를 보관한다. 실제 표시건수에 맞는 가변 높이이며2.5배 비교는 더 이상 유효하지 않다.
- 로컬 Chromium 설치 환경 문제가 기존에 확인되어 반복하지 않고 CI Chromium으로 확인한다. 실제 Android/WebView 기기 검증은 이 환경에서 수행할 수 없으며 별도 미확인으로 기록한다.
- 병합/배포 SHA, 워크플로 결과, 운영 API 근거는 아래 최종 기록과 PR에 반영했다. 검증 통과 후 PR로 병합했다.

## 최초 CI 원인 분류

Backend Check의 실제 MariaDB 페이지 검증 통과. 신규 UI 최초 검사는 개발 StrictMode의 취소된 최초 요청을 완료 요청으로 세는 검사 오류와 본문/하단 메뉴의 동명 더보기 버튼 선택 오류가 있었다. 배포용 production preview로 검사하고 본문 버튼으로 범위를 한정한다. 기존 phase20 회귀132개 통과/4개 실패는 독립 조회로 나뉜 재시도 버튼 중 다른 영역을 누른 검사 선택 오류였으며 해당 기능의 통계 재시도로 명시한다. 필터 변경 시 과거 조건의 여러 페이지 캐시를 재사용하지 않고 첫50건을 재조회하도록 제품 동작도 보완한다. 원인 없는 재실행은 하지 않는다.

## 최종 검사·병합

최종 검증 head1935834d318696734e0ed9c5b1fc62155762a004. 최신 main0f66031(#196 포함)과 충돌 없이 동기화했다. 모든 선택 검사16개 성공/요청 화면 전용6개 정상 skip, PR Gate 통과: https://github.com/byungho-cho/roxstock/actions/runs/38188441535 . 기존 입력/로딩 회귀136개 통과: https://github.com/byungho-cho/roxstock/actions/runs/38188441261 . 취소된 요청/동명 버튼/기록 저장/재시도 순서의 검사 코드 오류를 수정해 완료했다.

- 실제 MariaDB/API: https://github.com/byungho-cho/roxstock/actions/runs/38188441245 . [20회 페이지 조회 원본](evidence/phase21-api-ci-20261012.json).
- production Chromium38개: https://github.com/byungho-cho/roxstock/actions/runs/38188441218 . [28개 뷰포트별 JSON](evidence/phase21-ui-ci-20261012.json). [전후 PNG·QA](../qa/phase21-monitoring-20261012.md).
- PR198 병합 완료: https://github.com/byungho-cho/roxstock/pull/198 . main 애플리케이션 커밋4b9dc682972cab70cedc56ab7005eda151bcf136. main 직접 push/PR137 병합 없음. 별도 문서 초안PR197은 병합하지 않았다.
- Production Deploy: https://github.com/byungho-cho/roxstock/actions/runs/38189052305 . 배포 결과 및 운영 API 확인은 완료 후 아래에 기록한다.

## 배포 중 확인한 운영 보호 규칙 오류

PR198의 최초 Production Deploy38189052305는 성공으로 종료됐으나 서버 단계의 `Superseded deployment skipped` 때문에 실제 기능 적용은 생략됐다. 그 사이 문서 PR200이 main을30d2181로 변경했고, 새 API는 실제404였다. 문서 PR은 앱 배포를 시작하지 않으므로 기능 배포가 누락되는 경우였다. 성공 상태만으로 완료 처리하지 않았다.

별도 PR202로 서버 보호 규칙을 보완했다. 최신 main이 요청 SHA와 같거나 요청 SHA의 후손이며 차이가 docs/**/루트README.md뿐인 경우만 같은 런타임 코드의 배포를 허용한다. 앱/설정 변경, 원본 코드의 docs 이동, 무관한 이력은 차단한다. 임시 실제 Git 저장소로 검증한 보호 규칙과 기존 자동화31개 및 PR Gate 통과: https://github.com/byungho-cho/roxstock/actions/runs/38189652741 . PR202 병합mainf4bd59abdb8a43d5d9239a06b8c8be2b35872962. 이 SHA의 새 Production Deploy38189809433으로 실제 적용/조회까지 확인한다. 수집기·DB 원본·비밀번호 변경 없음.

## 운영 API 실제 확인

2026-10-12T01:03:31Z, f4bd59a 백엔드 실제 적용 후 GET8회 확인. DART 실행/대상 요약 각각3건, 상세 각각50→50건이며 두 페이지 중복0/페이지 간 시각+ID 내림차순 통과. 종목 마스터 실행/대상은22건/hasNext=false로 마지막 페이지를 확인했다. [운영 API 근거](evidence/phase21-api-live-20261012.json). 서버 원본 조회만 수행했으며 실제 데이터 본문/계좌 정보는 증거 파일에 복사하지 않았다. 응답시간5–9초는 이 실행환경 외부 요청의 네트워크 포함 측정이며 서버 처리시간으로 해석하지 않는다.

## 최종 운영 배포 완료

- 적용 버전 f4bd59abdb8a43d5d9239a06b8c8be2b35872962 (#202 포함). 자동 배포38189809433 success: https://github.com/byungho-cho/roxstock/actions/runs/38189809433 . 백엔드/프런트 이미지 모두 Docker Hub에 푸시하고 서버에 적용됐다. 실제 컨테이너 태그 sha-f4bd59abdb8a43d5d9239a06b8c8be2b35872962 및 healthy를 로그에서 확인했다. 기존 수집기3개도 같은 이미지로 healthy. 서버의 최신 .env.production을600권한으로 복사하는 기존 방식 유지/DB 인증 정상/비밀번호 재설정 없음.
- 실제 새 API GET8회와 페이지 간 중복0/최신순/마지막 페이지 확인 완료. 프런트도 index-CkqcpB7r.js→CollectionMonitoringPage-Bx-XbKCT.js에서 새 페이지 캐시 키/nextCursor 코드를 확인했다. [프런트 실제 배포 근거](evidence/phase21-frontend-live-20261012.json).
- 초기4b9dc68 이미지는 생성·푸시됐지만 문서 커밋 때문에 서버 적용이 생략됐다. 해당 워크플로의 success를 실제 적용 완료로 보고하지 않았다. 최종 실제 배포는f4bd59a이다.
- [21차 전후 화면·전체 검증 보고](../qa/phase21-monitoring-20261012.md). 검증 기록 문서만 후속 PR로 저장하며 앱의 추가 재배포는 필요하지 않다.
- 미확인: 실제 Android/WebView 하드웨어. 커서의 상태값은 과거 시점의 DB 스냅샷이 아니며, 진행 중 실행의 완료 상태 변경은 이후 조회에 반영한다. 수집 오류 원인 분석/대량 재수집/원본 수정은 이번 범위에 포함하지 않았다.
