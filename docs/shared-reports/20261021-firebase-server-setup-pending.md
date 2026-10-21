# Firebase 푸시 서버 설정: 접근 차단 및 운영 실행 절차

작성 시각: 2026-10-21 16:10 KST. 이 시각은 점검 시각이며 적용 시각이 아니다.
프로젝트: roxstock-ef8ef. 대상: roxstock-backend.

## 실제 결과

| 항목 | 결과 |
|---|---|
| 서버 설정 적용 / 적용 시각 | 미적용 / 없음 |
| 키 파일 메타데이터 | 현재 작업 환경에서 root:root, 600 확인. 운영 SSH에서 재확인 필요 |
| 프로젝트 ID / 실행 사용자 키 읽기 | 미확인 |
| 읽기 전용 마운트 / 환경변수 | 미확인 |
| 백엔드 실행 / 헬스 | 미확인 |
| 기존 로그인·API·메일 설정 유지 | 변경하지 않음. 운영 기능 검증 미수행 |
| OAuth 인증 | 미수행 |
| FCM HTTP v1 API 활성화 / 발송 권한 | 미확인 / 미확인 |
| 이후 배포 유지 | 미반영 |
| 실제 발송 / 실기기 수신·클릭 | 미수행 / 미수행 |

현재 실행 환경에서 Docker 소켓 접근이 거부되고 sudo 초기화도 실패했다.
운영 서버 SSH 목적지 정보가 없어 실제 운영 SSH 연결은 시도하지 않았다.
Docker 소켓·sudoers·운영 설정·키 권한·서비스·데이터·알림 이력은 변경하지 않았다.
전체 푸시 기능 완료 보고가 아니다.

## 운영 SSH에서 먼저 실행할 점검

아래는 읽기 전용 점검이다. root 계정이면 sudo를 생략한다.
셸 추적(set -x)을 사용하지 않는다. 전체 inspect, 환경변수, Compose 렌더링 원문을 공유하지 않는다.

```bash
sudo docker inspect roxstock-backend --format 'service={{index .Config.Labels "com.docker.compose.service"}}
project={{index .Config.Labels "com.docker.compose.project"}}
working_dir={{index .Config.Labels "com.docker.compose.project.working_dir"}}
config_files={{index .Config.Labels "com.docker.compose.project.config_files"}}
configured_user={{.Config.User}}
image={{.Config.Image}}'

sudo docker exec roxstock-backend node -e '
const fs=require("node:fs");
const s=fs.readFileSync("/proc/1/status","utf8");
console.log(s.split("\n").filter(x=>/^(Name|Uid|Gid|Groups):/.test(x)).join("\n"));
console.log("exec_uid="+process.getuid()+" exec_gid="+process.getgid());
'
sudo docker inspect roxstock-backend --format '{{range .Mounts}}{{println .Type .Source "->" .Destination "RW=" .RW}}{{end}}'
sudo readlink -f /root/roxstock-secrets/fcm-service-account.json
sudo stat -c '%n owner=%u:%g mode=%a' /root/roxstock-secrets/fcm-service-account.json
command -v getenforce >/dev/null && getenforce
```

PID 1이 래퍼이면 실제 Node 프로세스의 /proc/<PID>/status도 확인한다.
실제 앱과 docker exec의 UID/GID가 다르면 키 검증에 docker exec --user UID:GID를 사용한다.
운영 Compose 파일과 배포 스크립트를 서버 내부에서 읽어 env_file 경로, 프로젝트명,
Compose 파일 순서, --env-file, 이미지 변수 및 재시작 정책을 확인한다.
민감한 값은 출력하거나 보고서에 옮기지 않는다.

## 설정 백업 및 반영

1. 서버 비공개 디렉터리를 root 소유 700으로 만들고 변경할 Compose 원본과 배포 스크립트를
   cp -a로 백업한다. 백업 파일은 600으로 제한한다. 저장소나 공개 웹 디렉터리에 백업하지 않는다.
   기존 키 소유자·모드 및 SELinux 컨텍스트도 비공개 기록에 남긴다.
