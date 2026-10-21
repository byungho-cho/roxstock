# Android APK 다운로드 통합 — 2026-10-22

별도 브랜치 codex/unified-notifications-apk-20261022. DB 변경 없음.

- 설정의 APK 다운로드를 알림 지원 APK 링크 하나로 통합했다. 알림 기본 OFF와 사용 시 권한 안내를 유지했다.
- 배포용 release 산출물과 공개 업로드는 notifications APK만 제공한다. webOnly 코드는 기존 회귀 검증용으로 유지한다.
- 공개 기본 manifest latest.json도 notifications-latest.json과 동일 APK를 가리키도록 후속 배포 스크립트를 변경했다. 이전 manifest 두 개를 백업하며, Firebase 미설정 APK는 공개를 거부한다. 기존 APK 파일은 삭제하지 않는다.

## 기존 설치 앱 호환성

운영에서 두 APK를 재다운로드하여 SHA-256, 실제 패키지, 승인 인증서 서명 검증을 수행했다.

| 기존 APK | 패키지 | 버전/code | 통합 앱으로 업데이트 |
|---|---|---|---|
| 알림 지원 | com.roxstock.app.debug | 0.1.7 / 8 | 같은 패키지·서명 유지. 이후 높은 code로 업데이트 가능 |
| 웹 전용 | com.roxstock.app.webonly.debug | 0.1.7-webonly / 8 | 패키지명이 달라 인플레이스 전환 불가. 알림 앱 별도 설치 필요 |

두 APK의 인증서 SHA-256은 동일하다: 0c419a20f4672e1829ad5427e9d7ea81d6f94f668729c045e564711dcda7ef86.

이번 변경은 네이티브 코드·패키지·서명을 변경하지 않고 기존 알림 APK를 단일 배포 대상으로 선택한다. 새 버전 APK를 만든 것으로 보고하지 않는다. 실제 기기 설치 업데이트 테스트는 수행하지 않았다. 웹 전용 앱 삭제나 데이터 초기화는 수행하지 않는다.

## 검증 및 반영 상태

- frontend TypeScript 검사 통과.
- 커버 370×465, 태블릿 725×396: 네 설정 진입 경로에서 링크 하나, 알림 APK URL, download 속성 확인 — 2개 테스트 통과.
- 현재 운영 APK의 서명·패키지·해시 및 개인정보 API 비인증 401 재확인.
- 운영 배포·병합·실제 FCM 발송은 이번 작업에서 수행하지 않았다.

복구는 프론트엔드 변경을 되돌리고 공개 manifest를 배포 시 저장한 latest.previous.json 및 default.previous.json으로 각각 복원한다. 설치된 앱은 manifest 복구로 다운그레이드되지 않으며, 필요 시 동일 패키지·서명의 높은 versionCode 수정 APK를 배포한다.

## 후속 운영 반영 승인

사용자 승인에 따라 웹 버전 v1.2.6으로 병합·자동 배포를 진행한다. 네이티브 런타임 변경은 없으므로 패키지·서명·Android 0.1.7(versionCode 8)을 유지한다. 배포 산출물은 알림 지원 release APK 하나이며 일반 manifest도 같은 파일로 연결한다. 커버·태블릿 모니터링/설정 회귀 26개, APK 구성 2개·검증 4개, YAML/Bash 문법 및 프론트엔드 빌드를 통과했다. 실제 기기 업데이트 및 FCM 수신 검증은 수행한 것으로 보고하지 않는다.
