# v1.1.21 하단 메뉴 안전 영역 수정

- 사용자 재현 환경: Android APK. 일반 모바일 Chromium의 수정 전 `/more` 측정은 뷰포트 370×800, 메뉴 bottom=800, main bottom=756으로 웹 단독에서는 재현되지 않았다.
- 기존 Android 두 flavor 모두 시스템 inset으로 root padding을 설정하면서 동일 inset을 소비하지 않고 WebView로 전달했다. Android 버전별 decor의 기본 fitting에 의존해 이미 줄어든 content에 추가 padding이 들어갈 수 있고, WebView까지 같은 safe-area 정보를 받을 수 있었다.
- native root가 edge-to-edge window의 시스템 바·cutout·IME inset을 한 번만 소유하도록 명시했다. IME와 하단 시스템 바는 합산하지 않고 union inset을 사용한다. 처리한 inset은 WebView로 다시 전달하지 않는다. legacy API도 명시적 layout flag와 소비를 사용한다.
- 웹은 100dvh flex column 안에서 header/main/footer를 나눠 쓴다. footer를 normal flow의 shrink하지 않는 마지막 행으로 바꾸고, 기존 fixed footer용 outer padding을 제거했다. 브라우저 CSS safe-area padding은 footer 한 곳에서 유지한다. 뉴스 카드의 main flex 배치는 보존했다.
- 웹/앱 버전: 1.1.21 / 0.1.4-webonly-test (versionCode 5). APK 다운로드 manifest와 배포 검증 버전도 함께 변경했다.
- 로컬 검증: TypeScript 통과, 모바일 Chromium 393×852·커버 370×465·태블릿 725×396에서 공통 메뉴와 phase34 회귀 15개 통과. 더보기/홈/소식 목록/상세, 회전·높이 축소와 복구·내부 긴 스크롤·가로 메뉴 선택 상태를 검증했다. 수정 전후 화면은 Git 제외 test-results에 보관한다.
- Android CI: system inset 80px, IME 280px, landscape 오른쪽 48px의 적용·복구·소비를 검사하고 실제 WebView의 footer bottom 및 CSS safe-area 중복 여부를 검사한다. 실제 결과는 PR 검사 링크를 기준으로 확인한다.
- 한계: 로컬 Android SDK/실기기가 없어 물리 기기 Chrome 주소창과 실제 소프트 키보드, Fold 커버/태블릿 실기기 조작은 검증하지 않았다. 브라우저 크기 변경 및 Android 합성 IME/inset 검증과 구분한다.
- DB 스키마/자료 변경 없음. 운영 배포는 기존 컴포넌트 백업·이미지 롤백 절차를 사용하며 APK는 기존 서명으로 업데이트한다.
