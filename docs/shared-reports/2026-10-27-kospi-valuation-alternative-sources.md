# 코스피 77종목 가치지표 대체 수집 경로 조사

조사일: 2026-10-27. 대상은 앞서 운영 점검에서 남은 코스피 77종목·2025년 연간 누락 141필드입니다. 이번 작업은 **읽기 전용 조사**이며 운영 DB·기존 지표·수집 제외·자동 수집 설정을 변경하지 않았습니다.

## 결과

**73종목·131개 누락 항목에서 대체 수치가 확인됐습니다.** 이는 원천 화면에서 수치가 제공된다는 뜻이며, 131필드 모두 기존 값과 함께 바로 저장할 수 있다는 의미는 아닙니다.

| 경로 | 누락 항목에 대한 수치 확인 | 비고 |
|---|---|---|
| 네이버 기업분석 연간 표 | 64종목·115필드 | 2025년 확정 연간 열. 기존 수집 모듈 재사용 |
| FnGuide 새 투자지표 화면 | 71종목·124필드 | 실제 저장 공시의 결산월과 일치하는 EPS/BPS·PER/PBR 열 |
| 다음 금융 연간 재무 | 77종목에서 2025년 표기 YEAR 자료 | 기존 결산월이 맞는 누락 EPS 6개·ROE 3개 확인. 다른 경로와 중복 |

경로별 종목·필드 수는 중복되므로 합산하지 않습니다. 통합 수치 확인 범위는 다음과 같습니다.

| 지표 | 기존 누락 | 대체 수치 확인 | 해당 수치 미확보 |
|---|---:|---:|---:|
| EPS | 7 | 7 | 0 |
| BPS | 32 | 32 | 0 |
| ROE | 5 | 3 | 2 |
| PER | 59 | 54 | 5 |
| PBR | 38 | 35 | 3 |

## 확인한 실제 경로

