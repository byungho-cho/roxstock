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
- `backend/`: Fastify 인증·조회·저장 API
- `collector/`: 독립 수집 실행 서비스
- `shared/`: 공통 DB·계산·검증·타입
- `database/`: DB 스키마와 마이그레이션 자료
- `infra/`: Docker, Nginx 및 배포 설정
- `docs/`: 설계 및 운영 문서
- `scripts/`: 개발·배포 보조 스크립트
- `.github/workflows/`: CI/CD 워크플로

운영 프론트엔드 배포와 복구 절차는 [배포 안내](scripts/README.md)를 참고하세요.


개발·기본 검사·자동 배포 및 요청 시 QA 절차는 [GitHub Actions 작업 기준](.github/workflows/README.md)을 따릅니다.

## 현재 개발 기준 · 2026.11.01

[현행 기획·설계·개발 정본](docs/current-state-20261101.md) · [화면번호·디자인](docs/screens-current-20261030.md) · [전체 문서](docs/document-catalog-20261101.md).

코드 **v1.2.54**. 실시간 주가는 한투 웹소켓·약 1초 숫자 갱신, 표시종목 일괄 관리·순서 편집·최초 저장값 표시까지 구현·운영 반영됐습니다. 대시보드 자산구성·백업 날짜·공통 토스트 및 종목소식 NEW·읽음도 현행 정본에 반영했습니다. DB 테이블 고도화는 별도 논의 대상입니다.

작업별 최신 사용자 지시가 우선하며 구현·병합·배포·운영 검증을 구분합니다. 이번 변경은 문서 현행화이며 앱 버전·APK·DB·수집 스케줄을 변경하지 않습니다.
