import type { BuyLot, DashboardData, StockItem } from '../types/models';

export const currentCashBalance = 122_200_000;

export const stockItems: StockItem[] = [
  {
    id: 'hyundai', symbol: '005380', name: '현대자동차', listType: 'holding',
    currentPrice: 519_000, priceChangeRate: 18.4, quantity: 700, averagePrice: 230_000,
    marketValue: 363_300_000, profitAmount: 202_300_000, profitRate: 125.7,
    per: 7.8, pbr: 0.92, roe: 13.4, collectionStatus: 'success',
  },
  {
    id: 'kia', symbol: '000270', name: '기아', listType: 'holding',
    currentPrice: 130_000, priceChangeRate: -3.2, quantity: 988, averagePrice: 118_000,
    marketValue: 128_500_000, profitAmount: 11_856_000, profitRate: 10.2,
    per: 6.1, pbr: 0.88, roe: 15.7, collectionStatus: 'partial',
  },
  {
    id: 'naver', symbol: '035420', name: 'NAVER', listType: 'holding',
    currentPrice: 222_500, priceChangeRate: 1.1, quantity: 42, averagePrice: 227_300,
    marketValue: 9_345_000, profitAmount: -201_600, profitRate: -2.1,
    per: 18.4, pbr: 1.35, roe: 8.8, collectionStatus: 'success',
  },
  {
    id: 'samsung', symbol: '005930', name: '삼성전자', listType: 'holding',
    currentPrice: 84_600, priceChangeRate: 0, quantity: 1139, averagePrice: 78_000,
    marketValue: 96_400_000, profitAmount: 0, profitRate: 0, per: 14.2, pbr: 1.41, roe: 10.6,
    note: '반도체 업황과 배당 추이 확인', collectionStatus: 'success',
  },
  { id: 'hynix-holding', symbol: '000660', name: 'SK하이닉스', listType: 'holding', currentPrice: 248_000, priceChangeRate: 0.8, quantity: 70, averagePrice: 210_000, marketValue: 17_360_000, collectionStatus: 'success' },
  { id: 'posco', symbol: '005490', name: 'POSCO홀딩스', listType: 'holding', currentPrice: 340_000, priceChangeRate: -0.5, quantity: 45, averagePrice: 350_000, marketValue: 15_300_000, collectionStatus: 'success' },
  { id: 'lgchem', symbol: '051910', name: 'LG화학', listType: 'holding', currentPrice: 325_000, priceChangeRate: 1.2, quantity: 38, averagePrice: 310_000, marketValue: 12_350_000, collectionStatus: 'success' },
  { id: 'kb', symbol: '105560', name: 'KB금융', listType: 'holding', currentPrice: 91_500, priceChangeRate: -0.3, quantity: 92, averagePrice: 84_000, marketValue: 8_418_000, collectionStatus: 'success' },
  { id: 'lg-electronics', symbol: '066570', name: 'LG전자', listType: 'holding', currentPrice: 113_200, priceChangeRate: 2.1, quantity: 64, averagePrice: 102_500, marketValue: 7_244_800, collectionStatus: 'success' },
  { id: 'lg-display', symbol: '034220', name: 'LG디스플레이', listType: 'holding', currentPrice: 12_840, priceChangeRate: -1.7, quantity: 510, averagePrice: 14_100, marketValue: 6_548_400, collectionStatus: 'success' },
  { id: 'samsung-sdi', symbol: '006400', name: '삼성SDI', listType: 'holding', currentPrice: 352_500, priceChangeRate: 1.4, quantity: 18, averagePrice: 371_000, marketValue: 6_345_000, collectionStatus: 'partial' },
  { id: 'celltrion', symbol: '068270', name: '셀트리온', listType: 'holding', currentPrice: 188_900, priceChangeRate: -0.8, quantity: 31, averagePrice: 181_500, marketValue: 5_855_900, collectionStatus: 'success' },
  { id: 'hanwha-aerospace', symbol: '012450', name: '한화에어로스페이스', listType: 'holding', currentPrice: 412_000, priceChangeRate: 3.6, quantity: 14, averagePrice: 328_000, marketValue: 5_768_000, collectionStatus: 'success' },
  { id: 'samsung-biologics', symbol: '207940', name: '삼성바이오로직스', listType: 'holding', currentPrice: 988_000, priceChangeRate: 0.4, quantity: 5, averagePrice: 901_000, marketValue: 4_940_000, collectionStatus: 'success' },
  { id: 'shinhan', symbol: '055550', name: '신한지주', listType: 'holding', currentPrice: 58_700, priceChangeRate: -0.6, quantity: 80, averagePrice: 51_200, marketValue: 4_696_000, collectionStatus: 'success' },
  { id: 'naver-financial', symbol: '377300', name: '카카오페이', listType: 'holding', currentPrice: 46_100, priceChangeRate: 2.8, quantity: 95, averagePrice: 49_800, marketValue: 4_379_500, collectionStatus: 'failed' },
  { id: 'doosan-enerbility', symbol: '034020', name: '두산에너빌리티', listType: 'holding', currentPrice: 28_350, priceChangeRate: 4.2, quantity: 140, averagePrice: 22_700, marketValue: 3_969_000, collectionStatus: 'success' },
  { id: 'hd-korea-shipbuilding', symbol: '009540', name: 'HD한국조선해양', listType: 'holding', currentPrice: 221_500, priceChangeRate: -1.1, quantity: 16, averagePrice: 196_000, marketValue: 3_544_000, collectionStatus: 'success' },
  { id: 'kt', symbol: '030200', name: 'KT', listType: 'holding', currentPrice: 51_300, priceChangeRate: 0, quantity: 60, averagePrice: 45_800, marketValue: 3_078_000, collectionStatus: 'success' },
  { id: 'korean-air-holding', symbol: '003490', name: '대한항공', listType: 'holding', currentPrice: 24_500, priceChangeRate: -0.4, quantity: 120, averagePrice: 23_100, marketValue: 2_940_000, collectionStatus: 'success' },
  {
    id: 'hynix', symbol: '000660', name: 'SK하이닉스', listType: 'watchlist',
    currentPrice: 248_000, priceChangeRate: -1.2, per: 8.9, pbr: 1.82, roe: 22.1,
    note: '실적 발표 후 분할 접근', collectionStatus: 'failed',
  },
  { id: 'mobis-watch', symbol: '012330', name: '현대모비스', listType: 'watchlist', currentPrice: 403_500, priceChangeRate: 1.6, per: 8.4, pbr: 0.7, roe: 9.2, note: '재평가 구간 관찰', collectionStatus: 'success' },
  { id: 'naver-watch', symbol: '035420', name: 'NAVER', listType: 'watchlist', currentPrice: 222_500, priceChangeRate: -1.5, per: 18.2, pbr: 1.2, roe: 8.1, note: '실적 회복 확인', collectionStatus: 'success' },
  { id: 'kia-watch', symbol: '000270', name: '기아', listType: 'watchlist', currentPrice: 130_000, priceChangeRate: 0.9, per: 6.1, pbr: 0.9, roe: 15.7, note: '배당과 수출 추이 관찰', collectionStatus: 'success' },
  { id: 'kb-watch', symbol: '105560', name: 'KB금융', listType: 'watchlist', currentPrice: 91_500, priceChangeRate: -0.3, per: 5.8, pbr: 0.6, roe: 11.4, note: '주주환원 정책 확인', collectionStatus: 'partial' },
  { id: 'celltrion-watch', symbol: '068270', name: '셀트리온', listType: 'watchlist', currentPrice: 188_900, priceChangeRate: 0.7, per: 31.2, pbr: 2.6, roe: 8.5, note: '신제품 매출 추이 관찰', collectionStatus: 'success' },
  {
    id: 'mobis', symbol: '012330', name: '현대모비스', listType: 'recommended',
    currentPrice: 403_500, priceChangeRate: 0.6, per: 8.4, pbr: 0.74, roe: 9.2,
    note: '저PBR·현금흐름 우수', collectionStatus: 'success',
  },
  {
    id: 'koreanair', symbol: '003490', name: '대한항공', listType: 'recommended',
    currentPrice: 24_500, priceChangeRate: -0.4, per: 11.9, pbr: 0.91, roe: 7.7,
    note: '유가와 여객 수요 점검', collectionStatus: 'success',
  },
  { id: 'samsung-rec', symbol: '005930', name: '삼성전자', listType: 'recommended', currentPrice: 80_000, priceChangeRate: 1.4, per: 11.2, pbr: 1.1, roe: 10.4, note: '이익 성장 · 현금흐름 우수', collectionStatus: 'success' },
  { id: 'hynix-rec', symbol: '000660', name: 'SK하이닉스', listType: 'recommended', currentPrice: 260_000, priceChangeRate: 1.8, per: 9.8, pbr: 1.6, roe: 17.2, note: 'HBM 성장 · 실적 개선', collectionStatus: 'success' },
  { id: 'kb-rec', symbol: '105560', name: 'KB금융', listType: 'recommended', currentPrice: 91_500, priceChangeRate: 0.8, per: 5.8, pbr: 0.6, roe: 11.4, note: '저PBR · 주주환원 확대', collectionStatus: 'success' },
  { id: 'hanwha-rec', symbol: '012450', name: '한화에어로스페이스', listType: 'recommended', currentPrice: 412_000, priceChangeRate: 3.6, per: 14.7, pbr: 2.1, roe: 18.8, note: '수주 성장 · 방산 수출 확대', collectionStatus: 'success' },
];

