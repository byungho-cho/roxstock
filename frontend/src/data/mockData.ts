import type { BuyLot, DashboardData, StockItem } from '../types/models';

export const currentCashBalance = 122_200_000;

export const stockItems: StockItem[] = [
  {
    id: 'hyundai', symbol: '005380', name: '현대차', listType: 'holding',
    currentPrice: 519_000, priceChangeRate: 2.4, quantity: 70, averagePrice: 230_000,
    marketValue: 36_330_000, profitAmount: 20_230_000, profitRate: 125.7,
    per: 7.8, pbr: 0.92, roe: 13.4, collectionStatus: 'success',
  },
  {
    id: 'kia', symbol: '000270', name: '기아', listType: 'holding',
    currentPrice: 130_000, priceChangeRate: -0.8, quantity: 78, averagePrice: 118_000,
    marketValue: 10_140_000, profitAmount: 936_000, profitRate: 10.2,
    per: 6.1, pbr: 0.88, roe: 15.7, collectionStatus: 'partial',
  },
  {
    id: 'naver', symbol: '035420', name: 'NAVER', listType: 'holding',
    currentPrice: 222_500, priceChangeRate: 0, quantity: 42, averagePrice: 227_300,
    marketValue: 9_345_000, profitAmount: -201_600, profitRate: -2.1,
    per: 18.4, pbr: 1.35, roe: 8.8, collectionStatus: 'success',
  },
  {
    id: 'samsung', symbol: '005930', name: '삼성전자', listType: 'watchlist',
    currentPrice: 84_600, priceChangeRate: 1.3, per: 14.2, pbr: 1.41, roe: 10.6,
    note: '반도체 업황과 배당 추이 확인', collectionStatus: 'success',
  },
  {
    id: 'hynix', symbol: '000660', name: 'SK하이닉스', listType: 'watchlist',
    currentPrice: 248_000, priceChangeRate: -1.2, per: 8.9, pbr: 1.82, roe: 22.1,
    note: '실적 발표 후 분할 접근', collectionStatus: 'failed',
  },
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
    stockValue: 732_000_000,
    cashBalance: currentCashBalance,
    dailyProfit: 4_200_000,
    dailyProfitRate: 0.58,
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
