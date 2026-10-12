# 종목관리 편집 v0.6 검증 · 2026-10-12

PR: https://github.com/byungho-cho/roxstock/pull/207

## 대상 및 환경

기준 main `3d4eeb5a2c4703e32785448130b40cdb326980e9`, 별도 `codex/security-editor-v06-20261012` 브랜치. Figma `3833:227`(커버), `3833:1104`(태블릿), `3833:64`(사용자 등록/자동 제외)의 design context·스크린샷으로 대조했다. 개발 설명 및 API 옵션은 [개발 문서](../development/security-editor-v06-20261012.md)에 기록한다.

CI Ubuntu/Node20/Chromium, production preview + 통제된 API 응답으로 화면 동작을 검증한다. 실제 DB API는 격리된 MariaDB와 Fastify inject로 검증하며 화면 fixture와 구분한다. 운영 DB는 변경하지 않는다. 커버 370×465, 태블릿 725×396 CSS px. Android 실기기/WebView/키보드는 미확인.

## 검증 항목

| 범위 | 확인 내용 |
|---|---|
| Figma/레이아웃 | 커버1열·태블릿2열, 8px 간격, 제목 좌측36px, 정보 버튼36px, 저장 버튼 공통 파란색/흰 글자 |
| 스위치 실측 | 트랙36×20px, 손잡이16×16px, 클릭영역44×24px, 행24px·간격4px, 우측 끝선 일치 |
| 전체 ON/OFF | 정확한 확인 문구, 취소 시 요청0건, 확인 시 한 번의 allFeatures API 호출, 재조회·새로고침 유지 |
| 혼합 | 중앙 손잡이·대시·노란 트랙, 접근성 mixed, 키보드 Space, 전체 활성화 한 번으로 기능별 제외 초기화 |
| 개별 | OFF 제외 확인·취소, ON 즉시 재활성화, 기존 전체 gate 정책 보존 |
| 자동 제외 | Z99 전체/개별 OFF disabled, 코드 수정 권한 유지, 사유 최하단, 활성 요청0건 |
| 오류/중복 | 저장 전503는 원래 상태, 서버 저장 후503는 재조회한 실제 상태, 확인창 내 오류 안내, 지연 응답 중 전체/개별 잠금·연속 확인 한 요청 |
| 스크롤 | main 본문만 세로 스크롤, 헤더/하단 메뉴44px 고정, 마지막 종목 마스터와 안내까지 접근, 가로 넘침 없음 |
| 기존 기능 | 사용자 코드 정정 경고·정규화, DART/출처미확인 제한, 사용 중 삭제 제한, 모니터링 결과 이동·50건 조회·검색·APK 유지 |
| 실제 DB | allFeatures 전체 활성/비활성 원자 저장·revision1회 증가, 기존 ALL 기능별 설정 보존, 확인 없는 제외400·기능 범위 오류400·Z99409, 기존 사용 종목/이력/지연 요청 보호 |

관련 frontend/backend 타입·빌드와 backend206건 회귀검사 통과. 최종 CI 실행번호·코드 커밋·화면·실측 JSON은 아래 최종 기록 및 [기계 판독 근거](../development/evidence/security-editor-v06-20261012.json)에 저장한다.

## 문제 분류와 해결

- 환경: 로컬 Chromium 다운로드가 유효한 ZIP이 아니어서 중단. 같은 설치를 반복하지 않고 CI Chromium에서 검증.
- 검사 코드: 모달이 배경을 aria-hidden 처리하는데 기본 role selector를 사용했고 숨김 조회 옵션을 hidden으로 잘못 지정했다. 로그로 구분 후 Playwright includeHidden으로 수정. 접근성 동작을 제거하지 않았다.
- 제품: 확인창 내 저장 오류 안내를 추가하여 뒤의 카드까지 닫아야 오류를 확인하는 불편을 해결했다.
- 시각: 태블릿 Toolbar 기본 여백, 테마 저장 버튼 색상, 버튼 최소 높이가 Figma와 다른 부분을 최종 화면 대조 후 수정했다.

## 남은 확인

실제 Android/WebView/키보드와 손가락 터치 감각은 미확인이다. 운영 배포 검증은 이 작업의 제출 범위에 포함하지 않는다. 요청대로 PR 초안 유지·자동 병합 없음, main 직접 push 없음. #137 및 다른 열린 PR도 변경/병합하지 않았다. 마이그레이션과 운영 데이터 변경이 없다.

## 최종 CI와 캡처

코드 커밋 `50062cc65f3a3be8c1f9a5e4b283cea3a907e704`. 화면 CI [38222082689](https://github.com/byungho-cho/roxstock/actions/runs/38222082689)는 기존23차14건(14.6초)·새 v0.6 14건(13.9초) 모두 통과. 이 시간은 검사 실행시간이며 화면 로딩 성능 수치가 아니다. 실제 DB/타입/빌드/206건 회귀 [38222082784](https://github.com/byungho-cho/roxstock/actions/runs/38222082784) 성공. API whole option assertions는 `backend/tests/security-management.integration.ts`에 포함된다. 검사 fixture는 운영 데이터처럼 표시하지 않았고 앱 production API 모드는 유지한다.

실측: 두 화면 모두 행24px, 간격4px, 트랙36×20px, 손잡이16px, 클릭영역44×24px, 삭제/저장36px, 제목 좌측36px. 스위치 우측 끝선은 커버353px, 태블릿708px로 항목마다 동일하다. 마지막 항목·안내 접근 시 본문 스크롤은 커버337px, 태블릿120px. 카드 내부 세로 스크롤0개, 가로 넘침 없음. 헤더/하단44px 고정. 마지막으로 캡처를 눈으로 대조했다.

| 뷰포트 | 상단 정보·설정 | 마지막 항목·안내 | 사용자/Z99 자동 제외 |
|---|---|---|---|
| 커버 | [화면](assets/security-editor-v06/cover-editor-top.png) | [화면](assets/security-editor-v06/cover-editor-settings.png) | [화면](assets/security-editor-v06/cover-automatic-exclusion.png) |
| 태블릿 | [화면](assets/security-editor-v06/tablet-editor-top.png) | [화면](assets/security-editor-v06/tablet-editor-settings.png) | [화면](assets/security-editor-v06/tablet-automatic-exclusion.png) |

6개 실제 캡처와 실측 JSON을 저장한다. 캡처 데이터는 DART/사용자 등록 상태를 통제한 테스트 데이터이며 출처를 변경한 운영 자료가 아니다. PR의 자동 병합 방지를 위해 ready for review로 전환하지 않는다. 이 문서/근거 추가는 검증한 코드 내용에 변경을 주지 않는다.
