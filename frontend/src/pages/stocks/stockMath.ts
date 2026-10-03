import type { StockItem, StockListType, BuyLot } from '../../types/models';
import type { TradeDto } from '../../data/roxstockApi';
export const stockTabs: Array<{value: StockListType; label: string}> = [
  {value:'holding',label:'보유종목'},{value:'watchlist',label:'관심종목'},{value:'traded',label:'거래종목'},
];
export const sortOptions = {
  holding: [['marketValue','평가금액'],['profitAmount','평가손익'],['purchaseAmount','보유금액'],['name','종목명']],
  watchlist: [['name','종목명'],['priceChangeRate','등락률'],['per','PER'],['pbr','PBR'],['roe','ROE'],['valuationW','W']],
  recommended: [['name','종목명'],['priceChangeRate','등락률'],['per','PER'],['pbr','PBR'],['roe','ROE'],['valuationW','W']],
  traded: [['lastSoldAt','마지막 매도일'],['realizedProfit','누적 실현손익'],['name','종목명']],
} as const;
export type StockSort = typeof sortOptions[keyof typeof sortOptions][number][0];
export const defaultSort = (tab: StockListType): {key:StockSort; descending:boolean} => ({key: tab==='holding'?'marketValue':tab==='traded'?'lastSoldAt':'name',descending:tab==='holding'||tab==='traded'});
export const won = (n:number|null|undefined) => n==null||!Number.isFinite(n)?'—':`${Math.round(n).toLocaleString('ko-KR')}원`;
export const dayChange = (stock:StockItem) => stock.priceAvailable===false||stock.priceChangeAvailable===false||!Number.isFinite(stock.priceChangeRate)||stock.priceChangeRate===-100?Number.NaN:stock.currentPrice*stock.priceChangeRate/(100+stock.priceChangeRate);
export function stockValuation(stock: StockItem) {
  const quantity = stock.quantity ?? 0;
  const purchase = stock.purchaseAmount ?? quantity * (stock.averagePrice ?? Number.NaN);
  const price = stock.priceAvailable === false ? Number.NaN : stock.currentPrice;
  const amount = Number.isFinite(price) ? stock.marketValue ?? quantity * price : Number.NaN;
  const profit = Number.isFinite(amount) ? stock.profitAmount ?? amount - purchase : Number.NaN;
  const rate = Number.isFinite(profit) && purchase > 0 ? stock.profitRate ?? profit / purchase * 100 : Number.NaN;
  return { quantity, purchase, price, amount, profit, rate };
}
export function lotValue(lot:Pick<BuyLot,'remainingQuantity'|'buyPrice'>,price:number) {
  return {amount:price*lot.remainingQuantity,profit:(price-lot.buyPrice)*lot.remainingQuantity,rate:Number.isFinite(price)&&lot.buyPrice>0?(price/lot.buyPrice-1)*100:Number.NaN};
}
export function averageAfter(quantity:number,average:number,buyQuantity:number,buyPrice:number,replace?:{remaining:number;price:number;sold:number}) {
  const newRemaining=buyQuantity-(replace?.sold??0), total=quantity-(replace?.remaining??0)+newRemaining;
  return total>0 ? (quantity*average-(replace?(replace.remaining*replace.price):0)+newRemaining*buyPrice)/total : Number.NaN;
}
export function sortStocks(stocks:StockItem[],key:StockSort,descending:boolean,favorites:ReadonlySet<string>=new Set()) {
  const value=(s:StockItem):string|number|undefined=> key==='purchaseAmount'?stockValuation(s).purchase:key==='marketValue'?stockValuation(s).amount:key==='profitAmount'?stockValuation(s).profit:key==='priceChangeRate'&&s.priceChangeAvailable===false?undefined:s[key];
  return [...stocks].sort((a,b)=>{const favorite=Number(favorites.has(b.id))-Number(favorites.has(a.id));if(favorite)return favorite;const av=value(a),bv=value(b),missing=(v:typeof av)=>v==null||typeof v==='number'&&!Number.isFinite(v)||v==='';if(missing(av)||missing(bv))return Number(missing(av))-Number(missing(bv));const delta=typeof av==='string'&&typeof bv==='string'?av.localeCompare(bv,'ko'):Number(av)-Number(bv);return delta*(descending?-1:1)||a.name.localeCompare(b.name,'ko');});
}
export function deriveAccountStocks(catalog:StockItem[],holdings:StockItem[],trades:TradeDto[]) {
  const result=new Map(catalog.filter(s=>s.watchlistItemId||s.listType==='holding').map(s=>[s.id,{...s}]));
  for(const trade of trades){if(!result.has(trade.security.id))result.set(trade.security.id,{id:trade.security.id,symbol:trade.security.symbol,name:trade.security.name,listType:'traded',currentPrice:Number.NaN,priceChangeRate:Number.NaN,collectionStatus:'failed',...catalog.find(s=>s.id===trade.security.id)});}
  const holdingIds=new Set(holdings.filter(s=>(s.quantity??0)>0).map(s=>s.id));
  for(const trade of trades){const s=result.get(trade.security.id)!;s.hasTradeHistory=true;if(!holdingIds.has(s.id))s.listType='traded';if(trade.type==='SELL'){s.realizedProfit=(s.realizedProfit??0)+Number(trade.realizedProfitLoss??0);s.lastSoldAt=!s.lastSoldAt||trade.tradedAt>s.lastSoldAt?trade.tradedAt:s.lastSoldAt;}}
  for(const s of holdings)result.set(s.id,{...result.get(s.id),...s,hasTradeHistory:true});
  return [...result.values()];
}
