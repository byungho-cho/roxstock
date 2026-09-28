# API 연동 상태

현재 운영 빌드는 목 데이터 모드입니다. 백엔드 배포와 `/api` 프록시 검증을 마친 뒤 빌드 환경에 `VITE_DATA_SOURCE=api`를 지정하면 API 모드가 활성화됩니다. Vite 변수는 빌드 시점에 고정되므로 컨테이너 재시작만으로는 바뀌지 않습니다. 개발 서버는 `VITE_DATA_SOURCE=api npm run dev`로 실행합니다. 인증이 없는 현재 명세에 맞춰 동일 출처의 `/api`를 호출합니다.

| 기능 | 백엔드 경로 | 현재 연결 상태 |
| --- | --- | --- |
| 계좌 선택 | `GET /api/accounts` | 서버 표시 순서의 첫 활성 계좌 사용. 계좌 전환 UI는 미구현 |
| 대시보드 | `GET /api/accounts/:id/dashboard` | 계좌 요약과 보유종목 사용. 응답에 없는 일별·월별 값과 추이는 `—`/빈 영역 |
| 보유 목록 | `GET /api/accounts/:id/holdings` | 서버 수량·가격·손익 사용 |
| 관심·추천 목록 | `GET /api/securities?listType=...` | 서버 목록 사용 |
| 종목 검색 | `GET /api/securities` | 300ms 입력 지연, `excludeRegistered=true&limit=20&offset=0` |
| 관심·추천 등록 | `POST /api/watchlist-items` | 서버 등록 후 목록 다시 조회 |
| 거래내역·매매일지 | `GET /api/accounts/:id/trades` | 월별 날짜 범위 조회, 달력과 거래 요약에 실제 거래 반영 |
| 매도 가능 Lot | `GET /api/accounts/:id/buy-lots` | 계좌·종목별 잔여 Lot 조회, 매도 폼에서 실제 Lot 검증 |
| 매수·매도 등록 | `POST /api/buy-trades`, `POST /api/sell-trades` | 문자열 금액·Lot ID 전달 후 캐시 무효화 |
| 거래 수정·삭제 | 경로 없음 | 아직 연결하지 않음. API 모드에서 모의 거래를 서버 거래로 수정·삭제하지 않음 |
| 직접 종목 등록·현재가 수동 변경 | 공개 경로 없음 | API 모드에서 서버 저장을 가장하지 않음 |
| 현금 내역 조회·수정 | 공개 경로 없음 | 예수금 화면은 아직 목 데이터. 생성 클라이언트 함수만 준비 |

API 모드를 켜기 전에 백엔드 컨테이너 및 같은 출처 `/api` 라우팅, 계좌·종목 시드 데이터와 기존 종목 상세/예수금 화면의 목 데이터 제거를 확인해야 합니다. 운영 Caddy 설정은 `/api`를 `roxstock-backend:3300`으로 보내지만 현 `compose.yml`에는 프론트엔드 서비스만 정의되어 있습니다. API 모드에서 서버가 반환한 금액의 `null`은 0원이 아니라 가격 미제공으로 표시합니다.
