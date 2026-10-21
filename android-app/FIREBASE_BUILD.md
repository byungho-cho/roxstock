# 정식 Android APK와 Firebase 앱 연결 설정

배포용은 `notificationsRelease`와 `webOnlyRelease`이다. 정식 버전에는 `-test`를 붙이지 않으며 `debuggable=false`다. 기존 설치 앱을 업데이트하기 위해 applicationId는 각각 `com.roxstock.app.debug`, `com.roxstock.app.webonly.debug`를 유지한다. 이름의 `.debug`는 기존 식별자이며 정식 APK가 디버깅 가능하다는 뜻이 아니다. 승인된 기존 PKCS12 서명 키를 유지한다. 새 키를 자동 생성하거나 대체하지 않는다.

## 로컬 비공개 설정

JDK 17, Gradle 8.11.1, Android platform 35와 build-tools 35.0.0을 사용한다. Windows에서 한글 경로 문제가 있으면 동일 소스를 저장소 밖 ASCII 빌드 경로로 복사한다. 복사본도 APK·생성 BuildConfig가 포함되는 비공개 빌드 공간이다.

1. Firebase 콘솔의 해당 Android 앱에서 `google-services.json`을 받는다. 서버 서비스 계정 JSON은 사용하지 않는다.
2. 아래 명령으로 앱 식별자를 검증하고 저장소 밖 비공개 파일을 생성한다. 출력 파일은 기존 파일을 덮어쓰지 않는다. API 키는 출력하지 않는다.

```sh
node android-app/scripts/firebase-client-config.mjs /private/google-services.json /private/roxstock-build/firebase-client.json
```

확인할 앱 정보:

| 항목 | 값 |
|---|---|
| project ID | roxstock-ef8ef |
| sender ID | 176267262855 |
| application ID | 1:176267262855:android:e834d260b28a38479ef122 |
| Android package | com.roxstock.app.debug |

3. 파일의 네 항목을 현재 빌드 프로세스 환경변수로만 주입한다. 예를 들어 PowerShell에서 파일을 읽고 `PSObject.Properties`를 순회해 `[Environment]::SetEnvironmentVariable(name,value,'Process')`로 설정한다. 값·환경변수 전체·생성 BuildConfig를 로그에 출력하지 않는다. 비공개 파일은 사용자 전용 접근 권한으로 보관한다. Unix는 0600, Windows는 해당 사용자의 비공개 ACL을 사용한다.
4. 기존 `ROXSTOCK_SIGNING_KEYSTORE`와 `ROXSTOCK_SIGNING_PASSWORD`를 프로세스에 주입한다. 키 별칭은 기존 `roxstock`, 형식은 PKCS12다. 비밀번호를 명령행 인자로 전달하지 않는다.
5. 기존 초기화인 `AppPush.initialize` → `FirebaseOptions`를 사용한다. google-services 플러그인이나 별도 Firebase 초기화를 추가하지 않는다. 네 설정값은 notifications flavor에만 주입하며 webOnly는 빈 설정과 Firebase 의존성 없음 상태를 유지한다.

```sh
gradle --no-daemon -p android-app assembleNotificationsRelease lintNotificationsRelease assembleWebOnlyRelease lintWebOnlyRelease
python3 android-app/scripts/verify-notifications-apk.py android-app/app/build/outputs/apk/notifications/release/app-notifications-release.apk
python3 android-app/scripts/verify-web-only-apk.py android-app/app/build/outputs/apk/webOnly/release/app-webOnly-release.apk
```

검증할 때도 동일한 네 환경변수를 사용한다. 검증기는 실제 APK DEX 안의 연결값 일치, 패키지·버전·기존 서명·비디버그 상태·권한과 서비스 보존을 확인한다. 원본 구성 JSON 및 PEM/private_key 필드가 APK에 들어가면 실패한다. API 키 원문은 보고서에 쓰지 않는다. `firebaseConfigured=true`는 APK에 값이 들어 있음을 뜻하며 실제 FCM 인증·전달 성공을 뜻하지 않는다.

## CI 등록

GitHub 저장소 Settings → Secrets and variables → Actions에서 아래처럼 등록한다. 이번 작업은 등록 방법과 소비 경로를 준비하며 저장소 설정을 자동 변경하지 않는다.

| 구분 | 이름 |
|---|---|
| Variable | ROXSTOCK_FCM_APP_ID |
| Variable | ROXSTOCK_FCM_PROJECT_ID |
| Variable | ROXSTOCK_FCM_SENDER_ID |
| Secret | ROXSTOCK_FCM_API_KEY |

API 키는 제공된 앱 구성 파일에서 읽어 Secret에만 입력한다. 기존 서명 Secrets `ROXSTOCK_ANDROID_KEYSTORE`, `ROXSTOCK_ANDROID_PASSWORD`를 유지한다. 서버 서비스 계정 키를 Actions의 APK 빌드 값으로 등록하지 않는다. 부분 설정은 실패하며, 네 항목이 모두 없는 기존 CI 검사에서는 미설정 APK로 검증된다. 실제 연결 APK를 CI로 재현하려면 네 항목 등록 후 Android App Build를 다시 실행한다.

CI 산출물은 `roxstock-notifications-apk`, `roxstock-web-only-apk`이며 정식 release APK와 검증 JSON만 포함한다. 에뮬레이터 회귀는 별도 debug instrumentation 대상으로 유지하되 배포하지 않는다. 초안 PR은 자동 병합·운영 배포 대상으로 전환하지 않는다.

## 복구 및 후속 검증

웹/서버 설정·운영 DB·사용자 알림 설정은 이 빌드 작업으로 변경하지 않는다. 실제 FCM 발송, 실기기 실행 중/백그라운드/종료 수신·클릭·로그인 복귀는 후속 단계다.

기존 공개 APK와 manifest를 보존한다. 링크를 이전 manifest로 복원해도 이미 설치된 새 앱이 자동으로 다운그레이드되지는 않는다. versionCode 8 설치 후에는 기존 코드와 동일 서명·패키지로 versionCode 9 이상인 수정 APK를 빌드해 업데이트하는 방법을 우선한다. 앱 삭제·데이터 초기화나 서명 교체를 복구 수단으로 자동 실행하지 않는다.
