# Firebase 연결 Android 정식 APK 0.1.7 — 로컬 빌드 결과

2026-10-21. 기준 main `61f567c3` / 웹 v1.2.3. 별도 브랜치 `codex/firebase-notifications-apk-20261021`에서 APK 빌드 및 초안 PR 준비만 수행했다. 운영 배포·운영 DB 변경·사용자 알림 설정 변경·실제 FCM 발송·실기기 설치/수신/클릭 검증은 수행하지 않았다.

## 완료

- 제공된 Android 앱 구성 파일을 로컬에서 검증했다. 프로젝트 `roxstock-ef8ef`, sender `176267262855`, 앱 ID `1:176267262855:android:e834d260b28a38479ef122`, 패키지 `com.roxstock.app.debug`가 일치한다. API 키는 문서·로그·Git에 기록하지 않았다.
- 기존 네 환경변수와 `AppPush.initialize`의 FirebaseOptions 경로를 재사용했다. google-services 플러그인이나 중복 초기화를 추가하지 않았다. 로컬 설정 파일은 저장소 밖 비공개 위치에 보관했다.
- 사용자 요청에 따라 배포용을 release 빌드로 전환했다. 정식 알림용 버전 `0.1.7`, 웹 전용 `0.1.7-webonly`, versionCode 8이다. `-test` 표기를 없앴으며 둘 다 debuggable=false, testOnly=false다.
- 기존 설치 앱과 업데이트 호환성을 유지하기 위해 applicationId의 `.debug`를 변경하지 않았다. 기존 승인 PKCS12 서명을 사용했다. 별도 키를 생성하거나 교체하지 않았다.
- webOnly flavor의 Firebase 설정을 빈 값으로 유지했다. 실제 APK에서 Firebase SDK·연결값·알림 서비스·수신기 없음, INTERNET 권한만 포함됨을 확인했다.
- APK 내용에서 연결값 4개의 일치, 비공개 키·원본 구성 JSON 미포함, 알림 및 증권사 알림 수신 서비스·권한·초기 자동 연결 OFF를 확인했다. release 리소스 파일명 최적화를 고려해 리소스 테이블과 실제 파일의 런처 아이콘을 검증했다.
- CI는 release APK를 검사·산출물로 제공하고 기존 debug instrumentation 회귀를 별도로 유지하도록 준비했다. 후속 배포 스크립트와 버전 확인 경로도 같은 정식 버전에 맞췄다. 이번 작업에서 이 배포 스크립트를 실행하지 않았다.

## APK 및 서명

| 구분 | 알림용 | 웹 전용 |
|---|---|---|
| 버전 | 0.1.7 | 0.1.7-webonly |
| versionCode | 8 | 8 |
| 패키지 | com.roxstock.app.debug | com.roxstock.app.webonly.debug |
| 서명 일치 | 확인 | 확인 |
| Firebase 연결값 포함 | 확인 | 없음 |
| 서버 서비스 계정·private_key | 없음 | 없음 |
| 디버깅 가능 | 아니오 | 아니오 |

서명 인증서 SHA-256:
`0c419a20f4672e1829ad5427e9d7ea81d6f94f668729c045e564711dcda7ef86`

알림용 APK SHA-256:
`85c7e220616efba2d1c2c1c385f7811de7218d4b5f54e3651babe026c23987fa`

웹 전용 APK SHA-256:
`ebd2e57e345626908a8fa026942f70699d97d258e9d1a588da821647e818bcff`

APK·검증 JSON·SHA256SUMS는 로컬 산출물로 보관하며 Git에 커밋하지 않는다. 로컬 산출물 이름은 `RoxStock-0.1.7.apk`, `RoxStock-0.1.7-webonly.apk`다. APK에 앱 연결용 API 키가 포함되는 것과 서버 인증키가 포함되는 것은 다르다. 서버 서비스 계정 파일을 빌드에 제공하지 않았다.

## 검증 범위

- 로컬 JDK 17 / Gradle 8.11.1 / Android 35, 승인 서명으로 두 release assemble 및 lint 통과. Windows 한글 경로 제한을 피하기 위해 동일 소스를 비공개 ASCII 빌드 경로에 복사했다.
- 구성 추출·프로젝트/패키지/앱/키 누락/서버 자격증명 거부 테스트 2개 통과.
- APK 값 일치·누락·비디버그·서버 키 차단·웹 전용 Firebase 차단 검사 테스트 4개 통과.
- 기존 알림 기준선·재알림·관측 누락·목적 화면 및 계좌 정보 제한 정책 테스트 2개 통과.
- 실제 release APK의 메타데이터·서명·DEX·리소스 검사를 수행했다. `firebaseConfigured=true`는 연결값 포함 확인이며 푸시 수신 성공 판정이 아니다.
- 알림 설정 기본 OFF, 사용자별 소유권, 전송 직전 OFF/세션 확인, 중복 방지·DB 이력, 로그아웃·계정 전환 연결 해제, 로그인 후 목적 화면 이동, 과거 자료 일괄 발송 방지 로직은 수정하지 않았다.
- 실제 기기 및 로컬 에뮬레이터 instrumentation 실행은 수행하지 않았다. CI의 기존 에뮬레이터 회귀는 PR 실행 결과로 별도 확인한다.

## CI 및 남은 작업

[Firebase 빌드 설정](../../android-app/FIREBASE_BUILD.md)에 로컬 비공개 설정, CI Variables 3개 및 Secret 1개, 승인 서명 재사용, 빌드·검증 명령을 기록했다. 실제 GitHub Variables/Secret 등록은 이번 작업에서 변경하지 않았다. 연결값이 모두 없는 기존 CI는 미설정 APK를 만들 수 있으므로 구성된 로컬 산출물과 혼동하지 않는다.

남은 단계는 CI 설정 등록 여부 확인과 연결 APK 재현, 별도 승인 후 운영 공개 배포, 일치하는 서버 FCM 설정 확인, 실제 FCM 발송 및 실기기 수신·클릭·계정 전환 검증이다. APK 코드 서명·구성 검증 완료를 전체 푸시 기능 완료로 보고하지 않는다.

복구 시 기존 공개 APK/manifest를 보존한다. 이전 링크로 되돌려도 versionCode 8이 설치된 기기는 자동 다운그레이드되지 않는다. 같은 패키지·서명으로 versionCode 9 이상인 수정 APK를 빌드해 업데이트하는 방법을 우선하며, 앱 삭제·데이터 초기화는 자동 수행하지 않는다. 정식 배포는 초안 PR을 임의로 병합하지 않고 후속 단계로 남긴다.
