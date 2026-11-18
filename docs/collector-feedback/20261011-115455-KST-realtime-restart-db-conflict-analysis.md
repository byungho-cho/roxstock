# 19차 최우선: 실시간 수집기 재시작·DB 갱신 충돌 원인 분석

작성: 2026-10-11 11:54:55 KST. 전달 대상: 개발 담당. [소통 PR #137](https://github.com/byungho-cho/roxstock/pull/137), [18차 서버 진단](20261011-094843-KST-home-server-performance-ram.md).

## 결론: 직접 원인·추정·미확인

**직접 종료 경로 확인:** 휴장/시간 외 루프의 `monitor.heartbeat()`에서 발생한 MariaDB 1020이 보호되지 않은 `running=loop()` Promise rejection으로 빠져나간다. `runRealtimeCollector()`가 loop 완료가 아니라 stop 함수를 먼저 반환하므로 worker 바깥 `try/catch`는 이후 loop 실패를 잡지 못한다. 운영 fatal stack과 다음 기동 로그, 배포된 JS 그대로의 격리 오류 주입(종료1)이 일치한다. 초기 heartbeat도 outer try 밖이라 실패 시 종료한다. DB 1020이 단순 개별 종목 실패로만 끝나는 구조가 아니다.

**재시작 증폭 경로 확인:** 비정상 종료 시 기존 lease가 즉시 해제되지 않는다. 새 프로세스가 `monitor.acquire()`에서 실패하면 명시적 `process.exit(1)`을 호출하고 `unless-stopped` 정책이 재기동한다. 운영에서 잠금 실패 로그 직후 Docker `die(exitCode=1)`와 다음 `start`가 5회 연결된다. 즉, 모든 restart가 새 DB 1020인 것은 아니다. 기존 lease를 기다리는 짧은 실패들이 restart 횟수를 크게 늘린다.

**DB 충돌의 유력 원인:** 같은 프로세스의 15초 heartbeat timer, 시간 외 60초 loop heartbeat, 장중 cycle 저장이 같은 단일 상태 행을 병렬 갱신할 수 있다. DB는 InnoDB / REPEATABLE-READ / `innodb_snapshot_isolation=ON`이고 Prisma upsert는 MySQL 계열에서 native 단일 SQL upsert를 보장하지 않는다. 이러한 동시 갱신/트랜잭션 snapshot 충돌이 1020의 유력 조건이다. **운영에서 충돌한 두 SQL·트랜잭션·정확한 호출 쌍은 기록되지 않아 미확인**, 실제 MariaDB 충돌 재현도 이번에 수행하지 않았다.

**추가 결함 확인:** 이전 소유자의 heartbeat/cycle이 새 소유자의 상태를 덮을 수 있고, lock renewal이 0행이어도 성공 취급한다. 모킹으로 오래된 소유자 heartbeat의 덮어쓰기를 재현했다. 실제 운영에서 이 소유권 역전 또는 이중 수집이 발생했다는 뜻은 아니다.

**범위:** 운영 코드·설정·수집 정책·데이터 변경, 배포, 컨테이너 재시작/중단, 수동 수집, RAM 증설을 수행하지 않았다. 운영에서는 Docker read-only inspect/events/logs/top와 SELECT/SHOW만 사용했다. 모킹·오류 주입은 운영 DB/네트워크와 연결되지 않은 `/tmp`의 별도 Node 자식 프로세스에서만 실행했다. 보고서/증거에는 접속정보·계좌·금액·인증값·락 소유자 원문이 없다.

## 운영 배포·관찰 기준

관찰 2026-10-11 11:40~11:58 KST. 후속 증거 반영: 2026-10-11 11:59:20 KST. 조사 시작 전 다른 작업에서 배포가 진행된 것으로 보이는 새 이미지/생성시각을 관찰했다. 본 분석은 배포를 수행하지 않았다.

| 항목 | 관찰 |
|---|---|
| 현재 backend/수집기/frontend 이미지 커밋 | `b6cccfebb435db0da816ad2da320c4714c25c152` |
| realtime image ID | `sha256:9fd1f08cf5240fe49a3aee6eeec7abacb6d6c335291e2d5cd2594a916018f1c1` |
| realtime 컨테이너 생성 | 2026-10-11 11:34:08.587 KST |
| 초기 inspect | restart24, restarting, exit1, OOMKilled=false |
| 11:43:53 관찰 | restart25, running/healthy, 현재 StartedAt 11:41:36.893 KST |
| 초기 후속 inspect의 직전 FinishedAt | 11:41:22.950 KST; running 상태 ExitCode=0은 과거 실패가 없었다는 뜻이 아님 |
| 11:52:01 / 11:58:18 후속 | restart34, 동일 컨테이너/이미지, StartedAt11:51:48.170 / FinishedAt11:51:21.434 KST, running/healthy/OOM=false |
| 정책 / 로그 | `unless-stopped` / json-file, 조회한 log options 없음 |
| 실행 | Node v20.20.2, realtime-worker.js 단일 프로세스 |
| DB | MariaDB11.8.9, InnoDB, REPEATABLE-READ, snapshot isolation ON, lock wait timeout50초 |

18차 관찰은 이전 이미지 `bb1a01b62edad88afd75e70ac784e974954af4fb`, restart33→49였다. 현재 컨테이너는 재생성돼 카운터가 새로 시작했으므로 49→24를 복구로 해석하지 않는다. 두 커밋의 realtime-worker.ts/realtime-price-collector.ts diff는 없음. 상위 `.deploy/worktree` HEAD는 다른 과거 커밋이므로 신뢰하지 않고 실행 이미지 커밋과 컨테이너 JS를 확인했다.

실행 JS SHA256: worker `6a7d9de2b2735c4cca20e42989ffa7c6eac23f8e57376840bd955468671ca173`, collector `5436687ead2b2113089f5b65a7db360781fce59197a8c1195599ada14afa6659`.

### KST 시간 대조

| 시각(KST) | 운영 근거 | 해석 |
|---|---|---|
| 11:34:22~11:34:40 | 잠금 획득 실패8회 | 새 컨테이너 초기 대기/잔존 lease 가능성. 당시 이전 holder·배포 SIGTERM·해제 여부 미확인 |
| 11:34:54.523 | realtime collector started | loop 기동 |
| 11:38:54.982 | MariaDB1020 + heartbeat(worker.js:28:9) + loop(collector.js:123:17) fatal stack + Node version | 시간 외 heartbeat의 미처리 실패 |
| 11:38:56~11:39:26 | 잠금 실패8회 | 종료 뒤 재기동 시 lease 잔존과 일치 |
| 11:39:54.141 | collector started | 앞선 fatal 기록 후 약59.16초 뒤 loop 재기동 |
| 11:40:54.817 | 같은1020·같은 heartbeat/loop stack | 두 번째 확인된 fatal 실패 |
| 11:41:00~11:41:22 | 잠금 실패7회 | 새 오류가 아닌 lease 획득 실패 반복 |
| 11:41:04.55→11:41:05.13 | start→die exit1, 직전 잠금 실패11:41:04 | 코드의 명시적 종료와 이벤트 연결 |
| 11:41:06.18→11:41:07.19 | start→die exit1, 잠금 실패11:41:06 | 반복1 |
| 11:41:08.87→11:41:09.58 | start→die exit1, 잠금 실패11:41:09 | 반복2 |
| 11:41:13.63→11:41:14.56 | start→die exit1, 잠금 실패11:41:13 | 반복3 |
| 11:41:22.20→11:41:23.70 | start→die exit1, 잠금 실패11:41:22 | 반복4 |
| 11:41:38.636 | collector started | 두 번째 fatal 이후 약43.82초 뒤 loop 재기동 |
| 11:46:58 DB 조회 | heartbeat11:46:53.913, OUT_OF_SESSION, lease 잔여40초, state/lock owner 일치 | 정상 시간 외 heartbeat로 복귀한 순간 관찰 |
| 11:50:39 DB 조회 | heartbeat11:50:24.366, lease 잔여30초, owner 일치, restart25/healthy | 재발하지 않은 약9분 구간; 해결된 것은 아님 |
| 11:50:41.208 | 세 번째1020 + 동일 heartbeat/idle-loop fatal stack | 약9분 안정 관찰 직후 재발 |
| 11:50:43~11:51:21 | 잠금 실패8회 추가 | 재시작 증폭 반복 |
| 11:51:50.169 | collector started | 세 번째 fatal 이후 약68.96초 뒤 loop 재기동 |
| 11:52:01→11:58:18 | restart34, 동일 image/CreatedAt, healthy | 초기25에서9회 증가; 이 구간 카운터 리셋없음 |

타임스탬프는 Docker 로그 기록 시각/이벤트 시각/DB 필드 시각을 구분했다. inspect StartedAt과 Docker start 이벤트는 같은 값이 아니므로 서로 대체하지 않는다. 원시 UTC(나노초 포함)와 KST는 증거 파일에 남겼다.

**보존 한계:** Docker events는 요청한3시간 전체를 돌려주지 않았고 첫 보존 realtime start는11:41:04였다. 11:38/11:40/11:50의 DB fatal 직후 die 이벤트와 컨테이너 생성·배포 kill 이벤트는 남아 있지 않았다. 따라서 그3회의 Docker exitCode를 직접 회수했다고 주장하지 않는다. fatal stack→후속 시작·코드·격리 종료 재현이 직접 종료 경로의 근거다. 보존된5개 die는 잠금 실패 종료에 대해 exit1을 직접 입증한다. 최신컨테이너 로그만 남아 이전 이미지의 모든 실패를 복원할 수 없다.

새 image/CreatedAt은 배포/재생성 근거이고, 동일 컨테이너 restart 증가와 명시적 exit1 기록은 비정상 종료/재기동 근거다. 누가 배포·수동 restart했는지, 보존하지 못한 구간에 수동 조작이 있었는지는 확인하지 못했다. 보존된 실패 이벤트에는 kill/oom 근거가 없다. healthcheck는 PID1 명령에 worker 파일명이 있는지만 검사하며 heartbeat/DB/수집 정상 여부는 검사하지 않는다. Docker healthy를 수집 정상으로 판정해서는 안 된다.

## 코드 경로와 동시 갱신·소유권

아래 링크는 실행 커밋 기준이다: [worker](https://github.com/byungho-cho/roxstock/blob/b6cccfebb435db0da816ad2da320c4714c25c152/backend/src/collector/realtime-worker.ts), [collector loop](https://github.com/byungho-cho/roxstock/blob/b6cccfebb435db0da816ad2da320c4714c25c152/backend/src/collector/realtime-price-collector.ts).

1. acquire는 job 단일 키와 UUID 소유자, DB UTC 기준45초 TTL을 사용한다. 만료 시 owner를 교체하는 INSERT…ON DUPLICATE KEY UP2026-10-11 11:54:55 후 별도 SELECT로 owner를 확인한다. 두 문장이 애플리케이션 수준 단일 트랜잭션으로 묶여 있지 않다. `owner` 비교는 있어 실제로 소유하지 않은 새 token의 진입을 막는다.
2. heartbeat는 `findUnique(prior)` → `upsert(state)` → `UP2026-10-11 11:54:55 lock WHERE owner=token`의3단계다. prior 조회와 상태·lease 갱신 전체에 소유권을 잠그는 단일 트랜잭션은 없다. 상태 upsert가 실패하면 lock renewal은 실행되지 않는다.
3. 초기 heartbeat는 outer try 밖이다. timer는15초마다 호출하고 완료를 기다리지 않아 이전 timer 실행이15초를 넘으면 timer끼리 겹친다. timer 실패는 빈 catch로 삼키므로 실패 횟수·원인이 기록되지 않는다.
4. 같은 프로세스의 inactive/disabled loop는60초마다 또 heartbeat를 호출한다. 시작 시 초기 heartbeat 다음 loop heartbeat가 연달아 실행되며, 이후 timer와 loop가 동시 실행될 수 있다. state 행은 `selected-prices` 단일 키이고 timer와 loop는 같은 token을 사용해도 DB에서는 서로 다른 쿼리/트랜잭션이다.
5. loop 내부 price fetch/publish/DB flush는 catch가 있어 개별 cycle 오류로 격리된다. `monitor.cycle()` 오류도 catch로 로그만 남긴다. 반면 inactive/stale-backoff heartbeat는 해당 catch 밖이다. `const running=loop()`를 즉시 감독하는 catch/await가 없고 반환된 stop에서만 await하므로 지연 rejection은 프로세스를 종료시킬 수 있다. [Node20 공식 unhandled rejection 설명](https://nodejs.org/download/release/v20.20.0/docs/api/cli.html#--unhandled-rejectionsmode)과 격리 결과가 일치한다.
6. cycle은 worker state를 `where:{id}`로만 update한다. heartbeat upsert도 현재 owner 검증 없이 token을 덮는다. 반면 lock renewal에는 owner 조건이 있지만 affected rows를 확인하지 않는다. **오래된 워커가 새 owner의 lock을 직접 연장할 수는 없으나**, state를 덮고 renewal0을 무시한 채 다음 작업을 진행할 수 있다. 만료 전에 소유권 검증/유효 lease 확인 없이 수집·publish/save를 시작하는 위험도 있다.
7. stopped의 state updateMany·lock deleteMany는 owner 조건이 있어 예전 워커가 새 워커의 lock을 삭제하지 않도록 보호한다. 모킹에서도 삭제되지 않았다. 그러나 shutdown은 loop 종료 시 monitor.stopped와 worker stop finally에서 다시 호출하며, clearInterval은 이미 진행 중인 heartbeat를 취소하지 않는다. 늦은 갱신이 STOPPED를 되돌릴 가능성이 있다. 종료 finally의 monitor.stopped 실패는 disconnect/exit0 이전에 빠져나갈 수 있는 추가 오류 경로다. 이번 fatal stack은 그 경로가 아니다.

전체 Docker 목록에서 동일 역할 컨테이너는1개, docker top과 호스트 프로세스 필터에서도 realtime 역할1개. 상태 행 관련 DB 트리거 조회 결과없음. 다른 collector/DART/backend 코드에서 같은 상태 행 쓰기 경로는 찾지 못했다(backend는 read). **현재 중복 프로세스 증거는 없다.** 배포 교체 때의 과거 중복·다른 DB 접속 클라이언트까지 배제하지 않는다. 프로세스1개여도 내부 timer/loop/cycle 중첩은 가능하다.

### MariaDB1020 해석

조회 당시 InnoDB snapshot isolation ON/RR. [MariaDB 공식 문서](https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-system-variables#innodb_snapshot_isolation)는 snapshot과 현재 행 상태가 동시 변경으로 어긋난 갱신이1020 및 트랜잭션 rollback을 일으킬 수 있다고 설명한다. 이 서버의 설정과 동일 행 동시 쓰기 구조가 그 설명과 맞는다.

[Prisma6 공식 문서](https://docs.prisma.io/docs/orm/v6/reference/prisma-client-reference#database-upsert-prerequisites)의 native upsert 지원 DB에는 MySQL/MariaDB가 포함되지 않는다. 따라서 state.upsert를 무조건 단일 atomic SQL로 가정하면 안 된다. 운영 오류는 PrismaClientUnknownRequestError 안에 MariaDB1020/ConnectorError가 출력됐고 transient:false였다. 정확한 generated SQL/내부 트랜잭션 read view는 미수집이며, 외부 prior findUnique 자체가 upsert 트랜잭션 snapshot을 생성했다고 단정하지 않는다.

그 결과 **동시 heartbeat가1020을 유발한다는 가설은 강하지만 아직 운영 SQL 상관/실제 DB 재현으로 확정되지 않았다.** 다른 write/cycle, 지연으로 확대된 경쟁 구간, MariaDB/Prisma의 구체적 동작이 추가 검증 대상이다. 전역 isolation/로그 설정 변경은 최소 수정안으로 제안하지 않는다.

## 다른 원인·사용자 영향

- 현재 RAM769MiB, available391MiB, swap약1028MiB, load3.25/1.61/1.39. 4개1초 vmstat 실측 swap-in14,864~22,640KiB/s, swap-out5,236~14,496KiB/s, I/O wait46~52%, steal13~26%. 높은 paging/I/O 대기는 여전히 존재하며 heartbeat 지연·lease 만료·동시 실행 구간을 키울 가능성이 있다. **해당1020 시각과의1초 지표를 보존하지 못해 직접 원인으로 확정하지 않는다.** RAM 증설은 사용자 지시대로 보류했다.
- 컨테이너 OOMKilled=false, 보존 kernel OOM 문자열0. 현재 메모리 문제가 없다는 뜻이 아니며 과거 삭제된 컨테이너/로그의 OOM은 미확인이다. 보존된 restart는 exit1이고 137/oom 이벤트는 관찰되지 않았다.
- container stats 스냅샷 realtime CPU0%,7.48MiB; backend0%,21.61MiB; DB0.01%,12.23MiB; collector/DART0%,4.53/4.65MiB; proxy1.87%,10.21MiB. swap을 포함하지 않는 수치라 전체 working set으로 해석하지 않는다.
- DB 연결 순간13개 Sleep+진단 Execute1, 장기 active/현재 잠금 대기 증거없음. 최근 retained realtime 로그의 선택한 P1001/P2024 패턴은 없었다. 모든 DB 연결 실패/timeout을 배제할 자료는 아니고, 관찰된 fatal3건은1020 stack이었다.
- 10월11일은 일요일이며 코드의 weekend 판정상 OUT_OF_SESSION. 이날 cycle/price 수신이 없는 것은 정상 대기다. restart 반복은 정상 휴장 동작이 아니다. heartbeat가90초 이내이면 collection-status는 WAITING을 반환하므로 짧은 restart storm이 관리화면 정상 대기에 가려질 수 있다.
- 조회 당시 마지막 cycle 종료10월9일19:59:14 KST, 마지막 가격/SSE/DB 저장10월8일19:59:52 KST. 일요일 재시작만으로 장중 가격 누락을 입증할 수 없다. 현재 latest heartbeat/state owner는 정상으로 돌아왔다.
- 최근 aggregate(UTC day별)는10월8일660분에661cycles, 수신22,750/저장22,680, stale385;10월9일162cycles에수신0, stale5,709, source failures37. 10월8일 18:58~19:02 KST 개별 조회5분은 매분1cycle/35개 수신·저장으로 정상. 하루661cycles/660분은 같은분 재시작·minute 경계·주기 누적의 어느 경우인지 구분할 수 없어 중복 실행의 증거로 단정하지 않는다. 가격 row upsert와 합계 저장 건수도 서로 다른 의미다.
- 장중 재시작이면 인메모리 cache 소실·loop/lease 대기 동안 수신·SSE publish·DB flush가 지연될 수 있다. 실제 누락 건수/지연 시간/동일 가격 중복은 source timestamp·cycle ID·owner 세대별 추적이 없어 미확인이다. 10월9일 stale/source 실패는 source/휴장 요인과 구분해야 하며 이번 restart에 귀속하지 않는다. 현행 market session 함수는 평일 시간+주말만 검사하며 공휴일 자체를 확인하지 않는다.

## 격리 재현 (운영 관측과 별개)

운영 DB/native MariaDB는 연결하지 않았다. 신규 DB 컨테이너를 같은 저메모리 운영 호스트에 추가하지 않고, 별도 `/tmp/roxstock-19-repro`에서 Node20.20.2와 실제 컨테이너의 collector JS/time/logger를 복사해 사용했다. worker imports만 진단 stub으로 바꾸고 실행 본문/monitor 메서드는 유지했다. 계좌·가격·인증값·운영 환경변수는 사용하지 않았다. repository/provider는 stub이고 Sunday inactive 경로라 fetch/publish/save 호출없음. 자식 프로세스 환경은 PATH만 전달했다.

| 재현 조건/절차 | 기대 정상 동작 | 실제 배포 코드 동작 |
|---|---|---|
| 초기 state upsert Promise를 진단 오류로 reject | 관리된 startup 실패 기록/정리 | exit1, outer process-failed catch 로그없음 |
| 초기 heartbeat성공 후 loop heartbeat(2번째 upsert) reject | monitoring 실패를 제어하고 lease/loop 정책에 따라 처리 | exit1, 운영과 같은 collector.js:123:17 stack, outer catch 로그없음 |
| acquire=false stub | 유효 lease 대기·bounded retry | 잠금 실패 메시지 후 process.exit1 |
| 같은 monitor에 heartbeat2개를 동시에 호출, upsert20ms 지연 | heartbeat/state 갱신 직렬화 | 동시 upsert 최대2, renewal2; overlap 가능성 재현 |
| 새 ownerB state/lock을 모델링한 뒤 old ownerA heartbeat | old owner 쓰기 거절·수집 중지 | state owner를A로 덮고 lock renewal0에도 정상 resolve |
| old ownerA stopped(현재B) | 새 owner lock 유지 | 조건부 delete로 새 lock 삭제안됨 |
| timer와 동일 .catch(()=>{}) 패턴에 upsert reject | 관측 가능한 오류·lease 처리 | 오류삼킴, lock renewal 실행안됨 |

총7개 시나리오 assertion 통과. 오류는 진단 sentinel을 사용했고 실제 DB1020을 만든 것이 아니다. 동시2호출은 결정적 interleaving을 강제한 모킹이며 운영에서 그 정확한2호출이 충돌했다는 증거가 아니다. 구체적 결과와 실행 UTC/Node version은 증거 파일에 저장했다. 자식 프로세스 pipe+즉시exit에서 로그가 소실될 수 있어 재현 로그는 로컬 파일 descriptor로 받아 확인했다.

개발자가 반복할 최소 실패 재현 절차: 실행 커밋 build의 runRealtimeCollector에 `enabled:false`, monitor.heartbeat가 reject하는 stub를 넣고 `await runRealtimeCollector()` 후 프로세스를 유지한다. 반환은 stop 함수지만 background loop rejection이 exit1을 일으킨다. native DB 필요없음. 실제 분석 harness는 코드 본문을 그대로 유지한 stub worker로 초기/loop/락 경로를 각각 자식 프로세스에서 실행했다.

**남은 native DB 재현 계획:** 운영과 자원/네트워크가 분리된 MariaDB11.8.9+Prisma6.19.3 임시 DB에서 synthetic state/lock schema만 생성한다. RR/snapshot ON을 고정하고 T1 read view/상태 읽기와 T2 같은행 commit을 barrier로 순서 제어한 뒤 T1 update/upsert 결과(1020/rollback 여부)를 기록한다. 이어 실제 heartbeat timer/loop 두 caller를 같은행에 겹치게 실행하고 SQL template·connection/transaction ID·attempt timing을 수집한다. 직렬화/조건부 update/transaction retry 대안을 비교한다. snapshot OFF/RR 변경은 격리 비교용만 검토하며 운영 전역 변경은 하지 않는다. 이번에 이 native 충돌 재현은 미실행이다.

## 확인된 원인에 맞춘 최소 수정안 (제안만, 미구현)

1. **heartbeat 단일 실행·예외 감독:** 15초 timer를 heartbeat의 단일 주기로 두고 inactive loop의 중복 상태 write를 제거하거나 모든 heartbeat/state write를 같은 단일 실행 queue로 직렬화한다. setInterval은 in-flight guard 또는 완료 후 예약 방식으로 바꾼다. background loop Promise에 즉시 supervision을 붙이고, inactive/stale heartbeat/초기 acquire/heartbeat/종료도 오류정책에 포함한다. global unhandled rejection 무시로 해결하지 않는다.
2. **소유권과 lease 우선:** 상태 초기 claim은 lease 획득 후 수행하고 이후 heartbeat/cycle은 id+현재 owner 조건의 update로 제한한다. lock renewal은 owner+유효 lease 확인 및 affected-row 검증;0이면 LOCK_LOST로 전환해 old worker의 fetch/publish/save를 멈춘다. acquire/claim·renew/state 갱신의 필요한 부분은 짧은 트랜잭션으로 일관성을 확보한다. 긴 network 수집을 transaction 안에서 유지하지 않는다. 단순 state 토큰 비교만으로 lock 소유권 검증을 대신하지 않는다.
3. **제한 재시도/백오프:** 1020/deadlock 등 확인된 일시 충돌만 새 트랜잭션으로 제한 재시도(예: 최대3attempt+작은 jitter, 전체 deadline은 lease 예산 이내). rollback된 transaction에서 같은 실패 statement만 재실행하지 않는다. Prisma unknown error로 노출되는1020 식별은 실제 오류 형태를 테스트하고 민감정보 없는 분류기로 다룬다. timer 빈catch 대신 분류·attempt·소요시간 기록. 재시도 중 lease 상실/DB 장기 장애는 수집 보류·관리된 종료로 처리한다.
4. **락 획득 실패를 프로세스 crash로 소비하지 않기:** 아직 다른/이전 owner lease가 유효하면 남은 TTL 기반 bounded wait+backoff+jitter로 acquire 재시도한다. owner가 살아 있다면 작업은 시작하지 않는다. 무한 실패/DB 연결 단절은 별도 degraded 상태·timeout 정책으로 처리한다. Docker restart policy 변경보다 application의 정상 경쟁 대기부터 수정한다. 초기8실패와 fatal후23실패의 증폭을 줄이는 대상이다.
5. **shutdown·상태 저장 경계:** 새 timer 금지→in-flight heartbeat drain→loop 종료→owner 조건 release를1회 수행하도록 정리. cycle 집계·상태/issue 저장 부분 실패가 가격 수집 전체를 필요없이 종료시키지 않게 격리하되, lease 상실은 수집 계속하면 안 된다. TTL45초와 DB timeout50초의 불일치·최대 heartbeat 지연/재시도 시간을 계산해 예산을 조정할 필요가 있으나 운영 값 변경은 별도 작업이다.

핵심 최소 묶음은 **heartbeat 직렬화+loop 감독+owner/renew0 검사+유효 lease 대기**다. native SQL upsert 또는 상태 updateMany 전환만으로 background rejection/old owner 위험이 모두 해결되지는 않는다. DB snapshot isolation OFF, 전역 isolation 변경, 메모리 증설만으로 이번 lifecycle 결함을 해결하려 하지 않는다.

## 수정 후 검증·추가 계측

- 격리7시나리오를 변경 코드에 적용: handled loop/startup 오류, heartbeat 동시수1, old owner 상태/가격 write0, old owner lock delete0, renewal0의 LOCK_LOST, 락경쟁 대기 동안 새cycle0. 실제 MariaDB 충돌/rollback·제한retry·failover·50초지연/lease expiry·shutdown drain도 별도 테스트.
- 이후 별도 승인·배포 후 image/container identity를 고정해 restartCount **증가0**, 예상 외 exit1/1020 미처리0, heartbeat overlap0, 잘못된owner 갱신0을 목표로 관찰한다. 재배포 재생성으로 카운터가0이 된 것은 통과가 아니다.
- 휴장/시간 외 최소2시간(15초heartbeat와60초loop 반복), 평일 pre/regular/after 전체1거래일, 가능하면2연속거래일에 자연 수집 관찰. 승인된 배포 교체1회와 장기 DB 지연은 격리에서 먼저 검증한다. 오류0만으로 장중 정상 수신을 보장하지 않는다.
- source receipt/SSE publish/DB save의 expected targets·received/stale/failed·cycle duration과 observedAt을 같은 cycle ID로 연결, 재시작 구간 누락·중복을 정량화한다. 작업 완료 순서와 지연 분포를 기록하고 정상휴장/WAITING과 DEGRADED를 분리한다. 동일가격 repeated polling과 동일 cycle 이중처리를 구분한다.
- 추가 필요 로그: instance generation(비밀 token 원문없이 익명표식), 호출경로(timer/idle-loop/cycle/startup/shutdown), in-flight count, error class/MariaDB code/Prisma code, DB operation 소요시간·retry attempt, lease remaining/renew affectedrows/LOCK_LOST, loop rejection·process exit reason 및 signal, 배포시각·image/container ID.
- Docker events를 버퍼에서 사라지기 전에 외부 관측 시스템에 보존하고, 기존 json-file rotation/보존 정책을 별도 계획한다. DB native 재현에서만 SQL template/transaction timing을 계측; 운영 전역 general/slow log는 변경하지 않았다. `performance_schema=OFF`, slow_query_log OFF라 현재 충돌한 writer/transaction pairing은 미확인이다.
- OOM/cgroup swap-in/out, host vmstat/iostat/steal, heartbeat latency를 UTC/KST로 함께 기록해 자원 지연이 경쟁을 키우는지 확인한다. restartCount25가 약9분 안정된 뒤34로 증가했으므로 짧은 안정 관찰만으로 문제해결을 선언하지 않는다.

## 증거와 전달 상태

증거 JSON: [20261011-115455-KST-realtime-restart-db-conflict-analysis.evidence.json](20261011-115455-KST-realtime-restart-db-conflict-analysis.evidence.json). 고정된 이벤트명·KST/UTC 시각·컨테이너상태·역할 프로세스수·격리 재현 결과만 담았다. 원문 stack의 minified Prisma runtime, 요청 URL, 환경변수, 소유자값은 제외했다.

운영 원인/사용자영향과 격리 mock 결과를 분리한 원인확인 보고다. native1020 충돌의 정확한 transaction 쌍과 장중 실누락은 추가 검증이 필요하다. 최소 수정안은 다음 개발·배포 단계의 제안이며 이 문서가 운영 변경 승인은 아니다. PR#137은 초안·미병합 유지, main 병합없음.
