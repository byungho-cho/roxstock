# 통합 알림 v1.3 운영 배포 결과 (2026-10-22 KST)

## 적용 결과
- 기능 PR: https://github.com/byungho-cho/roxstock/pull/300 — main 병합 완료.
- 최종 검증 소스: 1cea6c26f4cab9c595ffe1a76b64ca5c07a7a3ca
- 운영 적용 커밋: 5ce643e226b77fa32753199bcf47713fec5c6466
- 운영 배포: https://github.com/byungho-cho/roxstock/actions/runs/39721972156 — completed / success.
- 웹/API: 1.2.7. 백엔드·수집기·프론트엔드 이미지가 해당 커밋으로 적용됐으며 각 배포 로그에서 healthy 확인.
- Android: 통합 알림 APK 0.1.8, versionCode 9 게시 완료. 기존 패키지·서명 유지.
- APK: https://newrox.cafe24.com/downloads/android/roxstock-notifications-0.1.8-5ce643e226b7-640e1ca5363f.apk

## 실패 원인과 수정
최초 자동 병합 등록 시에는 CI 대기 상태였다. 이후 실패로 병합이 차단됐으며, 당시에는 배포되지 않았다. 자동 병합 등록과 배포 완료는 구분해야 한다.

최초 계좌 응답이 늦으면 계좌 전환으로 오인해 열린 통합 알림 팝업을 닫던 경쟁 조건을 수정했다. 최초 계좌 선택 완료는 팝업을 유지하고, 실제 사용자/계좌 전환은 기존 보호에 따라 닫는다. 계좌·종목 조회 대기 중 거래 선택은 조회 완료 후 이어서 처리한다.

27·28차 거래 폼 회귀 테스트의 이전 태블릿 폭 693px 기대값을 Figma 확정 공통 폭 370px로 갱신했다. 중앙 정렬·헤더 고정·본문 스크롤·저장 실패/재시도·분할매도 검사는 유지했다. APK 게시 검증과 manifest도 실제 버전 0.1.8/code 9에 맞췄다. 기존 버전 가드와 함께 이번 릴리스에서 과거 소식 초기 수집 검증이 실행되지 않음을 확인했다.

## 검증
- 로컬: frontend TypeScript 통과. 통합 알림 18건을 두 번 반복한 36건, 초기 계좌 응답 지연 2건, 수동 거래 폼 14건 통과.
- 최종 소스 GitHub CI: PR Gate, backend/collector 검증, frontend 타입/빌드/공통 UI, 27·28차 및 나머지 실행 대상 회귀 워크플로 모두 통과. 의도된 화면 범위 외 워크플로는 skipped.
- 최종 소스 및 운영 커밋 Android 빌드·서명/구성 검증·Android 에뮬레이터 설치/계측 테스트 통과.
- 운영 커밋의 배포용 frontend 검증 전체 통과. 통합 알림은 초기 계좌 지연 테스트를 포함한 커버/태블릿 20건 통과.
- DB: 서버 비공개 백업 생성 및 압축 검증 후 통합 알림 migration 적용. migrate status의 미적용 migration 없음 확인. 백업 원문은 공개하지 않음.
- 운영 계좌/종목 API 비인증 요청 401 확인.
- 외부 GET /api/version: 1.2.7 확인. 실제 공개 웹 entry /assets/index-BFVj2kwa.js에서 통합 알림의 broker-inbox / notice-sell-lots 코드 확인.
- 공개 notifications-latest.json: 0.1.8, code 9, 운영 커밋 일치, firebaseConfigured=true 확인.
- 공개 APK 2,120,528 bytes를 직접 내려받아 manifest SHA-256과 일치 확인.

## DB·자료 보존과 복구
이번 배포에서 별도의 운영 거래/알림 원문 재수집이나 수동 데이터 보정은 실행하지 않았다. 정기 수집은 기존 스케줄을 유지한다. migration은 추가 열/인덱스와 목표 baseline 갱신으로 구성되며 기존 거래·알림 발생 이력을 삭제하지 않는다. 기존 ON 사용자의 적용 전 목표 목록은 최초 baseline으로 처리해 일괄 발송을 막는다.

문제 발생 시 기존 SHA 고정 배포 이력과 서버 비공개 백업을 사용한다. 이전 이미지 복귀 시 새 DB 열과 이력을 유지한다. Android SQLite v2를 강제로 v1으로 낮추거나 앱 데이터를 지우지 않고 동일 서명·상위 versionCode 수정 APK로 복구한다. 게시 manifest 이전본은 서버의 APK 배포 백업에 보존된다.

## 사용 및 미검증 사항
새 APK를 기존 앱 위에 업데이트 설치한 뒤 설정에서 거래 알림을 활성화하고 Android 알림 접근 권한을 확인한다. 소식/목표 푸시 권한과 카카오 거래 알림 접근 권한은 별개다. 거래 원문을 일반 웹으로 동기화하는 기능은 이번 범위에 포함하지 않았다.

firebaseConfigured=true는 빌드 구성 확인이다. 실제 휴대전화의 카카오 알림 수신·키보드 억제·FCM 실발송/백그라운드/종료 상태 수신·클릭 이동은 미검증이며 완료로 표시하지 않는다. 공개 저장소에는 키·기기 토큰·원본 운영 데이터·개인 계좌/거래 정보를 게시하지 않았다.
