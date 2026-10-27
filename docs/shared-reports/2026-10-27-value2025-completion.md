# 2025년 연간 가치지표 선별 보완

집계 기준: 2026-10-27T02:21:23.418Z (UTC). 대상은 기존 종목·기간 수집 제외를 적용한 코스피·코스닥 수집 대상 종목 2,529개입니다.

## 실제 운영 데이터 반영

1,328종목에 지표 **3,336필드**를 추가 저장했습니다. 지표가 비어 있는 종목은 1,455개에서 **238개**, 누락 필드는 3,860개에서 **472개**로 감소했습니다. 수집 성공이나 오류 카드 수를 데이터 보완 건수로 대신하지 않았습니다.

| 단계 | 실제 추가 필드 |
|---|---:|
| DART 원문·기존 자료 계산 | 3,163 |
| 실제 결산기간 보정 | 53 |
| 정정 연결·공식 원문 복구 | 16 |
| 한투 확정 연간 지표 | 104 |

같은 종목에 여러 단계를 적용하므로 단계별 종목 수는 합산하지 않습니다. 실제 결산기간 22건을 보정했으며 재무 금액은 보존했습니다. 공식 원공시 4건을 새로 연결했고 기존 공시의 비어 있던 근거를 보완했습니다.

| 지표 | 이전 누락 | 실제 값 추가 | 정상 미적용 추가 | 남은 누락 |
|---|---:|---:|---:|---:|
| EPS | 155 | 117 | 0 | 38 |
| BPS | 1325 | 1199 | 0 | 126 |
| ROE | 132 | 104 | 0 | 28 |
| PER | 871 | 691 | 47 | 133 |
| PBR | 1377 | 1225 | 5 | 147 |

PER은 적자·0 EPS 944건과 외화 환산 필요 14건, PBR은 비양수 BPS 9건과 외화 환산 필요 14건을 정상 미적용으로 구분했습니다. 이 항목은 위 누락 수에 넣지 않습니다.

| 시장 | 대상 종목 | 이전 지표 부족 종목 | 현재 지표 부족 종목 | 남은 누락 필드 |
|---|---:|---:|---:|---:|
| KOSPI | 802 | 302 | 77 | 141 |
| KOSDAQ | 1727 | 1153 | 161 | 331 |

## 확인한 근거와 보호 범위

- 공시 접수번호·종목·회계기간·연결/별도·통화·단위를 대조했습니다. 지배기업 소유주 자본은 같은 재무상태표의 자본총계와 명시된 비지배지분 또는 독립적으로 일치하는 자본 구성항목으로 검증했습니다. 비지배지분 누락을 0으로 가정하지 않았습니다.
- EPS는 공시 보통주 EPS 또는 DART 잔액·손익과 일치하는 한투 확정 연간 EPS만 사용했습니다. 순이익을 기말 주식수로 나눠 EPS를 만들거나 계속·중단영업의 반올림 EPS를 단순 합산하지 않았습니다.
- 기존 수동값·정상 값은 덮어쓰지 않았습니다. 기존 재무 참고 테이블과 개인 계좌·매수·매도 테이블의 보존을 확인했고 1차 반영에서 대상 밖 기간별 지표의 해시가 동일했습니다. 기존 기간 제외 26건과 연간 보완 제외 28종목 기록을 유지했습니다.
- 검증된 실제 결산일로 기간을 보정하고 해당 결산일의 주가 근거를 사용했습니다. 외화 금액을 원화로 취급하거나 환산 없이 원화 주가와 결합하지 않았습니다.
- 원문 근거·변경 전후 사본·일지·재실행 도구는 비공개 보관했습니다. 최신 반영 전 DB 백업과 별도 복제본, 증빙 보관본의 SHA-256 일치를 확인했습니다. 비밀값·개인 자산 원본은 이 문서와 Git에 포함하지 않습니다.

## 표시 코드와 검증

