# 웹·APK 아이콘 업데이트 · 2026-10-10

선택된 디자인은 파랑·빨강 자산 링과 겹치는 노란색 R이다. 웹 SVG를 기준으로 작은 PNG와 Android 구버전용 해상도별 PNG를 내보내고, Android 8 이상은 같은 경로의 벡터 foreground와 남색 background를 사용하는 adaptive icon을 적용한다.

- 웹 탭: `/brand/roxstock-icon.svg?v=0.1.2`, 32px PNG fallback.
- 홈 화면 추가용 아이콘: 180px PNG.
- APK: `0.1.2-webonly-test`, versionCode 3, 기존 웹 전용 application ID 유지.
- 알림 서비스·수집 클래스가 없는 webOnly APK만 배포한다. 원래 수집용 소스는 별도 notifications flavor로 보존한다.
- APK 내부 launcher/round/adaptive/legacy 아이콘과 서명을 검사하고 에뮬레이터에서 아이콘 로드·설치·메뉴·뒤로 가기를 확인한다.
- 서명 키는 Git에 넣지 않는다. 고정 키 생성·암호화 보관은 별도 승인 후 진행한다. 이전 임시 키와 인증서가 다르면 기존 설치본에 바로 업데이트할 수 없다.

색상: 배경 `#0B1220`, R `#FACC15`, 링 `#3B82F6` / `#EF4444`.
