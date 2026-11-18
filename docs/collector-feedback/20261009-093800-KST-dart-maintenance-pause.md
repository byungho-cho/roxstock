# DART 점검 기간 일시 중지 및 재개 예약

2026-10-09 09:38 KST 기록. 사용자가 점검 기간 수집 중지와 2026-10-11 19:00 KST 재개를 지시하여 실행했다.

- roxstock-dart-collector만 정상 종료: Exited(0) 확인.
- 실시간 수집기, 일반 수집기, 백엔드, 프런트엔드, DB, 프록시는 실행·healthy 상태 유지.
- systemd 일회성 예약: roxstock-dart-resume-20261011.timer → roxstock-dart-resume-20261011.service.
- 실행 예정: 2026-10-11 10:00:00 UTC = 2026-10-11 19:00:00 KST. systemctl list-timers에서 확인.
- 서비스 동작: /usr/bin/docker start roxstock-dart-collector. 수집 전체 재설정/전체 재수집 없음.
- Persistent=true, enable --now 등록. 예정 시각에 서버가 꺼져 있으면 다음 부팅 때 실행되는 설정이다.
- 운영 DB 수정·삭제 및 코드 변경은 수행하지 않았다. 이번 사용자의 지시로 일시 중지/재개 예약만 변경했다.
- 수동 docker stop과 예약은 배포 작업의 컨테이너 재생성을 막는 장치는 아니다. 예약 전 배포에서 DART를 다시 시작하면 중지 상태를 재확인해야 한다.
- 실제 재개 성공과 기업코드 매핑 복구는 예정 시각 이후 확인해야 한다.

PR #137은 main에 병합하지 않는다.
