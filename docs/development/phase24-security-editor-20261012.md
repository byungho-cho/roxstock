# 24차 종목관리 편집 · Figma v0.6 최종 명세

기준 main: `09b82d732aff4c1efa9acf08cd027f56fea3ccd9`. 기존 초안 [PR #207](https://github.com/byungho-cho/roxstock/pull/207)의 레이아웃·스위치·보호 정책을 재사용하고 동일 브랜치에 main을 병합했다. 새 대체 PR은 만들지 않는다. 22차 가치분석은 main의 구현을 그대로 유지한다. main 직접 push·자동 병합·운영 배포 및 #137 병합은 하지 않는다. 저장소 자동 병합 workflow가 draft PR을 제외하므로 #207을 초안으로 유지한다.

## 디자인·레이아웃

- [커버 REVIEW](https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3833-227), [태블릿 REVIEW](https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3833-1104), [사용자/Z99 REVIEW](https://www.figma.com/design/HFguP6QYb6xnO9FRsjYlc2?node-id=3833-64)의 design context와 화면을 대조했다.
- REVIEW는 전체 내용 예제다. 서비스는 공통 PageLayout의 상단44px·하단44px 고정, main 본문만 스크롤한다. 커버1열(정보→설정), 태블릿2열, 본문 좌우/상단8px, 카드 간격/패딩/라운드8px.
- 공통 FormTextField small 사용: 입력36px, 라벨11px, 값13px. 이름은 최소36px이며 긴 값은 줄바꿈하고 자동 높이 확장한다. 나머지 화면의 폼 기본값은 유지한다. 등록 출처는 정보 제목 우측.
- 삭제/정보 저장36px, 동일 너비, 간격8px. 사용 중 삭제는 비활성. 코드 권한·삭제 안내는 왼쪽 버튼 아래 한곳에 모으고 설정 안내는 오른쪽 마지막 구분선 아래 둔다. 안내11px/줄높이16px·공통 보조색·자연스러운 줄바꿈. **Figma 예제의 코드 바로 아래 설명 위치보다 이번 지시의 ‘각 영역 가장 아래’ 기준을 우선한다.**
- 트랙36×20px, 손잡이16px, 행24px/간격4px. 클릭 영역44×24px이며 서로 겹치지 않는다. 키보드/포커스·혼합 상태 aria-checked=mixed 유지. 제목 아래/하단 안내 위 구분선.

## 확인·API·저장

수집 설정은 종목 정보 저장과 별도로 즉시 저장한다. 개별 OFF는 ‘수집에서 제외하시겠습니까?’ 확인. 제목 스위치 ON→OFF는 ‘전체 수집을 비활성화하시겠습니까?’, OFF/혼합→ON은 ‘전체 수집을 활성화하시겠습니까?’. 혼합 상태 확인창은 현재 일부만 활성임과 전체 제외 해제·모든 항목 활성화를 명시한다. 취소는 요청/변경 없음.

`PATCH /api/security-management/:id/collection`:

| 요청 | 저장 범위 |
|---|---|
| 기존 `feature: ALL, excluded` (allFeatures 없음) | 전체 gate만 변경, 기존 기능별 설정 보존 |
| 편집 제목 `feature: ALL, excluded, allFeatures: true, confirmed: true` | ON: gate=false·기능별 제외=[] / OFF: gate=true·모든 7개 기능 제외. 한 트랜잭션, revision 한 번 증가 |
| 편집 개별 ON `feature: 개별, excluded: false, restoreGlobal: true` | 전체 제외 뒤에서 켠 항목만 활성화. gate 해제·다른 항목의 유효 OFF 상태 유지. 한 트랜잭션 |
| 기존 개별 요청 (restoreGlobal 없음) | 기존 기능별 설정 변경 동작 유지 |

ALL을 개별 기능처럼 표시하는 기존 ‘전체 외부 수집’ 행과 제목의 ‘모든 항목 적용’은 별도 동작이다. 기존 ALL 호출에 allFeatures를 자동으로 붙이지 않는다. allFeatures는 ALL에만, restoreGlobal은 개별 활성화에만 허용한다. 잘못된 타입/조합400, 확인 없는 제외400, Z99 활성화409. SELECT FOR UPDATE·Serializable·기존 재시도/수집 revision fencing 유지. 기존 진행 중 작업의 정책 반영 경로도 유지하며 재활성화가 신규 대량 재수집을 시작하지 않는다.

PATCH 성공/실패/응답 유실 후 상세 GET을 직접 수행하여 실제 상태로 동기화한다. 서버 확인이 실패하면 이전 표시를 최신으로 확정하지 않고 스위치/확인을 잠근다. 오류와 ‘서버 상태 다시 조회’를 제공하고, GET 성공 후 실제 상태로 복구한다. 저장 중 ref 잠금으로 중복 요청을 막는다. 관련 목록·모니터링·종목 캐시 갱신 유지.

## 보호·데이터 범위

Z99 자동 제외는 스위치로 해제 불가. DART/UNKNOWN 코드 읽기 전용, MANUAL만 확인 후 정정. 6자리 영문/숫자·대문자 정규화·중복 차단·사용 중 삭제 제한·내부 ID/계좌 연결/수집 자료/이력 보존 유지. 운영 등록 출처나 종목 자료를 변경하지 않는다. **이번 작업의 신규 운영 마이그레이션 없음.**

로컬 실제 DB 검사 전용 준비 파일 `backend/tests/prepare-phase24.ts`는 loopback의 `_phase24_test` DB만 허용하고 비어 있는 테스트 DB에 기존 마이그레이션을 적용한다. DEV/PROD DB로 실행하지 않는다. 로컬 검증 DB는 `roxstock_phase24_test`; 수집기를 연결하지 않았다. API 검사는 `backend/tests/security-management.integration.ts`, 화면 검사는 `frontend/tests/targets/security-v06.spec.ts`를 사용한다. CI 기존 Backend Check와 Phase23 UI workflow가 이 검사를 실행한다.

## 검증·제출

프론트/백엔드 타입·빌드, 백엔드 회귀212건, 실제 격리 MariaDB API 통합, 커버/태블릿 화면20건 통과. 실제 DB는 전체/개별 저장·중간 실패 rollback·동시 전체 변경/조회·기존 API 호환·자료/연결 보호를 확인했다. 브라우저는 통제한 API 응답으로 실패/유실/재조회 실패/취소/중복 클릭/새로고침/줄바꿈을 확인했다. 두 검증을 운영 데이터 검증으로 혼동하지 않는다.

최종 캡처·실측·CI 결과와 미검증 범위는 [24차 QA](../qa/phase24-security-editor-20261012.md). Android/WebView/실기기 터치·키보드는 미검증. 병합/운영 배포는 별도 지시 대상.