2. 키 JSON을 서버 내부에서 파싱해 project_id가 roxstock-ef8ef인지 비교하고 PASS/FAIL만 출력한다.
3. 실제 앱 UID가 0이면 기존 root:root 600을 유지한다.
   비root 앱이면 검증한 실제 GID에 한해 root:GID 640 등 최소 읽기 권한을 부여한다.
   UID 매핑 또는 SELinux 사용 시 호스트 숫자 GID만으로 접근을 보장한다고 판단하지 않는다.
4. 키를 런타임 경로로 복사해야 한다면 프론트엔드·수집기와 공유되는 디렉터리에 넣지 않는다.
   SELinux Enforcing이면 해당 파일 접근 거부 여부를 서버 내부에서 확인한다.
   정책에 맞춰 해당 파일만 처리하며 SELinux를 끄거나 상위 디렉터리를 재귀 relabel하지 않는다.
5. 실제 운영 Compose의 backend에만 다음 항목을 기존 항목에 병합한다.
   기존 environment/volumes 키를 중복 생성하거나 전체 내용을 교체하지 않는다.

```yaml
services:
  backend:
    environment:
      FCM_SERVICE_ACCOUNT_FILE: /run/roxstock/fcm-service-account.json
    volumes:
      - type: bind
        source: /root/roxstock-secrets/fcm-service-account.json
        target: /run/roxstock/fcm-service-account.json
        read_only: true
        bind:
          create_host_path: false
```

기존 /run/roxstock 디렉터리 마운트가 있으면 반드시 유지하고 개별 파일 연결을 검증한다.
키가 다른 서비스에도 노출되는 공유 경로를 source로 사용하지 않는다.
구형 Compose에서 create_host_path를 지원하지 않으면 버전을 확인한 뒤 호환 문법을 선택한다.
다음 배포가 Compose 파일을 덮어쓴다면 배포에서 사용하는 저장소 원본에도 같은 설정을 반영한다.
일회성 override 파일만 만들고 배포 스크립트에 포함하지 않는 방식은 완료로 인정하지 않는다.
키 JSON은 저장소·이미지·빌드 컨텍스트에 넣지 않는다.

## 백엔드만 재생성

기존 배포의 작업 디렉터리, 프로젝트, Compose 파일 순서, 환경 파일 및 이미지 변수를 그대로 사용한다.
먼저 config --quiet로 구문을 검사한다. config 원문을 공개하지 않는다.
서버 내부에서 변경 전후 렌더링을 비교해 backend의 FCM 환경변수와 키 마운트 외 차이가 없는지 확인한다.
렌더링을 저장한다면 비공개 600 파일로만 저장한다.
이미지 ID, 기존 환경변수 값, 기존 마운트·네트워크·재시작 정책도 비밀값 출력 없이 비교한다.

기존 Compose 호출에 붙일 인수:
- 구문 확인: config --quiet
- 적용: up -d --no-deps --force-recreate --pull never <확인한 backend 서비스명>

이는 완성된 명령이 아니다. 위 점검 결과로 기존 호출 옵션을 확인한 뒤 실행한다.
동시에 이미지 태그를 변경하거나 build, down, 전체 서비스 재시작을 수행하지 않는다.
기존 이미지가 같은 태그로 교체되지 않았는지도 재생성 전에 확인한다.
SMTP·인증·DB·수집기 환경 파일 전체를 덮어쓰지 않는다.

## 비밀값을 출력하지 않는 적용 검증

```bash
sudo docker inspect roxstock-backend --format '{{range .Mounts}}{{if eq .Destination "/run/roxstock/fcm-service-account.json"}}FCM mount RW={{.RW}}{{end}}{{end}}'
sudo docker inspect roxstock-backend --format 'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
```

마운트 출력이 없으면 실패이며 기대값은 RW=false다.
전체 컨테이너의 마운트 목록을 서버 내부에서 검사해 키가 backend에만 연결됐는지 확인한다.
백엔드는 running, 헬스체크가 있으면 healthy를 확인한다.

