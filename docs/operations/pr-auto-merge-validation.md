# 자동 병합·배포 검증 기록

2026-10-07 사용자 승인에 따라 운영 자동화를 검증한다.

## 최초 설정

- 설정 PR: https://github.com/byungho-cho/roxstock/pull/116
- 필수 PR Gate 검사: https://github.com/byungho-cho/roxstock/actions/runs/37624378400
- 자동 병합 SHA: df3cf26394df23d36b9c61c2d48bb67e376d6df0
- main push 자동 배포: https://github.com/byungho-cho/roxstock/actions/runs/37624611436
- main은 PR Gate 필수·최신 브랜치 필수·관리자 우회 금지로 보호한다.

## 별도 연결 검증

이 기록을 포함한 문서 PR을 초안으로 생성한다.
초안 상태에서 자동 병합이 활성화되지 않는지 확인한 뒤 일반 PR로 전환한다.
PR Auto Merge가 직접 자동 병합을 예약하고, PR Gate 통과 뒤 GITHUB_TOKEN 병합의
push 이벤트 억제를 workflow_dispatch로 연결하는지 확인한다.
각 배포 단계의 전체 SHA 이미지, DB health, 세 수집기 health, 외부 API 및 프론트 응답을 검증한다.
최종 실행 링크와 결과는 해당 PR의 검증 결과에 기록한다.

운영 데이터 복원이나 개발 환경변수 업로드는 수행하지 않는다.
