import {colors} from '../styles/tokens';

/** Composition only: never use investment principal or rounded display percentages. */
export function cashAllocation(stockValue: number | string | null | undefined, cashBalance: number | string | null | undefined, pricingComplete = true) {
 const stock=stockValue==null?NaN:Number(stockValue), cash=cashBalance==null?NaN:Number(cashBalance), total=stock+cash;
 const available=pricingComplete&&Number.isFinite(stock)&&Number.isFinite(cash)&&Number.isFinite(total)&&total>0;
 if(!available)return {available:false,stockPercent:NaN,cashPercent:NaN,stockColor:colors.textMuted as string,cashColor:colors.textMuted as string};
 const cashPercent=cash/total*100;
 const [stockColor,cashColor]=cash*10>=total*3?[colors.positive,colors.warning]:cash*5>=total?[colors.marketRise,colors.marketFall]:[colors.marketFall,colors.marketRise];
 return {available:true,stockPercent:stock/total*100,cashPercent,stockColor,cashColor};
}
