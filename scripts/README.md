# Scripts

개발 및 운영 배포를 위한 보조 스크립트를 보관합니다.

## 프론트엔드 배포

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
