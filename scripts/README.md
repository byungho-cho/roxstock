# Scripts

개발 및 운영 배포를 위한 보조 스크립트를 보관합니다.

## 프론트엔드 수동 배포

서버의 저장소 경로가 `/opt/roxstock`인 경우:

```bash
cd /opt/roxstock
git pull --ff-only origin main
./scripts/deploy.sh sha-f5016c0
```

운영 배포는 `sha-커밋` 태그만 허용합니다. `latest`는 사용하지 않습니다.
`compose.yml`도 `IMAGE_TAG`를 필수로 요구합니다. 스크립트는 실행 위치와 무관하게
저장소의 Compose 파일과 `roxstock` 프로젝트를 명시적으로 사용합니다.

배포 스크립트는 다음 작업을 순서대로 수행합니다.

1. 필수 명령(`docker`, `curl`, `flock`), Docker 접근 및 Compose 설정을 검사하고 동시 배포를 차단합니다. 이전 이미지 태그와 ID를 출력한 뒤 지정한 이미지를 먼저 내려받습니다.
2. 기존 수동 실행 컨테이너를 최초 1회 Compose 관리로 전환합니다.
3. 동일한 포트·메모리·재시작 정책으로 컨테이너를 재생성합니다.
4. 최대 120초 동안 Docker health 상태를 기다린 뒤 시간 제한을 두고 localhost HTTP 응답을 확인합니다.

다른 Compose 프로젝트가 소유한 동명 컨테이너는 오류로 처리합니다.
이미지 다운로드가 실패하면 기존 컨테이너 교체를 시작하지 않습니다.
단일 컨테이너를 교체하므로 짧은 접속 중단이 발생합니다.
배포 스크립트는 이미지 정리나 자동 롤백을 수행하지 않습니다.

### 확인 및 복구

아래 `IMAGE_TAG`에는 실제 배포한 태그를 지정합니다.

```bash
IMAGE_TAG=sha-f5016c0 docker compose -p roxstock -f compose.yml ps
IMAGE_TAG=sha-f5016c0 docker compose -p roxstock -f compose.yml logs --tail=100 frontend
curl --fail --connect-timeout 3 --max-time 10 http://127.0.0.1/
curl --fail --connect-timeout 3 --max-time 10 http://newrox.cafe24.com/
```

외부 도메인은 다른 네트워크의 브라우저에서도 확인합니다.
실패하면 출력된 로그를 확인하고 배포 시작 시 기록한 **이전 SHA 태그**로
`./scripts/deploy.sh sha-이전커밋`을 실행합니다. 이 경로도 Docker Hub 접근이 필요합니다.
검증이 끝날 때까지 이전 이미지를 삭제하지 않습니다.

2026-09-26 작업 시 서버에서 확인한 이미지는 `sha-509dd48`이며,
`roxstock` Compose 프로젝트 소속으로 `running / healthy`였습니다.
인수인계의 `sha-f5016c0`는 최초 배포 예시이며 현재 버전을 의미하지 않습니다.

Docker Hub 비공개 저장소이므로 서버에서 사전에 로그인되어 있어야 합니다.

```bash
docker login -u newrox
```

토큰은 저장소나 스크립트에 기록하지 않습니다.

## GitHub Actions 자동 배포

프론트엔드 변경이 `main`에 push되면 Docker 이미지를 만든 뒤 Cafe24 서버에 SSH로 접속하여 같은 SHA 태그를 배포합니다.

GitHub 저장소의 `Settings → Secrets and variables → Actions → Repository secrets`에 다음 값을 등록합니다.

- `DEPLOY_HOST`: Cafe24 서버 주소
- `DEPLOY_USER`: SSH 사용자명
- `DEPLOY_PORT`: SSH 포트. 비워두면 22
- `DEPLOY_SSH_KEY`: 배포용 SSH 개인키 전체
- `DEPLOY_KNOWN_HOSTS`: 서버의 SSH known_hosts 항목

`DEPLOY_KNOWN_HOSTS` 값은 신뢰할 수 있는 환경에서 다음 명령으로 확인할 수 있습니다.

```bash
ssh-keyscan -p SSH포트 서버주소
```

배포 시 서버에서는 다음 명령이 자동 실행됩니다.

```bash
cd /opt/roxstock
git pull --ff-only origin main
./scripts/deploy.sh sha-현재커밋
```

필수 배포 시크릿(`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS`) 중 하나라도 없으면 이미지 빌드는 완료하고 서버 배포만
건너뜁니다. `DEPLOY_PORT`는 선택 항목이며 기본값은 22입니다.

## 스크립트 검증

Docker나 운영 컨테이너에 접근하지 않는 모의 테스트입니다.

```bash
bash -n scripts/deploy.sh
python3 -B -m unittest discover -s scripts/tests -v
```