- [네이버 기업분석 — 두산](https://navercomp.wisereport.co.kr/v3/company/c1010001.aspx?cmp_cd=000150): 공개 페이지가 호출하는 연간 표를 확인했습니다. 추정 열·현재가 PER를 2025년 확정 연간 값으로 사용하지 않았습니다.
- [FnGuide 새 투자지표 — 두산](https://wcomp.fnguide.com/CompanyInfo/Invest?cmp_cd=000150): 기존 `comp.fnguide.com` 페이지는 새 주소를 안내하며, 새 화면의 공개 JSON 자료에서 과거 EPS/BPS와 배수를 확인했습니다. 공개 스크립트는 실행하지 않고 JSON만 해석했습니다.
- [다음 금융 — 두산](https://finance.daum.net/quotes/A000150): 공개 화면의 `api/quote/A000150/financials` 경로에서 YEAR/QUARTER 자료가 확인됩니다. 이 경로에는 BPS·PER·PBR 필드가 없으므로 현재 시세 배수를 과거 배수로 대체하지 않았습니다.

## 바로 대입하기 전에 필요한 검증

1. **분모·주가 기준:** 포털의 EPS/BPS에는 수정 주식수, 보통주·우선주 및 자기주식 처리 기준이 반영됩니다. 기존 EPS/BPS를 유지하면서 다른 분모의 PER/PBR만 넣으면 계산 관계가 달라질 수 있습니다. 두 항목이 모두 비어 있는 쌍은 같은 원천으로 묶어 검토할 수 있습니다.
2. **금융업 계정:** 보험·은행·증권 일부는 포털 매출과 DART 저장 매출의 정의가 다릅니다. 자산·부채·자본·순이익 등 다른 근거와 함께 별도로 판정해야 하며 매출 차이만 보고 자료 미존재로 단정하지 않습니다.
3. **실제 기간:** 오리엔트바이오는 저장된 실제 결산월이 3월입니다. 다음의 2025/12 표기를 같은 기간으로 취급하지 않았고, FnGuide의 실제 결산월 자료를 별도로 확인했습니다. 신설·분할 회사의 짧은 회계기간도 별도 확인이 필요합니다.
4. **ROE:** 다음은 ROE를 비율로 반환하고 화면에서 100을 곱해 %로 표시합니다. 평균 자본이 음수인 기업에서 단순 산식으로 양의 ROE가 표시되는 경우도 있어 기존 계산 정책과 대조해야 합니다.
5. **출처 독립성·기존 값:** 네이버/FnGuide 및 다음의 WiseFn 연결은 같은 공급 계열 자료가 겹칠 수 있어 독립 원천 여러 개로 간주하지 않았습니다. 기존 정상 값과 이전 제외 기록도 보존해야 합니다.

네이버에서 금융금액을 비교한 예비 대조에서는 54종목에서 기간·구분과 재무 앵커가 일치했으며, 31종목·61필드는 기존 분모 숫자를 변경하지 않는 조건을 통과했습니다. 이 역시 최종 저장 승인 건수가 아닙니다. ROE 분모, 제공사별 주식수 기준, 기존 보완 제외 기록 등의 추가 검증이 남습니다.

## 대체 경로에서도 필요한 항목을 찾지 못한 종목

| 코드 | 종목명(앱 기준) | 미확보 항목 |
|---|---|---|
| 005030 | 부산주공 | PER·PBR |
| 005110 | 한창 | PER·PBR |
| 279570 | 케이뱅크 | PER·PBR |
| 0126Z0 | 삼성에피스홀딩스 | ROE |

부분 확보 종목에도 미확보 항목이 남습니다. 우양피앤엘·오리엔트바이오의 PER은 확보한 EPS의 비양수 여부를 검증한 뒤 정상 미적용으로 판정할 수 있습니다. 삼양바이오팜의 ROE는 기초 자본·실제 기간 근거를 추가 확인해야 합니다. 위 미확보를 영구적인 수집 불가로 확정하지 않았습니다.

## 종목별 수치 확인 범위

N=네이버, F=FnGuide, D=다음. 아래는 수치의 존재 여부이며 자동 저장 허용 목록이 아닙니다.

| 코드 | 종목명(앱 기준) | 기존 누락 | N | F | D |
|---|---|---|---|---|---|
| 000150 | 두산 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 000220 | 유유제약 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 000300 | DH오토넥스 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 000370 | 한화손해보험 | PER·PBR | PER·PBR | PER | — |
| 000640 | 동아제약 | PER | PER | PER | — |
| 000700 | 유수홀딩스 | PER | PER | PER | — |
| 000880 | 한화 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 000950 | 전방 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 001040 | CJ | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 001200 | 유진투자증권 | PER | PER | PER | — |
| 001270 | 부국증권 | PER·PBR | PER·PBR | PER | — |
| 001450 | 현대해상 | PER | PER | PER | — |
| 001470 | 삼부토건 | ROE | ROE | — | ROE |
| 001500 | 현대차증권 | PER | PER | PER | — |
| 001510 | SK증권 | PER | PER | PER | — |
| 001740 | SK네트웍스 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 002020 | 코오롱 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 002380 | KCC | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 002410 | 범양건영 | ROE | ROE | — | ROE |
| 002420 | 우양피앤엘 | EPS·PER | — | EPS | EPS |
| 002630 | 오리엔트바이오 | EPS·PER·PBR | — | EPS·PBR | — |
| 002900 | TYM | PER | PER | PER | — |
| 003070 | 코오롱글로벌 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 003160 | 디아이 | EPS·PER | EPS·PER | EPS·PER | EPS |
| 003350 | 한국화장품제조 | PER | — | PER | — |
| 003460 | 유화증권 | EPS·PER | — | EPS·PER | EPS |
| 003470 | 유안타증권 | PER | PER | PER | — |
| 003530 | 한화투자증권 | PER | PER | PER | — |
| 003540 | 대신증권 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER | — |
| 003550 | LG | PER | PER | PER | — |
| 003690 | 코리안리 | PER | PER | PER | — |
| 003720 | 삼영 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 003920 | 남양유업 | PER | PER | PER | — |
| 004840 | DRB동일 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 005030 | 부산주공 | PER·PBR | — | — | — |
| 005110 | 한창 | PER·PBR | — | — | — |
| 005750 | 대림바스 | PER | PER | PER | — |
| 005830 | DB손해보험 | PER | PER | PER | — |
| 005850 | 에스엘 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 005940 | NH투자증권 | PER | PER | PER | — |
| 006220 | 제주은행 | PER | PER | PER | — |
| 006800 | 미래에셋증권 | PER | PER | PER | — |
| 007570 | 일양약품 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 008060 | 대덕 | PER | PER | PER | — |
| 008600 | 윌비스 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 008700 | 아남전자 | EPS·BPS·PER·PBR | EPS·BPS·PER·PBR | EPS·BPS·PER·PBR | EPS |
| 009970 | 영원무역홀딩스 | PER | PER | PER | — |
| 010400 | 우진아이엔에스 | PER | PER | PER | — |
| 011150 | CJ씨푸드 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 013520 | 화승코퍼레이션 | PER | PER | PER | — |
| 014680 | 한솔케미칼 | PER | PER | PER | — |
| 016380 | KG스틸 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 016590 | 신대양제지 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER·PBR | — |
| 016610 | DB증권 | PER | PER | PER | — |
| 016740 | 두올 | PER | PER | PER | — |
| 017860 | DS단석 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 018250 | 애경산업 | PER | PER | PER | — |
| 023350 | 한국종합기술 | BPS·ROE·PER·PBR | BPS·ROE·PER·PBR | BPS·PER·PBR | ROE |
| 058860 | KTis | EPS·PER | — | EPS·PER | EPS |
| 066970 | 엘앤에프 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 069460 | 대호에이엘 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 077970 | STX엔진 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 084010 | 대한제강 | PER | PER | PER | — |
| 090350 | 노루페인트 | PER | PER | PER | — |
| 090430 | 아모레퍼시픽 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 210540 | 디와이파워 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 248070 | 솔루엠 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 264900 | 크라운제과 | BPS·PBR | — | BPS·PBR | — |
| 279570 | 케이뱅크 | PER·PBR | — | — | — |
| 281820 | 케이씨텍 | BPS·PBR | BPS·PBR | BPS·PBR | — |
| 298040 | 효성중공업 | PER | PER | PER | — |
| 316140 | 우리금융지주 | BPS·PER·PBR | BPS·PER·PBR | BPS·PER | — |
| 353200 | 대덕전자 | PER | PER | PER | — |
| 462520 | 조선내화 | BPS·PER·PBR | — | BPS·PER·PBR | — |
| 484870 | 엠앤씨솔루션 | EPS·PER | — | EPS·PER | EPS |
| 0120G0 | 삼양바이오팜 | ROE·PER | — | PER | — |
| 0126Z0 | 삼성에피스홀딩스 | ROE | — | — | — |