아래 명령은 실제 앱과 exec 사용자가 동일함을 확인한 후 실행한다.
다르면 docker exec에 --user UID:GID를 추가한다.

```bash
sudo docker exec -i roxstock-backend node <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
(async () => {
  const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
  if (file !== '/run/roxstock/fcm-service-account.json') throw new Error();
  const key = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (key.project_id !== 'roxstock-ef8ef') throw new Error();
  console.log('환경변수·키 읽기·프로젝트: PASS');
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const input = [
    enc({alg:'RS256',typ:'JWT'}),
    enc({
      iss:key.client_email,
      scope:'https://www.googleapis.com/auth/firebase.messaging',
      aud:'https://oauth2.googleapis.com/token',
      iat:now, exp:now+3600
    })
  ].join('.');
  const sig = crypto.sign('RSA-SHA256',Buffer.from(input),key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:input+'.'+sig
    }),
    signal:AbortSignal.timeout(15000)
  });
  if (!res.ok) {
    console.log('OAuth: FAIL HTTP '+res.status);
    process.exitCode=1;
    return;
  }
  const data = await res.json();
  if (!data.access_token) throw new Error();
  console.log('OAuth: PASS');
})().catch(()=>{
  console.error('검증: FAIL (원문 오류·응답은 출력하지 않음)');
  process.exitCode=1;
});
NODE
```

OAuth 결과만으로 FCM 활성화·발송 권한을 PASS 처리하지 않는다.
권한이 있는 관리자 세션에서 프로젝트 roxstock-ef8ef의 fcm.googleapis.com 활성화 여부를 확인한다.
서비스 계정에 대상 프로젝트의 cloudmessaging.messages.create 권한이
역할·조건·상위 정책을 고려해 유효한지 확인한다.
관리자 권한이 없거나 정책을 확인할 수 없으면 미확인으로 기록한다.
키·액세스 토큰·기기 토큰을 CLI 인수, 셸 이력, 보고서에 넣지 않는다.

기존 로그인/API는 테스트 계정과 알려진 정상 요청으로 확인하고 결과 코드만 기록한다.
메일은 기존 설정의 값이 변경되지 않았는지 비공개 비교하고,
실제 전송은 승인된 테스트 수신자에게만 수행한다. 미수행 항목은 미확인으로 보고한다.

## 복구

문제가 생기면 변경 전 백업 Compose/배포 스크립트를 원래 위치에 복원한다.
같은 환경 파일·프로젝트·이미지와 기존 Compose 호출 옵션으로 backend만
up -d --no-deps --force-recreate --pull never 재실행한다.
이미지를 새 버전으로 교체하거나 DB/수집기를 재시작하지 않는다.
원래 마운트·환경·네트워크·재시작 정책과 running/healthy 복귀를 확인한다.
키 권한/SELinux 컨텍스트도 필요한 경우 기록한 원래 값으로 되돌린다.
배포 원본에 변경을 반영했다면 해당 변경도 되돌려 다음 배포에서 재적용되지 않게 한다.
기존 데이터·알림 이력을 삭제하거나 키를 무조건 삭제하지 않는다.

## 남은 작업과 보고 갱신

운영 SSH 점검 결과를 바탕으로 정확한 Compose 명령을 확정하고 설정·배포 원본을 반영해야 한다.
완료 후 위 표를 실제 결과와 적용 시각(KST)으로 갱신한다.
운영 검증 증거 없이 이 보고서의 미확인 항목을 완료로 바꾸지 않는다.
실제 발송은 개발 담당과 테스트 기기·시점을 맞춘 단일 테스트로만 수행한다.
FCM 요청 접수와 실기기 수신·클릭 이동 성공을 별도로 기록한다.
기존 목표가 도래·과거 소식 또는 전체 사용자 일괄 알림은 발송하지 않는다.
Firebase 연결값 등록·APK 재빌드·실기기 수신·클릭 이동 검증은 개발 측 별도 작업이다.
