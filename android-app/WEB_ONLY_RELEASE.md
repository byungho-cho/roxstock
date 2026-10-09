# 웹 전용 시험 APK 배포 · 2026-10-10

- 앱: RoxStock 웹 시험 / 0.1.1-webonly-test / com.roxstock.app.webonly.debug
- 다운로드: https://newrox.cafe24.com/downloads/android/roxstock-web-only-0.1.1.apk
- 배포 메타데이터: https://newrox.cafe24.com/downloads/android/latest.json
- 파일 SHA-256: `61cb8ae68a64cf8e0021e30cf6e374c980a7e1fb794360f1c4e6778c32fdd470`
- 검증 코드: `fc7ffa44c5b1cfd65e0ca46ce2cbb8f68e62495a`, Actions 실행 `37998022692`, PR #170에 원본 보존.

APK는 재빌드 없이 검증된 artifact 그대로 배포했다. 실제 APK에는 INTERNET만 선언되고 알림 서비스·수집 클래스·브리지가 없다. Android 15 에뮬레이터 설치/메뉴/뒤로 가기 검사를 통과했다. Android 17 실기기와 Play 프로텍트 판정은 사용자 기기에서 별도 확인한다.

다운로드 파일은 프록시의 영구 `caddy_data` 볼륨 내 `/data/roxstock-public/downloads/android/`에 저장한다. 웹 이미지 교체 시 유지되며 Caddy는 이 경로에 APK MIME과 attachment 헤더를 설정한다. 공개 디렉터리에는 APK와 배포 메타데이터만 둔다. 메타데이터를 바꾸기 전에 새 파일의 해시를 검증한다.

운영 설정 백업: `/opt/roxstock/.deploy/apk-20261009T225608Z/Caddyfile`. `publish-web-only.sh`는 이번 검증본의 해시가 고정된 재현용 배포 스크립트이며 업로드한 APK와 후보 Caddyfile을 먼저 검사한다. 외부 HTTPS 다운로드 200, MIME, 다운로드 헤더 및 SHA-256 일치를 확인했다.

이번 웹 변경은 설정 하단의 시험용 APK 다운로드 항목만 추가한다. 알림 접근 안내나 거래 알림 수집 화면은 배포하지 않는다. 기존 수집 소스는 PR #170에 보존한다.
