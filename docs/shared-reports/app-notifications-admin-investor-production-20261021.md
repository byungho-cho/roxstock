# 앱 알림·관리자 분리·투자동향 — v1.2.3 운영 결과

코드 [PR #292](https://github.com/byungho-cho/roxstock/pull/292)는 main `22001ac9c3da8f3dbb7ac492c511e492baf76e93`에 병합했다. 검증한 PR head는 `2aacc15fa666131865ed6cb137e665060d008645`이다. [구현·외부 설정·복구 안내](app-notifications-admin-investor-20261021.md)와 함께 확인한다.

2026-10-21 **13:20 KST** 운영 확인. [Production Deploy 39541213995](https://github.com/byungho-cho/roxstock/actions/runs/39541213995)은 전체 성공했다.

| 구분 | 결과 |
|---|---|
| 웹 배포 | 완료 — v1.2.3, 백엔드·collector·프론트엔드 배포 성공 |
| APK 공개 배포 | 완료 — 알림 지원 0.1.6-test / 웹 전용 0.1.6-webonly-test, versionCode 7 |
| Firebase 앱 설정 | 미설정 — 배포된 APK의 firebaseConfigured=false |
| 서버 FCM 키 | 미설정 — 서버 서비스 계정 파일 접근 가능 여부 false |
| 알림 활성 사용자 설정 | 0건 — 신규 기본값 OFF 유지 |
| 실제 FCM 전달·실기기 검증 | 미실시 — 외부 설정과 실기기 검증이 남음 |

[알림 지원 APK](https://newrox.cafe24.com/downloads/android/roxstock-notifications-0.1.6-22001ac9c3da-f266091ec5f6.apk) · [웹 전용 APK](https://newrox.cafe24.com/downloads/android/roxstock-web-only-0.1.6-22001ac9c3da-7ed3c9744085.apk). 일반 설정의 다운로드 링크에서도 설치할 수 있다. 두 APK는 서로 다른 패키지로 별도 설치되며, 앱 알림에는 알림 지원 APK를 사용한다.

APK 공개 URL을 다시 다운로드해 빌드 산출물과 SHA-256이 일치하는 것을 배포 스크립트가 확인했다. 알림 지원 APK SHA-256은 `f266091ec5f62f844102bf0db53cb36d74b73c2b6ce80fbb46f314ad16031615`이다. 기존 승인 서명을 유지했다.

## 운영 확인과 남은 작업

운영 검증 job `119036355357`에서 실제 `/api/version` 1.2.3과 공개 APK manifest 0.1.6-test를 확인했다. 외부 익명 HTTP 요청은 알림 설정·관리자 사용자 목록·모니터링 모두 401이었다. 컨테이너 내부에서 운영 DB에 연결한 API 핸들러를 호출해 관리자 목록/상세 필드 제한·가입 시각 일치·마스킹, USER 문맥의 목록/상세 403을 확인했다. 새 로그인 세션이나 토큰은 발급하지 않았다. 이는 `apiHandlerOnly=true` 검증이며, 실제 운영 로그인 브라우저의 시각 확인은 수행하지 않았다.

푸시 기능의 코드와 DB·기기 연결 경로는 배포됐지만 **실제 푸시 운영 준비 완료가 아니다**. Firebase 클라이언트 4개 값과 서버 서비스 계정 파일을 비공개 경로로 설정하고 APK를 다시 빌드·배포해야 한다. 이후 실제 기기에서 실행 중/백그라운드/종료 수신, 권한 거부/허용, 클릭 및 로그인 복귀, 로그아웃·계정 전환 차단과 발송 실패·재시도를 검증한다. 설정 항목과 절차는 연결된 구현 보고서에 기록했다. 현재는 알림을 임의로 ON으로 바꾸거나 기존 도래·소식을 일괄 발송하지 않았다.

## 확정된 검증

- [PR Validation / PR Gate](https://github.com/byungho-cho/roxstock/actions/runs/39539960909), [Frontend Check](https://github.com/byungho-cho/roxstock/actions/runs/39539960998), [Android App Build](https://github.com/byungho-cho/roxstock/actions/runs/39539961146) 모두 성공했다. 최종 커밋의 워크플로는 37개 성공, 6개 적용 범위 외 skip이다. 이전 커밋의 중복 CI만 취소했으며 운영 배포나 다른 브랜치 검증은 취소하지 않았다.
- 로컬 backend 단위 테스트 147개 성공/1개 skip, collector 234개, 배포 스크립트 47개 및 추가 정책/API 클라이언트 검증을 통과했다. 최종 타입 검사·빌드와 실제 MariaDB 검증은 위 CI에서 확인했다.
- 실DB: 설정의 현재 사용자 소유권, 동시 ON의 세대 중복 증가 방지, 대기 중 OFF 차단, 목표가 최초 충족·반복 관측의 단일 사건, 뉴스 재스캔·수정·동시 스캔의 중복 방지, 동시 발송 단일 처리, 폐기 세션 차단, 사건 소유권/대상 계좌 검증을 수행했다. 관리자 권한 회수 후 API 차단과 사용자 응답 필드 제한·가입 시각 일치·계좌번호 마스킹도 확인했다.
- 370×465와 725×396에서 신규 기능 12개 Playwright 검증을 통과했다. 일반 사용자 관리자 URL/메뉴 차단, 설정 저장 실패/재접속 유지/OS 거부, 정확한 종목코드 전달/자료 없음/필터 변경 후 상세 탭 복귀, 로그인 중 다른 인증 화면을 거친 알림 목적 계좌 복귀를 포함한다. 기존 로그인·홈·뉴스·모니터링·종목 상세·하단 메뉴 회귀도 통과했다.
- CI 스크린샷에서 가격과 투자동향/매수 버튼 간 겹침, 관리자 단일 헤더, 마스킹 및 KST 표기, OS 권한과 내부 스위치의 분리를 확인했다. 스크린샷과 API 계정은 합성 테스트 자료이며 운영 사용자 화면 캡처가 아니다.
- Android 에뮬레이터는 webOnly 5개 및 notifications 1개 테스트를 통과했다. 알림 권한 거부/허용, 연결 불일치·중복 표시·로그아웃 차단, 토큰 갱신 콜백 및 목적 ID 검증을 포함한다. 서명·실제 APK manifest 검사도 통과했다. 실제 FCM 전달/실기기 수신 검증과는 구분한다.

## DB·기존 자료·복구

2026-10-21 13:01 KST에 `20261021120000_app_notifications_admin` 마이그레이션 적용을 확인했다. 새 테이블은 `app_notification_preferences`, `app_push_devices`, `app_target_notification_states`, `app_notification_events`, `app_push_deliveries`, `admin_user_read_audits`이다. `stock_news_items.notification_security_ids` nullable 필드와 사용자 가입일 조회 인덱스를 추가했다.

마이그레이션 전 전체 SQL 백업은 서버 `/opt/roxstock/backups/roxstock-v0.2-20261021T040034Z/`에 보존했으며 배포 스크립트의 백업 검증을 통과했다. 원본 SQL·비공개 로그·서비스 계정 키·기기 토큰·개인 계좌 자료는 공개하지 않는다. 기존 금융자료/계정 데이터 삭제나 DART 2차 보정·운영 재수집을 이번 작업으로 실행하지 않았다. 기존 정기 수집은 유지한다. 배포 파이프라인의 DART/과거 보정 job은 버전 가드로 즉시 종료했으며 보정 실행 성공으로 해석하지 않는다.

원복은 기존 컴포넌트 rollback 도구와 배포 기록을 사용하고 새 DB 테이블·이력·nullable 필드는 유지한다. 실제 운영 원복은 실행하지 않았다. 푸시 전달 중단에는 서버 FCM 경로 제거와 백엔드 재생성을 사용할 수 있다. 사용자별 설정은 OFF로 중단할 수 있으며 다시 ON 시 새 기준선을 사용한다. APK 파일은 보존하고 배포 스크립트가 저장한 이전 manifest로 링크를 복구한다. 설치된 앱의 자동 다운그레이드를 뜻하지 않으며, 설치 앱을 되돌릴 필요가 있으면 기존 서명과 증가한 versionCode로 이전 코드를 재빌드한다.
