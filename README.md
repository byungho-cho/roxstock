# RoxStock

개인용 주식 매매일지 웹 서비스입니다.

## 기술 구성

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Fastify + TypeScript
- Database: MariaDB
- Deployment: Docker Compose + GitHub Actions + Cafe24 가상서버

## 디렉터리

- `frontend/`: React 웹 애플리케이션
- [`android-app/`](android-app/README.md): 앱 개발 — 웹을 감싼 안드로이드 앱 및 체결 알림 등록 보조
- `backend/`: Fastify API 및 데이터 수집 서버
- `database/`: DB 스키마와 마이그레이션 자료
- `infra/`: Docker, Nginx 및 배포 설정
- `docs/`: 설계 및 운영 문서
- `scripts/`: 개발·배포 보조 스크립트
- `.github/workflows/`: CI/CD 워크플로

운영 프론트엔드 배포와 복구 절차는 [배포 안내](scripts/README.md)를 참고하세요.


개발·기본 검사·자동 배포 및 요청 시 QA 절차는 [GitHub Actions 작업 기준](.github/workflows/README.md)을 따릅니다.

## 현재 개발 기준

[개발·잔여 작업 현황](docs/개발현황.md) · [28·29차 현행 명세](docs/handoff/20261014-phase28-29-current.md) · [문서 목록](docs/README.md).
28·29차는 main 병합·배포 시작까지 진행했습니다. 기본 종료 기준은 필수 검사 통과 후 병합·배포 시작 확인이며, 배포 완료 대기·운영 적용 확인은 생략합니다. 문서만 변경하면 중복 운영 배포하지 않습니다.

서비스 구조와 독립 실행·배포·롤백: [수집기 분리 운영 문서](docs/collector-service-split.md). `collector/`는 수집 실행, `shared/`는 공통 DB·타입·계산을 담당합니다.
