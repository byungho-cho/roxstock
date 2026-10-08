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

2026-10-08부터 Production Deploy의 main push 트리거를 제거한다. 자동 배포 요청은 PR Auto Merge의 workflow_dispatch 한 경로로 통일한다. 사람이 병합한 PR은 closed 이벤트, GITHUB_TOKEN 자동 병합은 기존 검사 완료 이벤트에서 같은 경로를 사용한다. 닫혔지만 병합되지 않은 PR·초안·외부 포크는 배포하지 않는다.

이름 변경 전 경로를 포함한 PR 파일 전체를 페이지별로 조회해 frontend/backend/database/infra, 루트 package·lock/compose/.dockerignore, 배포 셸, production-deploy/backend-deploy/frontend-image 워크플로 변경만 자동 배포한다. 앱/infra 내부 README 등 Markdown 문서·docs 이미지 캡처·일반 테스트·검사/자동 병합 워크플로만 바뀐 경우 PR 검사는 유지하고 이미지 빌드·서버 재생성은 실행하지 않는다. 프론트 변경도 현재 서버의 동일 SHA 요구를 유지하기 위해 백엔드→프론트의 검증된 묶음 배포를 사용한다.

자동 배포 요청 단계는 전역 직렬화하고, 현재 main SHA와 해당 SHA의 Production Deploy 실행 이력을 확인한다. queued/pending/in_progress 또는 이미 성공한 실행이 있으면 재요청하지 않는다. 실패·취소만 있으면 자동 단계 재실행으로 다시 요청할 수 있다. 필요 시 운영자의 명시적 workflow_dispatch 재배포는 유지한다. 이 명시 실행은 문서 변경 여부와 관계없이 요청한 최신 SHA를 배포한다.
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
운영 원본 env에 COLLECTOR_INTERNAL_TOKEN이 없으면 기존 실행 컨테이너의 토큰을 배포 worktree에 이어받는다. 새 토큰을 생성하거나 원본 env를 변경하지 않는다. 기존 토큰도 없으면 중단한다.
시크릿 값이나 운영 env를 로그에 출력하지 않는다.

## 실패와 재시도

필수 검사 실패는 해당 PR에서 수정한 뒤 재실행한다.
배포 실패 시 Production Deploy의 backend/frontend 작업 로그와 상태를 확인한다.
main 최신 SHA로 Production Deploy를 재실행한다.
기존 백엔드 배포 스크립트는 API 실패 시 이전 정상 이미지로 복구를 시도한다.
스키마를 자동으로 역마이그레이션하지 않는다. 프론트 복구는 검증된 SHA의 기존 수동 절차를 따른다.
서버 공통 lock을 유지하며 수동 복구한다.


## 운영 배포 보존·복구 및 최신 증거 (2026-10-08)

- 마이그레이션 전 서버 로컬 DB 백업과 체크섬·압축 무결성을 확인한다. 백업 실패 시 마이그레이션을 진행하지 않는다. 백업 디렉터리/파일 권한은 제한한다.
- 프론트는 운영 canonical compose를 사용해 Caddy HTTPS·네트워크 구성을 보존하고 목표 이미지 SHA를 대조한다.
- 배포 대상 저장소의 오래된 SHA 이미지 중 레지스트리에서 복구 가능한 것만 정리한다. 기존 컨테이너 참조 이미지, 최근 이미지 및 목표 이미지를 보존하며 볼륨·백업을 삭제하지 않는다.
- #120 배포 복구 및 #122 자동 병합 이후 [37695383061](https://github.com/byungho-cho/roxstock/actions/runs/37695383061)이 앱 SHA `000d60099b65dd7563bac9546dd3f22221c2da9a`로 백엔드·프론트 배포에 성공했다.
- 일회용 인증정보 백업의 최신 트리 제거와 과거 Git 기록의 잔존은 별개다. 관련 인증정보 교체 상태는 후속 확인하며 값은 기록하지 않는다.
