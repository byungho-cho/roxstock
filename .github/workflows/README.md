# GitHub Actions: 개발과 QA 분리

2026-10-01 사용자 지시가 이전 종합 QA 필수 지침보다 우선합니다.

| 워크플로 | 실행 | 역할 |
| --- | --- | --- |
| Frontend Check | PR, 배포 workflow_call | 타입 검사·빌드 |
| Backend Check | 관련 PR | Prisma 검증·격리 MariaDB 마이그레이션·타입 검사·기본 테스트·빌드 |
| Frontend Docker Image | 관련 main push, 수동 | 기본 검사 → 이미지 게시 → 자동 배포 |
| Backend Test Build Deploy | 관련 main push, 수동 | 기본 테스트·타입 검사 → 빌드 → 이미지·health 검사 → 배포 |
| Frontend Viewport QA | workflow_dispatch만 | 전체 화면·뷰포트·캡처 |
| Frontend API Integration | workflow_dispatch만 | 격리 DB 브라우저 종합 회귀 |

개발 담당은 변경 기능과 관련 오류를 확인하고 타입 검사·빌드를 수행합니다. 거래·예수금·손익·DB 변경은 정확성과 기존 데이터 보존 관련 테스트를 실행합니다. 기본 검사 실패는 수정하고 통과 전 병합·배포하지 않습니다.

기본 검사 통과 후 PR을 main에 병합하고 별도 승인 없이 자동 배포합니다. 배포 작업 성공·실패를 확인하여 변경 기능, 검사 결과, PR·병합 SHA, 배포 버전, 남은 문제를 보고하면 종료합니다. 운영 화면 최종 확인은 사용자가 수행합니다.

사용자가 “QA 실행해줘”라고 요청했을 때만 QA 담당이 두 수동 워크플로를 필요한 범위로 실행하고 캡처·영상·상세 보고서를 전달합니다. 대상 브랜치/커밋과 배포 버전을 기록합니다. 배포 전후 같은 종합 QA를 반복 실행하지 않습니다. QA 미실시 항목은 그대로 기록합니다. 수동 QA 실패는 별도 수정 작업으로 보고하며 기본 검사 실패를 무시하는 근거가 되지 않습니다.

## 필수 검사 규칙

필수 검사는 기본 검사(validate / Frontend Basic Check)를 기준으로 하고 integration, journal, target-arrivals 등의 종합 QA job을 필수 조건에서 제외합니다. 경로 필터로 실행되지 않는 검사를 모든 PR에 강제하지 않습니다. 저장소 관리자 설정의 실제 변경은 관리 권한이 필요합니다. 워크플로 변경만으로 서버의 branch protection을 변경했다고 보고하지 않습니다.

이번 연결에서 branch protection 읽기는 403(관리 권한 없음), rulesets 조회는 비공개 저장소 요금제 제한으로 거절되었습니다. 관리자 규칙 상태는 확인 불가이며 실제 병합 가능 여부로 추가 확인합니다. 향후 규칙을 활성화할 경우 위 기준을 적용합니다.
