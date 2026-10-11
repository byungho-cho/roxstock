# 19차 실시간 수집기 재시작·DB 충돌 보완

근거: 소통 브랜치의 `20261011-115455-KST-realtime-restart-db-conflict-analysis.md`. 소통 PR #137은 병합하지 않는다.

## 변경

- 상태/lease 작업을 프로세스 내 단일 queue로 직렬화하고 15초 heartbeat는 완료 후 다음 실행을 예약한다. 외부 heartbeat가 있는 worker에서는 idle/stale loop의 중복 heartbeat를 생략한다.
- 초기 실행, background loop 및 heartbeat 실패를 감독한다. 잠금 경쟁은 5~6초 standby 재시도로 처리하며 프로세스 crash로 소비하지 않는다. DB 오류는 민감한 원문 대신 분류 코드/attempt/소요시간을 기록한다.
- lease 획득과 상태 claim, heartbeat/state 갱신은 짧은 ReadCommitted 트랜잭션으로 수행한다. 운영 전역 isolation, RAM, pool, TTL 및 수집 시간 정책은 변경하지 않는다.
- renewal은 현재 owner와 미만료 lease 조건으로 갱신하며 0행은 LOCK_LOST다. 상태 갱신도 owner 조건으로 제한한다. 확인된 1020/deadlock/P2034만 새 트랜잭션으로 최대3회/15초 예산 내 재시도한다.
- 사이클 시작 및 publish/save 직전에 DB lease를 확인한다. 검증 실패하면 수집을 중단한다. 이미 시작한 외부 요청 자체의 취소 또는 원격 publish와 lease의 원자적 fencing은 제공하지 않는다. 다음 fetch 시작은 stop 플래그로 제한하며, lease 상실 이후 shutdown에서 오래된 캐시를 별도로 flush하지 않는다.
- shutdown은 신규 timer 중지, 진행중 loop/heartbeat drain, owner 조건 release, disconnect 순서다. sleep/standby는 중단 가능하며 stopped 저장은 worker 한 곳에서만 수행한다.

## 검증 및 남은 운영 관측

로컬 TypeScript/build 및 backend 186개 통과. 직렬화·오류 이후 queue 진행·제한 retry·idle rejection 감독·중복 idle heartbeat 제거·중단 가능한 대기·lease 상실 후 publish 거절을 검증한다.

CI Backend Check에 MariaDB11.8.9 실제 exclusive claim/동시 heartbeat/expired lease/old owner fencing/조건부 release와 RR snapshot 충돌1020 재현을 추가한다. 이 환경에는 MariaDB/Docker가 없어 실제 DB 검증은 CI에서 수행한다. CI 통과 전 운영 배포하지 않는다.

배포 완료와 장기 관측 완료를 구분한다. 고정 image/container에서 시간 외 최소2시간, 이후 평일 전체1거래일 자연 수집을 관찰한다. 재시작 증가/미처리 오류/소유권 역전은 없어야 한다. 건강검사 PID 상태만으로 수집 정상 판정하지 않는다. source/SSE/DB 저장 실누락과 중복은 별도 운영 근거로 확인해야 한다. RAM 증설은 보류한다.
