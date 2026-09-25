# Scripts

개발 및 운영 배포를 위한 보조 스크립트를 보관합니다.

## 프론트엔드 수동 배포

서버의 저장소 경로가 `/opt/roxstock`인 경우:

```bash
cd /opt/roxstock
git pull --ff-only origin main
./scripts/deploy.sh sha-f5016c0
```

배포 스크립트는 다음 작업을 순서대로 수행합니다.

1. 지정한 Docker 이미지를 먼저 내려받습니다.
2. 기존 수동 실행 컨테이너를 최초 1회 Compose 관리로 전환합니다.
3. 동일한 포트·메모리·재시작 정책으로 컨테이너를 재생성합니다.
4. Docker health 상태와 localhost HTTP 응답을 확인합니다.

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

배포 시크릿이 하나라도 없으면 이미지 빌드는 완료하고 서버 배포만 건너뜁니다.
