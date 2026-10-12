# 24차 종목관리 편집 QA · 2026-10-12

[PR #207](https://github.com/byungho-cho/roxstock/pull/207) 재사용·초안 유지. 기준 main `09b82d732aff4c1efa9acf08cd027f56fea3ccd9`. [최종 개발 명세](../development/phase24-security-editor-20261012.md)와 3개 Figma REVIEW를 대조한다. 아래 캡처는 통제된 테스트 데이터이며 운영 종목의 출처를 변경한 화면이 아니다.

## 환경·결과

| 검사 | 결과/환경 |
|---|---|
| 프론트/백엔드 TypeScript·build | 로컬 통과 |
| 백엔드 기존 회귀 | 212/212 통과 |
| 24차 브라우저 | Chrome, production API-mode preview, 커버370×465·태블릿725×396, 20/20 통과 |
| 실제 DB | 로컬 MariaDB / 독립 `roxstock_phase24_test`, 기존 21개 migration 적용 후 Fastify API 통합 통과. 운영/일상 DEV DB 쓰기 없음 |
| PR CI | 검증 코드 `7ab7724`의 Frontend Check·Backend Check·Phase23 UI 통과. 기록은 아래 |

## 요구별 확인

- 정보/수집1열·2열, 8px 여백·카드 간격, 정보 이름 기본36px·라벨11px·값13px, 긴 종목명 자동 줄바꿈/높이 확장, 가로 넘침 없음.
- 삭제/저장36px, 동일 너비/8px 간격. 코드/삭제 안내가 버튼 아래, 설정 안내가 마지막 구분선 아래. 출처 우측, DART 코드 비활성·사용 중 삭제 비활성, 사용자/Z99 코드 정정 권한 유지.
- 스위치 트랙36×20px·손잡이16px·행24px/간격4px·클릭44×24px, 우측 끝선 동일. 헤더/하단44px, 카드 내부 세로 스크롤0개, main 단일 스크롤로 마지막 항목/안내 접근.
- 전체 ON/OFF 확인·취소 요청0건·새로고침 유지; 혼합 상태/키보드 Space·전체 활성 안내; 개별 OFF 확인/취소·ON 즉시 저장; 전체 제외 뒤 개별 활성은 해당 기능만 ON.
- Z99 전체/개별 OFF disabled·하단 자동 제외 사유, 활성화 요청0건.
- 저장 전503(미저장)·저장 후503(이미 저장)·PATCH 네트워크 응답 유실 후 실제 GET 상태 표시. GET까지 실패하면 잠금·오류·재조회. 재조회 성공 시 실제 OFF 복구, 중복 PATCH 없음. 저장 지연 중 연속 클릭은 한 요청.
- 실제 MariaDB: master ON/OFF 전체 gate+7개 기능 설정·revision1회, opt-in 개별 복원, 기존 ALL 기능별 설정 보존, 잘못된 범위/확인 거부, Z99 차단. 보안 종목 update 이후 후속 작업에 오류를 주입한 **실제 DB 트랜잭션**이 상태/revision을 rollback함을 확인. 전체 변경2개와 별도 DB 조회12회를 동시 실행하여 중간 부분 저장 없음.
- 기존 코드 정정/정규화/중복, DART/UNKNOWN 권한 제한, 보유·관심 연결 삭제 제한, 과거 수집 자료·코드 이력·지연 응답 fencing 회귀 유지.

초기 과도한 전체 변경6개 동시 스트레스에서는 기존 제한된 재시도 횟수를 초과한 MariaDB 충돌 응답500을 관측했다. 부분 저장은 없으며 이번 수정에서 공유 재시도 정책을 확대하지 않았다. UI는 중복 요청을 차단하고 실패 후 실제 상태 재조회로 복구한다. 일반 동시 변경2개/조회 검증은 통과했다.

## 화면·Figma 대조

Figma REVIEW의 전체 콘텐츠 높이를 서비스 높이에 적용하지 않았다. 제목/푸터44px와 본문 스크롤을 유지한다. 코드 아래/버튼 앞에 흩어진 안내는 사용자 최종 지시에 따라 왼쪽 영역 최하단으로 이동한 의도적 차이다. 검색 아이콘은 기존 동일17×16 SVG, 폼·버튼·확인창·토큰은 공통 컴포넌트 재사용.

| 화면 | 상단 | 설정 하단 | 사용자/Z99 | 혼합 | 긴 이름 |
|---|---|---|---|---|---|
| 커버 | [캡처](assets/phase24/cover-editor-top.png) | [캡처](assets/phase24/cover-editor-settings.png) | [캡처](assets/phase24/cover-automatic-exclusion.png) | [캡처](assets/phase24/cover-mixed-state.png) | [캡처](assets/phase24/cover-long-name.png) |
| 태블릿 | [캡처](assets/phase24/tablet-editor-top.png) | [캡처](assets/phase24/tablet-editor-settings.png) | [캡처](assets/phase24/tablet-automatic-exclusion.png) | [캡처](assets/phase24/tablet-mixed-state.png) | [캡처](assets/phase24/tablet-long-name.png) |

실측/API 안전 요약: [JSON](../development/evidence/phase24-security-editor-20261012.json).

## 미검증·제출 범위

실제 Android/WebView·실기기 터치/키보드는 미검증. 운영 변경/수집/마이그레이션/배포 검증은 수행하지 않았다. PR 초안 유지, 자동 병합 비활성, main/#137 변경 없음. 병합/운영 배포는 별도 지시 후 진행한다.


## 최종 CI 실행 기록

검증한 코드: `7ab77246fe6e64b6439bd911b474dfbd25d1ce4e`. 이 기록을 추가하는 후속 커밋은 문서/근거만 변경한다.

- [Frontend Check 38247697647](https://github.com/byungho-cho/roxstock/actions/runs/38247697647): 통과.
- [Backend Check 38247697750](https://github.com/byungho-cho/roxstock/actions/runs/38247697750): 타입·빌드·212건 회귀, CI 격리 MariaDB API·원자성·rollback·호환성·자료 보존 통과. 서버·DB 오류 주입 경로도 안전한 API 오류로 응답하고 실제 저장 상태를 rollback했다.
- [종목관리 UI 38247698194](https://github.com/byungho-cho/roxstock/actions/runs/38247698194): 기존23차14건 + 24차20건 = 34건 통과, CI Chromium. 캡처는 로컬 Chrome 실행에서 보존했다.
- 로컬 backend `/health`와 종목관리 GET 모두200. 쓰기 검증은 위 격리 DB만 사용했다.

CI 관련 JSON은 실측 근거 파일에 기록한다. PR 전체 gate와 타 화면 workflow의 상태는 PR Checks에서 확인하며 이 결과를 자동 병합 승인으로 사용하지 않는다.
