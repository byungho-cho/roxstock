# Firebase 서버 적용 결과 및 발송 준비 상태

갱신일: 2026-10-21 (KST). 실제 운영 적용 시각은 사용자에게 미제공되어 미확인.
관련: [PR #294](https://github.com/byungho-cho/roxstock/pull/294) (병합 완료).
판정: **서버 적용 완료(사용자 운영 SSH 실행 결과), OAuth 및 FCM 발송 권한 검증 필요.**

## 증거 출처별 결과

| 항목 | 사용자 운영 SSH 실행 결과 | 담당자 직접 확인 |
|---|---|---|
| 원본 키 | /root/roxstock-secrets/fcm-service-account.json | 이번 작업에서 원문 열람 없음 |
| 런타임 키 | /opt/roxstock/.deploy/runtime/fcm-service-account.json, UID/GID 1000:1000, 모드 600 | 운영 메타데이터 재확인 불가 |
| 앱 사용자 | uid=1000(node), gid=1000(node) | 운영 재확인 불가 |
| 키 읽기/JSON | readable=true, projectMatches=true, privateKeyPresent=true, clientEmailPresent=true | 운영 재확인 불가 |
| 프로젝트 | roxstock-ef8ef | 운영 재확인 불가 |
| 마운트 | /opt/roxstock/.deploy/runtime → /run/roxstock, RW=false | 저장소 템플릿에 backend 런타임 :ro 연결 확인; 운영 재확인 불가 |
| 환경변수 | FCM_SERVICE_ACCOUNT_FILE=/run/roxstock/fcm-service-account.json, fcmPathMatches=true | 운영 재확인 불가 |
| 재생성 | 같은 이미지로 backend만 재생성 | 운영 재확인 불가 |
| 실행/헬스 | running / healthy | 운영 재확인 불가 |
| OAuth | 결과 미제공 | 미수행 |
| FCM HTTP v1 API 활성화 | 결과 미제공 | 미확인 |
| 발송 권한 | 결과 미제공 | 미확인 |
| SMTP·인증·DB 보존 | 기존 파일 백업 후 경로 설정 추가 | 값 비교·기능 검증 미수행 |
| 다음 배포 유지 | 원본과 현재 배포 작업 디렉터리 양쪽 .env.auth 수정 | 저장소의 복사·마운트 구조 확인; 실제 다음 배포 미검증 |
| 실제 발송·실기기 수신·클릭 이동 | 후속 검증 예정 | 이번 범위에서 수행하지 않음 |

사용자는 다음 두 파일을 비공개 백업한 뒤 FCM 경로 항목을 추가했다고 전달했다.
- /opt/roxstock/backend/.env.auth
- /opt/roxstock/.deploy/commits/22001ac9c3da8f3dbb7ac492c511e492baf76e93/backend/.env.auth

이 보고서는 사용자 실행 결과를 직접 운영 점검으로 표현하지 않는다.
운영 SSH 목적지 정보가 제공되지 않아 담당자는 운영 SSH에 접속하지 못했다.
이전 별도 실행 환경의 Docker 접근·sudo 초기화 실패를 운영 서버 장애로 해석하지 않는다.
이번 작업에서 Docker/sudoers/키/환경변수/서비스를 변경하지 않았다.

## 담당자가 직접 확인한 배포 코드

- infra/docker/compose.prod-backend.yml: backend만 backend/.env.auth를 읽는다.
  backend만 런타임 디렉터리를 /run/roxstock:ro로 연결한다.
  기본 호스트 경로는 /opt/roxstock/.deploy/runtime이며 ROXSTOCK_RUNTIME_DIR로 변경 가능하다.
  수집기들의 env_file에는 .env.auth가 없다.
- scripts/deploy-production-component.sh: 원본 /opt/roxstock/backend/.env.auth와 .env.production을
  배포 커밋 작업 디렉터리에 install -m 600으로 복사한다.
  런타임 디렉터리를 유지하며 release.json만 별도 교체한다.
  확인한 코드에는 fcm-service-account.json 삭제/덮어쓰기 단계가 없다.
- scripts/deploy-service.sh: 배포 작업 디렉터리의 Compose 템플릿으로 실행한다.
  이번 확인을 위해 이 스크립트를 실행하지 않았다. 배포 래퍼에는 DB 마이그레이션 등이 있어
  이번 읽기 전용 검증에 사용하면 안 된다.

따라서 원본 .env.auth가 유지되고, 운영 배포가 확인한 스크립트/템플릿을 사용하며
런타임 경로가 바뀌지 않는 조건에서는 FCM 경로·키 연결이 다음 배포에도 유지되는 구조다.
운영의 실제 배포 코드 버전, 경로 재정의, 외부 정리 작업 및 다음 배포 결과는 미확인이다.
현재 작업 디렉터리의 .env.auth만 수정하는 것으로는 향후 유지가 보장되지 않는다.
기존 디렉터리 마운트를 활용했으므로 별도의 키 파일 마운트를 추가할 필요가 없다.

## 운영 SSH에서 실행할 읽기 전용 재확인

root 계정은 sudo를 생략할 수 있다. set -x를 사용하지 않는다.
아래 명령은 전체 환경변수·키·토큰·원본 운영 로그를 출력하지 않는다.

```bash
sudo docker inspect roxstock-backend --format 'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
sudo docker inspect roxstock-backend --format '{{range .Mounts}}{{if eq .Destination "/run/roxstock"}}runtimeMount source={{.Source}} RW={{.RW}}{{end}}{{end}}'
sudo docker exec --user 1000:1000 roxstock-backend node -e '
const fs=require("node:fs");
try {
  const path=process.env.FCM_SERVICE_ACCOUNT_FILE;
  const matched=path==="/run/roxstock/fcm-service-account.json";
  if (!matched) throw new Error();
  fs.accessSync(path, fs.constants.R_OK);
  const key=JSON.parse(fs.readFileSync(path,"utf8"));
  console.log(JSON.stringify({
    uid:process.getuid(), gid:process.getgid(),
    fcmPathMatches:matched, readable:true,
    projectMatches:key.project_id==="roxstock-ef8ef",
    privateKeyPresent:typeof key.private_key==="string" && key.private_key.length>0,
    clientEmailPresent:typeof key.client_email==="string" && key.client_email.length>0
  }));
} catch { console.log("keyReadCheck=FAIL"); process.exitCode=1; }
'
```

이번 운영 구성은 개별 파일이 아닌 상위 디렉터리가 마운트되어 있다.
개별 파일 목적지에 해당하는 Mounts 항목이 없어도 실패로 판단하지 않는다.
실제 앱 사용자도 1000:1000인지 운영에서 재확인한다.

## OAuth·발송 권한·API 상태 조회 (발송 없음)

다음은 서비스 계정 키를 컨테이너 내부에서 읽고 토큰을 메모리에서만 사용한다.
실제 발송 엔드포인트, validate_only 요청, 테스트 이벤트, 기기 토큰을 사용하지 않는다.
OAuth에는 firebase.messaging과 조회용 cloud-platform.read-only 스코프를 요청한다.
스코프 요청 자체는 IAM 권한을 추가하지 않으며, IAM 정책을 변경하지 않는다.

```bash
sudo docker exec --user 1000:1000 -i roxstock-backend node <<'NODE'
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
      scope:'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/cloud-platform.read-only',
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
  async function query(label, url, body) {
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer '+data.access_token,
          ...(body ? {'Content-Type':'application/json'} : {})
        },
        ...(body ? {body:JSON.stringify(body)} : {}),
        signal:AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        console.log(label+': UNKNOWN HTTP '+response.status);
        return null;
      }
      return await response.json();
    } catch {
      console.log(label+': UNKNOWN (request failed)');
      return null;
    }
  }
  const permission = 'cloudmessaging.messages.create';
  const iam = await query('FCM permission',
    'https://cloudresourcemanager.googleapis.com/v1/projects/roxstock-ef8ef:testIamPermissions',
    {permissions:[permission]});
  if (iam) console.log('FCM permission: '+
    (iam.permissions?.includes(permission) ? 'PASS' : 'NOT_CONFIRMED'));
  const project = await query('Project metadata',
    'https://cloudresourcemanager.googleapis.com/v1/projects/roxstock-ef8ef');
  if (project?.projectNumber && /^\\d+$/.test(String(project.projectNumber))) {
    const service = await query('FCM API',
      'https://serviceusage.googleapis.com/v1/projects/'+project.projectNumber+'/services/fcm.googleapis.com');
    if (service) console.log('FCM API: '+
      (service.state === 'ENABLED' ? 'ENABLED' : service.state === 'DISABLED' ? 'DISABLED' : 'UNKNOWN'));
  } else {
    console.log('FCM API: UNKNOWN (project metadata unavailable)');
  }
})().catch(()=>{
  console.error('검증: FAIL (원문 오류·응답은 출력하지 않음)');
  process.exitCode=1;
});
NODE
```

결과 해석:
- OAuth PASS는 이 키로 토큰 발급이 성공했다는 뜻이다. API·권한 확인을 대체하지 않는다.
- FCM permission PASS는 해당 서비스 계정으로 대상 프로젝트의
  cloudmessaging.messages.create를 testIamPermissions에서 확인했다는 뜻이다.
- NOT_CONFIRMED는 해당 조회에서 권한이 확인되지 않았다는 뜻이다.
  관리자 정책 검토 전에는 자동으로 역할을 추가하거나 기존 권한을 제거하지 않는다.
- FCM API ENABLED와 permission PASS는 각각 별도 항목으로 기록한다.
- UNKNOWN/HTTP 오류는 조회 권한 부족, API 설정, 네트워크 등 때문에 확인하지 못한 상태다.
  403을 FCM 비활성화나 발송 권한 부재로 단정하지 않는다.
  서비스 계정에 조회용 관리자 권한을 추가하지 말고 기존 관리자 세션에서 확인한다.
- 상태 조회에 필요한 프로젝트 번호를 못 얻으면 API는 UNKNOWN으로 남긴다.

서비스 계정에 조회 권한이 없을 때, 기존 권한 있는 관리자 gcloud 세션에서 다음을 실행한다.
로그인 계정을 임의로 바꾸거나 키를 gcloud 계정으로 등록하지 않는다.

```bash
gcloud services list --enabled --project=roxstock-ef8ef \
  --filter='config.name=fcm.googleapis.com' --format='value(config.name)'
```

이 명령은 성공 시 fcm.googleapis.com 출력으로 활성화를 확인한다.
출력이 없을 때는 종료 코드와 관리자 권한을 함께 확인하고 자동 활성화하지 않는다.
권한 실패 시 Google Cloud 콘솔의 Enabled APIs 또는 Firebase Cloud Messaging 설정에서 확인한다.
IAM 관리자에게는 키의 서비스 계정을 서버 내부에서 식별해
대상 프로젝트 cloudmessaging.messages.create의 유효 권한을 조건·상속·거부 정책과 함께 검토하도록 한다.
과도한 역할은 최소 권한 검토 대상으로만 기록하며 기존 권한을 임의로 제거하지 않는다.

## 재배포 유지 및 기존 설정 보존 점검

운영의 Compose 라벨에서 실제 파일 위치·작업 디렉터리를 확인한다.
원본 .env.auth와 현재 작업 디렉터리 파일을 서버 내부에서 파싱해 FCM 경로 일치를 불리언으로만 출력한다.
중복 FCM 키, environment의 덮어쓰기 및 별도 env_file 순서도 확인한다.
기존 배포 코드에 .env.auth 복사와 backend 전용 런타임 :ro 연결이 존재하는지 확인한다.
다른 컨테이너의 마운트를 서버 내부에서 점검해 키 디렉터리 또는 상위 경로가 노출되지 않았는지 확인한다.
전체 환경변수/Compose/inspect 원문은 보고서에 올리지 않는다.

비공개 변경 전 백업과 두 .env.auth 파일을 파싱해 FCM_SERVICE_ACCOUNT_FILE을 제외한
모든 키/값이 동일한지 비교한다. 중복 키가 있으면 검토 필요로 표시한다.
비교 결과는 authEnvOtherValuesPreserved=true/false처럼 불리언만 공유한다.
.env.production 변경 여부도 비공개 백업이 있다면 값 출력 없이 비교한다.
백업이 없으면 과거 설정 보존 여부는 미확인으로 남긴다.
running/healthy만으로 로그인·SMTP·DB 정상까지 입증하지 않는다.
이번에는 로그인 상태 변경, 메일 발송, DB 보정, 재수집, 수집기 변경을 수행하지 않는다.

## 설정 복구 절차

1. 현재 정상 실행 중이므로 검증 미완료만을 이유로 복구하지 않는다.
2. 복구가 필요하면 사용자 비공개 백업의 실제 경로와 생성 시각을 확인한다.
   이후 다른 정당한 변경이 없을 때만 두 .env.auth 백업을 각각 원래 위치에 복원한다.
   이후 변경이 있으면 전체 파일을 덮어쓰지 말고 FCM 항목만 이전 상태로 병합한다.
3. 동일 이미지, 기존 Compose 파일 목록·프로젝트명·환경변수·네트워크·볼륨·재시작 정책을 보존해
   backend만 up -d --no-deps --force-recreate --pull never로 재생성한다.
   실제 호출 옵션은 운영 라벨과 기존 실행 기록으로 확정한다.
   DB 마이그레이션을 포함하는 정기 배포 래퍼를 이번 복구에 사용하지 않는다.
4. running/healthy 및 기존 구성 복귀를 확인한다. 수집기·DB는 재시작하지 않는다.
5. 기존 /run/roxstock 디렉터리 마운트는 원래 구성의 일부이므로 제거하지 않는다.
   원본 키·런타임 키를 무조건 삭제하거나 공개하지 않는다.
   기존 데이터와 알림 이력을 보존한다.

## 후속 작업

운영 SSH에서 위 읽기 전용 검증을 실행한 요약 결과를 받아 OAuth/API/권한 항목을 갱신해야 한다.
다음 정기 배포 때 FCM 경로·키 읽기·RW=false를 다시 확인한다.
실제 발송·실기기 수신·클릭 이동: **후속 검증 예정**.
Firebase 연결값 등록과 APK 재빌드는 개발 측 별도 작업이다.
서버 설정 완료를 전체 푸시 기능 완료로 보고하지 않는다.

## 확인에 사용한 공식 문서

- [testIamPermissions](https://docs.cloud.google.com/resource-manager/reference/rest/v1/projects/testIamPermissions): 호출 주체의 프로젝트 권한 조회
- [Service Usage services.get](https://docs.cloud.google.com/service-usage/docs/reference/rest/v1/services/get): 서비스 활성화 상태 조회와 조회 권한
- [Firebase IAM permissions](https://firebase.google.com/docs/projects/iam/permissions): FCM 발송 권한
