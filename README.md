# RoxStock

개인용 주식 매매일지 웹 서비스입니다.

## 기술 구성

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Fastify + TypeScript
- Database: MariaDB
- Deployment: Docker Compose + GitHub Actions + Cafe24 가상서버

## 디렉터리

- `frontend/`: React 웹 애플리케이션
- `backend/`: Fastify API 및 데이터 수집 서버
- `database/`: DB 스키마와 마이그레이션 자료
- `infra/`: Docker, Nginx 및 배포 설정
- `docs/`: 설계 및 운영 문서
- `scripts/`: 개발·배포 보조 스크립트
- `.github/workflows/`: CI/CD 워크플로

운영 프론트엔드 배포와 복구 절차는 [배포 안내](scripts/README.md)를 참고하세요.


개발·기본 검사·자동 배포 및 요청 시 QA 절차는 [GitHub Actions 작업 기준](.github/workflows/README.md)을 따릅니다.
