import {apiRequest} from '../../data/apiClient';
export const fields=['revenue','operatingProfit','netIncome','parentNetIncome','totalAssets','totalLiabilities','totalEquity','parentEquity','operatingCashFlow','investingCashFlow','financingCashFlow','cashEquivalents'] as const;
export type Field=typeof fields[number];
export type Row={id:string;name:string;symbol:string;market:string;currentPrice:string|null;previousClosePrice:string|null;priceUpdatedAt:string|null;targetPrice:string|null;w:string|null;value:string|null;eps:string|null;epsYield:string|null;roe:string|null;issuedShares:string|null;capital:string|null;netIncome:string|null};
export type FinancialList={rows:Row[];total:number;year:number;market:string};
export type FinancialDetail={security:{id:string;name:string;symbol:string};rows:{key:string;label:string;year:number;quarter:number|null;values:Record<Field,string|null>;growth:Record<Field,string|null>;basis:string|null;collectedAt:string|null;isDerived:boolean}[];collectedAt:string|null;notices:string[]};
export const listFinancials=(year:number,market:string,query:string,sort:string,direction:string,signal:AbortSignal)=>apiRequest<FinancialList>('/financial-statements?'+new URLSearchParams({year:String(year),market,query,sort,direction}),{signal});
export const detailFinancials=(id:string,startYear:number,mode:string,startQuarter:number,signal:AbortSignal)=>apiRequest<FinancialDetail>('/financial-statements/'+encodeURIComponent(id)+'?'+new URLSearchParams({startYear:String(startYear),mode,startQuarter:String(startQuarter)}),{signal});
