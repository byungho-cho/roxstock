# API 연동 상태

운영 빌드의 기본값은 목 데이터 모드입니다. 테스트 빌드는 `docker build --build-arg VITE_DATA_SOURCE=api -f frontend/Dockerfile .`로 만들며, 변경을 운영에 배포하지 않습니다. Vite 변수는 빌드 시점에 고정되므로 컨테이너 재시작만으로는 바뀌지 않습니다. 개발 서버는 `VITE_DATA_SOURCE=api npm run dev`로 실행합니다. `VITE_API_ACCOUNT_ID`를 지정하면 해당 활성 계좌만 사용하고, 생략하면 서버 표시 순서의 첫 활성 계좌를 사용합니다. 인증이 없는 현재 명세에 맞춰 동일 출처의 `/api`를 호출합니다.

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
| 거래 수정·삭제 | `PATCH/DELETE /api/{buy,sell}-trades/:id` | 백엔드는 제공하지만 프론트 상세 폼 미연결. 계좌 예수금·과거 스냅샷 자동 보정 없음 |
| 직접 종목 등록·현재가 수동 변경 | 공개 경로 없음 | API 모드에서 서버 저장을 가장하지 않음 |
| 입금·출금 등록 | `POST /api/cash-transactions` | API 모드 예수금 화면에서 등록, 이후 계좌 요약 재조회 |
| 현금 내역 조회·수정·배당 | 공개 경로 없음 | API 모드에 목 내역을 표시하지 않음. 집계·직접 잔액 수정 비활성 |

테스트 계좌는 별도 MariaDB 서비스에서 생성되며 운영 계좌에 쓰지 않습니다. `.github/workflows/frontend-api-integration.yml`은 API 모드 이미지 빌드와 화면 검증만 수행하고 이미지를 게시하거나 운영 서버에 배포하지 않습니다. 운영 Caddy는 `/api`를 `roxstock-backend:3300`으로 보냅니다. API 모드에서 서버가 반환한 금액의 `null`은 0원이 아니라 가격 미제공으로 표시합니다.

백엔드 추가 요청: `GET /api/{buy,sell}-trades/:id` 또는 거래 통합 조회의 ID 필터(거래 상세 직접 URL/새로고침을 위해), 계좌 현금 거래내역 및 기간 집계 조회, 예수금 잔액 보정 API, 배당 API, 대시보드 일별·월별 손익과 과거 자산 추이 API. 연결 전까지 해당 숫자는 임의 계산하지 않습니다.