[PR #337](https://github.com/byungho-cho/roxstock/pull/337), 배포 대상 버전 1.2.30. Android 변경은 없습니다.

기존 가치분석 목록은 검증된 회계기간 표기와 12월 외 결산일을 거부해 일부 저장 지표를 비워 표시했습니다. 실제 같은 종목·연도·공시·연결/별도·통화·기간 근거로 판단하도록 수정했습니다. BPS/PBR의 시점 근거와 EPS/ROE/PER의 기간 길이 근거를 구분하며, 캐시 스키마 10으로 이전 표시 결과를 재생성합니다.

운영 DB 전체 보완분 **3,336필드**를 새 선택기로 읽기 전용 대조해 불일치 **0건**을 확인했습니다. 기존 값의 출처·참고 BPS 경고·RIM 제약은 유지합니다. 코드 배포와 실제 운영 API 검증을 완료했습니다.

## 남은 항목

남은 238종목·472필드를 모두 보완 불가로 판정하지 않았습니다. 기존 보완 제외 유지, 기존 공시와 새 API 금액 차이, 보통주·우선주 자본 배분, 공시 전체 EPS 근거, 기초 자본, 과거 주가와 주식 기준 불일치 등을 추가 검토 대상으로 유지합니다. 부산주공·한창의 과거 주가 조회는 재시도했으나 추가 값을 확보하지 못했습니다. 신규 지표값·0·수집 제외를 임의로 만들어 누락을 없애지 않았습니다.

아래 목록은 실제 저장 누락 필드입니다. 종목 전체가 같은 원인으로 막혔다는 뜻은 아니며 필드별 근거가 필요합니다.

| 시장 | 종목코드 | 종목 | 누락 지표 |
|---|---|---|---|
| KOSDAQ | 0001A0 | 덕양에너젠 | PER·PBR |
| KOSDAQ | 0004V0 | 엔비알모션 | BPS·PBR |
| KOSDAQ | 0007J0 | 인벤테라 | PBR |
| KOSDAQ | 0008Z0 | 에스엔시스 | BPS·PBR |
| KOSDAQ | 0010F0 | 보원케미칼 | PER·PBR |
| KOSDAQ | 0011A0 | 액스비스 | PER·PBR |
| KOSDAQ | 0013Y0 | 엠에스바이오 | EPS·BPS·ROE·PER·PBR |
| KOSDAQ | 0015M0 | 디티에스 | EPS·BPS·ROE·PER·PBR |
| KOSDAQ | 002680 | 한탑 | BPS·PER·PBR |
| KOSDAQ | 003380 | 하림지주 | PER |
| KOSDAQ | 005990 | 매일홀딩스 | BPS·PER·PBR |
| KOSDAQ | 006620 | 동구바이오제약 | PER |
| KOSDAQ | 0082N0 | 카나프테라퓨틱스 | ROE·PBR |
| KOSDAQ | 008470 | 부스타 | BPS·PBR |
| KOSDAQ | 0088M0 | 메쥬 | ROE·PER·PBR |
| KOSDAQ | 011080 | 형지I&C | BPS·PBR |
| KOSDAQ | 011370 | 서한 | PER |
| KOSDAQ | 0117P0 | 피스피스스튜디오 | PER·PBR |
| KOSDAQ | 0155E0 | 해치텍 | PBR |
| KOSDAQ | 0158S0 | 엘리스 | EPS·BPS·ROE·PER·PBR |
| KOSDAQ | 019210 | 와이지-원 | BPS·PER·PBR |
| KOSDAQ | 019570 | GMI벤처 | PER·PBR |
| KOSDAQ | 023760 | 한국캐피탈 | BPS·PBR |
| KOSDAQ | 032860 | 더라미 | EPS·PER |
| KOSDAQ | 032960 | 동일기연 | PER |
| KOSDAQ | 035290 | 골드앤에스 | EPS·PER |
| KOSDAQ | 036030 | 케이티알파 | EPS·PER |
| KOSDAQ | 039010 | 현대에이치티 | BPS·PBR |
| KOSDAQ | 041920 | 메디아나 | BPS·PBR |
| KOSDAQ | 043610 | KT지니뮤직 | EPS·PER |
| KOSDAQ | 050090 | 비케이홀딩스 | EPS·PER |
| KOSDAQ | 053580 | 웹케시 | EPS·PER |
| KOSDAQ | 053950 | 경남제약 | EPS·PER |
| KOSDAQ | 068240 | 다원시스 | ROE |
| KOSDAQ | 068790 | DMS | PER |
| KOSDAQ | 069510 | 에스텍 | BPS·PBR |
| KOSDAQ | 071200 | 인피니트헬스케어 | PER |
| KOSDAQ | 078130 | 에스엠국일 | BPS·PBR |
| KOSDAQ | 080720 | 한국유니온제약 | ROE |
| KOSDAQ | 082270 | 젬백스 | BPS·PBR |
| KOSDAQ | 087260 | 모바일어플라이언스 | BPS·PBR |
| KOSDAQ | 089150 | 케이씨티 | BPS·PBR |
| KOSDAQ | 089600 | KT나스미디어 | EPS·PER |
| KOSDAQ | 089970 | 브이엠 | BPS·PBR |
| KOSDAQ | 090850 | 현대이지웰 | BPS·PBR |
| KOSDAQ | 092070 | 디엔에프 | EPS·PER |
| KOSDAQ | 096630 | 에스코넥 | PER |
| KOSDAQ | 100790 | 미래에셋벤처투자 | BPS·PBR |
| KOSDAQ | 101670 | 하이드로리튬 | BPS·PBR |
| KOSDAQ | 111710 | 남화산업 | BPS·PBR |
| KOSDAQ | 115180 | 큐리언트 | BPS·PBR |
| KOSDAQ | 115480 | 씨유메디칼 | PER |
| KOSDAQ | 121890 | 에스디시스템 | EPS·PER |
| KOSDAQ | 124560 | 태웅로직스 | BPS·PBR |
| KOSDAQ | 130500 | GH신소재 | BPS·PBR |
| KOSDAQ | 131100 | 티엔엔터테인먼트 | EPS·PER |
| KOSDAQ | 137400 | 피엔티 | PER |
| KOSDAQ | 139670 | 키네마스터 | PER |
| KOSDAQ | 148150 | 세경하이테크 | BPS·PBR |
| KOSDAQ | 149980 | 하이로닉 | PER |
| KOSDAQ | 174900 | 앱클론 | BPS·PBR |
| KOSDAQ | 179290 | 엠아이텍 | BPS·PER·PBR |
| KOSDAQ | 182400 | 엔케이젠바이오텍코리아 | ROE |
| KOSDAQ | 191410 | 육일씨엔에쓰 | PER |
| KOSDAQ | 195500 | 마니커에프앤지 | EPS·PER |
| KOSDAQ | 196170 | 알테오젠 | BPS·PBR |
| KOSDAQ | 199800 | 툴젠 | BPS·PBR |
| KOSDAQ | 205500 | 넥써쓰 | BPS·PBR |
| KOSDAQ | 214610 | 롤링스톤 | EPS·PER |
| KOSDAQ | 214680 | 디알텍 | BPS·PBR |
| KOSDAQ | 217190 | 제너셈 | BPS·PER·PBR |
| KOSDAQ | 226330 | 신테카바이오 | BPS·PBR |
| KOSDAQ | 239890 | 피엔에이치테크 | BPS·PER·PBR |
| KOSDAQ | 244460 | 올리패스 | EPS·PER |
| KOSDAQ | 245620 | EDGC | ROE |
| KOSDAQ | 250060 | 모비스 | EPS·PER |
| KOSDAQ | 251970 | 펌텍코리아 | BPS·PER·PBR |
| KOSDAQ | 252500 | 세화피앤씨 | EPS·PER |
| KOSDAQ | 253590 | 네오셈 | BPS·PBR |
| KOSDAQ | 256630 | 포인트엔지니어링 | BPS·PBR |
| KOSDAQ | 258790 | 소프트캠프 | PER |
| KOSDAQ | 263700 | 케어랩스 | BPS·PER·PBR |
| KOSDAQ | 266690 | 덕산넵코어스 | PER·PBR |
| KOSDAQ | 276040 | 스코넥 | BPS·PBR |
| KOSDAQ | 277410 | 인산가 | PER |
| KOSDAQ | 277810 | 레인보우로보틱스 | BPS·PER·PBR |
| KOSDAQ | 286750 | 나노실리칸첨단소재 | BPS·PBR |
| KOSDAQ | 288180 | 케이피항공산업 | PER·PBR |
| KOSDAQ | 288330 | 파라택시스코리아 | BPS·PBR |
| KOSDAQ | 290560 | 파라택시스이더리움 | PER |
| KOSDAQ | 291230 | 컴투스엔 | BPS·PBR |
| KOSDAQ | 293780 | 압타바이오 | BPS·PBR |
| KOSDAQ | 294090 | 이오플로우 | ROE |
| KOSDAQ | 298060 | 풍전약품 | BPS·PBR |
| KOSDAQ | 298830 | 슈어소프트테크 | BPS·PER·PBR |
| KOSDAQ | 303030 | 지니틱스 | BPS·PBR |
| KOSDAQ | 304360 | 에스바이오메딕스 | BPS·PBR |
| KOSDAQ | 304840 | 피플바이오 | BPS·PBR |
| KOSDAQ | 305090 | 마이크로디지탈 | BPS·PBR |
| KOSDAQ | 307930 | 컴퍼니케이 | EPS·PER |
| KOSDAQ | 321550 | 티움바이오 | BPS·PBR |
| KOSDAQ | 322180 | LS티라유텍 | BPS·PBR |
| KOSDAQ | 330860 | 네패스아크 | EPS·PER |
| KOSDAQ | 342870 | 오아 | BPS·ROE·PBR |
| KOSDAQ | 347860 | 알체라 | BPS·PBR |
| KOSDAQ | 352770 | 셀레스트라 | ROE |
| KOSDAQ | 356860 | 티엘비 | BPS·PER·PBR |
| KOSDAQ | 357880 | SKAI | BPS·PBR |
| KOSDAQ | 358570 | 지아이이노베이션 | BPS·PBR |
| KOSDAQ | 372320 | 큐로셀 | BPS·PBR |
| KOSDAQ | 373170 | 엠아이큐브솔루션 | PER |
| KOSDAQ | 376900 | 로킷헬스케어 | ROE |
| KOSDAQ | 376980 | 원티드랩 | BPS·PBR |
| KOSDAQ | 377480 | 마음AI | BPS·PBR |
| KOSDAQ | 380550 | 뉴로핏 | ROE |
| KOSDAQ | 382150 | 온코크로스 | BPS·PBR |
| KOSDAQ | 382800 | 지앤비에스 에코 | BPS·PBR |
| KOSDAQ | 384470 | 코어라인소프트 | BPS·PBR |
| KOSDAQ | 388720 | 유일로보틱스 | BPS·PBR |
| KOSDAQ | 388870 | 파로스아이바이오 | BPS·PBR |
| KOSDAQ | 389140 | 포바이포 | BPS·PBR |
| KOSDAQ | 394420 | 리센스메디컬 | ROE·PBR |
| KOSDAQ | 397030 | 에이프릴바이오 | BPS·PBR |
| KOSDAQ | 408470 | 한패스 | PER·PBR |
| KOSDAQ | 412350 | 레이저쎌 | BPS·PBR |
| KOSDAQ | 412540 | 제일엠앤에스 | ROE |
| KOSDAQ | 413640 | 비아이매트릭스 | BPS·PBR |
| KOSDAQ | 418550 | 제이오 | BPS·PBR |
| KOSDAQ | 419080 | 엔젯 | BPS·ROE·PBR |
| KOSDAQ | 429270 | 시지트로닉스 | EPS·PER |
| KOSDAQ | 435570 | 에르코스 | BPS·PBR |
| KOSDAQ | 438700 | 버넥트 | BPS·PBR |
| KOSDAQ | 439580 | 블루엠텍 | BPS·PBR |
| KOSDAQ | 455180 | 케이지에이 | BPS·PBR |
| KOSDAQ | 456160 | 지투지바이오 | ROE |
| KOSDAQ | 458350 | 에스팀 | PER·PBR |
| KOSDAQ | 460470 | 아이빔테크놀로지 | EPS·BPS·PER·PBR |
| KOSDAQ | 462510 | 라메디텍 | EPS·PER |
| KOSDAQ | 464490 | 쿼드메디슨 | BPS·PBR |
| KOSDAQ | 466100 | 클로봇 | BPS·PBR |
| KOSDAQ | 471820 | 셀로맥스사이언스 | BPS·ROE·PER·PBR |
| KOSDAQ | 472850 | 폰드그룹 | PER |
| KOSDAQ | 475040 | 스트라드비젼 | BPS·ROE·PBR |
| KOSDAQ | 475460 | 미트박스 | BPS·PER·PBR |
| KOSDAQ | 475830 | 오름테라퓨틱 | BPS·PBR |
| KOSDAQ | 476060 | 온코닉테라퓨틱스 | BPS·PER·PBR |
| KOSDAQ | 476830 | 알지노믹스 | BPS·ROE·PBR |
| KOSDAQ | 482630 | 삼양엔씨켐 | PER |
| KOSDAQ | 486990 | 노타 | ROE |
| KOSDAQ | 487580 | 폴레드 | PER·PBR |
| KOSDAQ | 493280 | 아이엠바이오로직스 | ROE·PER·PBR |
| KOSDAQ | 493330 | 지에프아이 | PBR |
| KOSDAQ | 900110 | 딥커머스 | EPS·BPS·PER·PBR |
| KOSDAQ | 900250 | 크리스탈신소재 | EPS |
| KOSDAQ | 900260 | 로스웰 | EPS·BPS·PER·PBR |
| KOSDAQ | 900270 | 헝셩그룹 | EPS·BPS·PER·PBR |
| KOSDAQ | 900300 | 오가닉티코스메틱 | EPS·BPS·PER·PBR |
| KOSDAQ | 900310 | 컬러레이 | EPS·BPS·PER·PBR |
| KOSDAQ | 900340 | 윙입푸드 | EPS·BPS·PER·PBR |
| KOSDAQ | 950140 | 잉글우드랩 | BPS |
| KOSDAQ | 950220 | 네오이뮨텍 | BPS |
| KOSPI | 000150 | 두산 | BPS·PER·PBR |
| KOSPI | 000220 | 유유제약 | BPS·PER·PBR |
| KOSPI | 000300 | DH오토넥스 | BPS·PER·PBR |
| KOSPI | 000370 | 한화손해보험 | PER·PBR |
| KOSPI | 000640 | 동아제약 | PER |
| KOSPI | 000700 | 유수홀딩스 | PER |
| KOSPI | 000880 | 한화 | BPS·PER·PBR |
| KOSPI | 000950 | 전방 | BPS·PER·PBR |
| KOSPI | 001040 | CJ | BPS·PBR |
| KOSPI | 001200 | 유진투자증권 | PER |
| KOSPI | 001270 | 부국증권 | PER·PBR |
| KOSPI | 001450 | 현대해상 | PER |
| KOSPI | 001470 | 삼부토건 | ROE |
| KOSPI | 001500 | 현대차증권 | PER |
| KOSPI | 001510 | SK증권 | PER |
| KOSPI | 001740 | SK네트웍스 | BPS·PER·PBR |
| KOSPI | 002020 | 코오롱 | BPS·PBR |
| KOSPI | 002380 | KCC | BPS·PER·PBR |
| KOSPI | 002410 | 범양건영 | ROE |
| KOSPI | 002420 | 우양피앤엘 | EPS·PER |
| KOSPI | 002630 | 오리엔트바이오 | EPS·PER·PBR |
| KOSPI | 002900 | TYM | PER |
| KOSPI | 003070 | 코오롱글로벌 | BPS·PBR |
| KOSPI | 003160 | 디아이 | EPS·PER |
| KOSPI | 003350 | 한국화장품제조 | PER |
| KOSPI | 003460 | 유화증권 | EPS·PER |
| KOSPI | 003470 | 유안타증권 | PER |
| KOSPI | 003530 | 한화투자증권 | PER |
| KOSPI | 003540 | 대신증권 | BPS·PER·PBR |
| KOSPI | 003550 | LG | PER |
| KOSPI | 003690 | 코리안리 | PER |
| KOSPI | 003720 | 삼영 | BPS·PBR |
| KOSPI | 003920 | 남양유업 | PER |
| KOSPI | 004840 | DRB동일 | BPS·PER·PBR |
| KOSPI | 005030 | 부산주공 | PER·PBR |
| KOSPI | 005110 | 한창 | PER·PBR |
| KOSPI | 005750 | 대림바스 | PER |
| KOSPI | 005830 | DB손해보험 | PER |
| KOSPI | 005850 | 에스엘 | BPS·PER·PBR |
| KOSPI | 005940 | NH투자증권 | PER |
| KOSPI | 006220 | 제주은행 | PER |
| KOSPI | 006800 | 미래에셋증권 | PER |
| KOSPI | 007570 | 일양약품 | BPS·PER·PBR |
| KOSPI | 008060 | 대덕 | PER |
| KOSPI | 008600 | 윌비스 | BPS·PBR |
| KOSPI | 008700 | 아남전자 | EPS·BPS·PER·PBR |
| KOSPI | 009970 | 영원무역홀딩스 | PER |
| KOSPI | 010400 | 우진아이엔에스 | PER |
| KOSPI | 011150 | CJ씨푸드 | BPS·PBR |
| KOSPI | 0120G0 | 삼양바이오팜 | ROE·PER |
| KOSPI | 0126Z0 | 삼성에피스홀딩스 | ROE |
| KOSPI | 013520 | 화승코퍼레이션 | PER |
| KOSPI | 014680 | 한솔케미칼 | PER |
| KOSPI | 016380 | KG스틸 | BPS·PER·PBR |
| KOSPI | 016590 | 신대양제지 | BPS·PER·PBR |
| KOSPI | 016610 | DB증권 | PER |
| KOSPI | 016740 | 두올 | PER |
| KOSPI | 017860 | DS단석 | BPS·PBR |
| KOSPI | 018250 | 애경산업 | PER |
| KOSPI | 023350 | 한국종합기술 | BPS·ROE·PER·PBR |
| KOSPI | 058860 | KTis | EPS·PER |
| KOSPI | 066970 | 엘앤에프 | BPS·PBR |
| KOSPI | 069460 | 대호에이엘 | BPS·PBR |
| KOSPI | 077970 | STX엔진 | BPS·PBR |
| KOSPI | 084010 | 대한제강 | PER |
| KOSPI | 090350 | 노루페인트 | PER |
| KOSPI | 090430 | 아모레퍼시픽 | BPS·PBR |
| KOSPI | 210540 | 디와이파워 | BPS·PBR |
| KOSPI | 248070 | 솔루엠 | BPS·PBR |
| KOSPI | 264900 | 크라운제과 | BPS·PBR |
| KOSPI | 279570 | 케이뱅크 | PER·PBR |
| KOSPI | 281820 | 케이씨텍 | BPS·PBR |
| KOSPI | 298040 | 효성중공업 | PER |
| KOSPI | 316140 | 우리금융지주 | BPS·PER·PBR |
| KOSPI | 353200 | 대덕전자 | PER |
| KOSPI | 462520 | 조선내화 | BPS·PER·PBR |
| KOSPI | 484870 | 엠앤씨솔루션 | EPS·PER |

## 선별 복구와 재실행

재실행은 최신 값을 재확인하고 여전히 비어 있는 허용 필드에만 적용합니다. 원천 공시·기간·종목 또는 기존 값이 달라졌으면 중지합니다. 전체 DB를 덮어써 운영 거래를 되돌리는 방식은 사용하지 않습니다.

복구가 필요하면 비공개 변경 전후 사본에서 한투 추가 → 원공시 연결 → 결산기간 보정 → 1차 지표 순서로 대상 종목·기간을 명시합니다. 현재 행이 해당 변경 직후 사본과 같은지 먼저 대조하고, 이후 변경이 있으면 자동 복구하지 않습니다. 복구 후 금융 revision과 캐시를 갱신하고 원문·금액·개인 데이터 보존을 재검증합니다.

## 운영 배포 후 최종 확인

- 코드 병합: `287e05a23ee920ac36ef1151808a514c4fc7e00c`, [PR #337](https://github.com/byungho-cho/roxstock/pull/337).
- [운영 배포 실행](https://github.com/byungho-cho/roxstock/actions/runs/40441326150): 성공. 백엔드와 수집기를 같은 커밋으로 배포했으며 웹 버전 **1.2.30**, APK는 유지했습니다.
- 실제 배포 코드로 이번 보완 **3,336필드 전체**를 재검증했습니다. 재무 상세 API 표본 17종목도 저장값과 일치했습니다. 2026년 목록 캐시는 `REFRESHED` 후 새 인스턴스에서 `PERSISTED_HIT`를 확인했습니다. 2025년은 기존 일별 저장 캐시가 없는 `FALLBACK` 경로를 확인했습니다.
- 외부 `/api/version`은 1.2.30, 비인증 `/api/accounts`·`/api/securities`는 401을 확인했습니다.
- 보완 전 정상 값 2,667회와 재무금액 264회의 대조가 일치했습니다(여러 단계에서 같은 값을 비교한 횟수가 포함됩니다). 대상 밖 기간별 지표와 재무 참고·계좌·매수·매도 테이블 보존을 확인했습니다.
- 기존 연간 보완 제외 28종목은 유지했습니다. 전용 DART 컨테이너는 종전의 중지·자동 재시작 없음 상태로 복원했고, 2단계·우선종목 보류를 유지한 채 원래의 전체 과거자료 보완 타이머만 재개했습니다.
- 선별 복구 도구는 기본 읽기 전용이며 단계·종목 허용 목록과 변경 직후 사본의 정확한 일치를 요구합니다. 이번에는 1차 반영의 유한양행을 대상으로 복구 계획 대조만 검증했고, 실제 데이터 복원은 실행하지 않았습니다.
