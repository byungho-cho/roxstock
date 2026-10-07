# PR 자동 병합 및 운영 자동 배포

2026-10-07 사용자 승인으로 2026-10-06 배포 보류 지침을 해제한다.

## 병합 조건

main의 필수 검사는 경로 필터 없는 PR Validation의 `PR Gate`다.
변경 범위에 따라 프론트 타입·빌드와 백엔드 MariaDB 통합 검사를 실행한다.
워크플로 문법과 배포 셸을 검사하고, 같은 PR 커밋의 다른 실행도 완료되어야 통과한다.
실패·취소·실행 중 검사, 충돌, 최신 main 미반영 시 병합하지 않는다.
초안과 외부 포크는 자동 병합에서 제외한다.
PR Auto Merge는 PR별 자동 병합을 활성화하며 PR 코드를 실행하거나 체크아웃하지 않는다.
이미 모든 조건을 통과한 clean PR은 GitHub가 자동 병합 예약을 거부하므로 동일 보호 규칙과 예상 head SHA를 적용해 즉시 병합한다.
main 보호: PR 필수, PR Gate 필수, 최신 브랜치 필수, 관리자 우회 금지, force push/삭제 금지.

## 배포 연결

Production Deploy는 main push 또는 수동 실행으로 동작한다.
GITHUB_TOKEN 자동 병합 후에는 PR Auto Merge가 workflow_dispatch를 명시 호출한다.
입력 target_sha는 전체 40자리 SHA이며, 현재 main과 다르면 오래된 작업을 건너뛴다.
백엔드 → DB 연결·수집기 확인 → 프론트 순서로 기존 워크플로를 호출한다.
기존 프론트·백엔드 수동 실행도 유지한다. 같은 SHA의 백엔드가 없으면 프론트 단독 배포는 실패하며 Production Deploy를 사용한다.

이미지 태그는 sha-전체SHA다. 소스·이미지·배포 스크립트는 같은 SHA를 사용한다.
GitHub 운영 동시 실행 그룹과 서버 공통 production.lock으로 배포를 직렬화한다.
각 서버 배포 단계는 잠금 획득 후 최신 main을 다시 확인한다.
운영 worktree는 커밋별로 분리하며 원본 운영 환경변수만 복사한다.
내부 테스트 DB와 개발 env는 업로드하지 않는다. 운영 데이터 복원은 실행하지 않는다.
Prisma migrate deploy/status는 기존 운영 절차로 수행한다.

## 필요한 권한과 비밀

PR Auto Merge: contents/write, pull-requests/write, actions/write.
다른 검사는 읽기 권한을 사용한다. 저장소 자동 병합을 허용한다. 기본 토큰 권한은 읽기를 유지하고 자동 병합 워크플로에만 쓰기 권한을 지정한다.
기존 DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, DEPLOY_HOST, DEPLOY_USER,
DEPLOY_PORT(선택), DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS를 재사용한다.
운영 backend/.env.production의 COLLECTOR_INTERNAL_TOKEN이 없으면 배포를 중단한다.
시크릿 값이나 운영 env를 로그에 출력하지 않는다.

## 실패와 재시도

필수 검사 실패는 해당 PR에서 수정한 뒤 재실행한다.
배포 실패 시 Production Deploy의 backend/frontend 작업 로그와 상태를 확인한다.
main 최신 SHA로 Production Deploy를 재실행한다.
기존 백엔드 배포 스크립트는 API 실패 시 이전 정상 이미지로 복구를 시도한다.
스키마를 자동으로 역마이그레이션하지 않는다. 프론트 복구는 검증된 SHA의 기존 수동 절차를 따른다.
서버 공통 lock을 유지하며 수동 복구한다.