export const buyLots: BuyLot[] = [
  { id: 'lot-hyundai-1', stockId: 'hyundai', stockName: '현대차', tradeDate: '2025-11-12', buyPrice: 215_000, quantity: 40, soldQuantity: 10, remainingQuantity: 30 },
  { id: 'lot-hyundai-2', stockId: 'hyundai', stockName: '현대차', tradeDate: '2026-02-03', buyPrice: 245_000, quantity: 40, soldQuantity: 0, remainingQuantity: 40 },
  { id: 'lot-kia-1', stockId: 'kia', stockName: '기아', tradeDate: '2026-01-15', buyPrice: 118_000, quantity: 78, soldQuantity: 0, remainingQuantity: 78 },
  { id: 'lot-naver-1', stockId: 'naver', stockName: 'NAVER', tradeDate: '2026-03-10', buyPrice: 227_300, quantity: 42, soldQuantity: 0, remainingQuantity: 42 },
];

export const dashboardData: DashboardData = {
  summary: {
    totalAssets: 854_200_000,
    stockValue: 651_000_000,
    cashBalance: 203_200_000,
    dailyProfit: 12_840_000,
    dailyProfitRate: 1.5,
    stockMonthlyProfit: 20_000_000,
    cashMonthlyProfit: 20_000_000,
    totalProfit: 184_200_000,
    totalProfitRate: 27.49,
    collectedAt: '09.24 07:55',
  },
  holdings: stockItems.filter((stock) => stock.listType === 'holding'),
  trend: [
    { label: '4월', value: 692_000_000 }, { label: '5월', value: 724_000_000 },
    { label: '6월', value: 718_000_000 }, { label: '7월', value: 776_000_000 },
    { label: '8월', value: 816_000_000 }, { label: '9월', value: 854_200_000 },
  ],
};
