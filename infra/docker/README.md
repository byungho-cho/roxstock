# Docker

애플리케이션별 Dockerfile과 Docker 관련 설정을 관리합니다.

## 개발용 MariaDB

MariaDB 11.8 LTS를 사용합니다. 아래 명령은 저장소 루트에서 실행합니다.

```bash
cp infra/docker/.env.example infra/docker/.env
docker compose --env-file infra/docker/.env -f infra/docker/compose.dev.yml up -d
docker compose --env-file infra/docker/.env -f infra/docker/compose.dev.yml ps
```

`backend/.env`의 접속 정보도 Docker 환경변수와 동일하게 맞춥니다.

```env
DATABASE_URL="mysql://roxstock:change-me@localhost:3306/roxstock"
```

## 최초 마이그레이션

```bash
npm run prisma:migrate:deploy
```

## 종료

```bash
docker compose --env-file infra/docker/.env -f infra/docker/compose.dev.yml down
```

데이터까지 완전히 삭제해야 할 때만 `down --volumes`를 사용합니다.
