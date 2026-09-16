# Backend

Node.js, Fastify, TypeScript 기반 API 및 데이터 수집 서버 디렉터리입니다.

## 실행 환경

- Node.js 20 이상
- MariaDB
- Prisma 6

## 로컬 실행

```bash
cp backend/.env.example backend/.env
npm install
npm run prisma:generate
npm run dev:backend
```

기본 서버 주소는 `http://localhost:3300`입니다.

## 상태 확인

- `GET /health`: API 서버 상태
- `GET /health/db`: MariaDB 연결 상태

## 주요 명령어

```bash
npm run typecheck:backend
npm run build:backend
npm run prisma:validate
npm --workspace backend run prisma:migrate:dev -- --name init
```

최초 마이그레이션은 `DATABASE_URL`에 지정한 MariaDB가 실행 중일 때 생성합니다.
