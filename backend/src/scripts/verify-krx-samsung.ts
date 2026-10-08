import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/index.js';
import { configuredKrx } from '../collector/krx-provider.js';
import { HistoricalPriceError } from '../collector/historical-price-error.js';
import { getSeoulClock } from '../collector/time.js';
import { calculatePeriod, type Supplemental } from '../domain/period-valuation.js';
/** Read-only: never creates or updates a database row. Stops live calls on systemic failure. */
const db=new PrismaClient(), provider=configuredKrx();
let blocked: {code:string;category:string}|undefined;
async function price(end:Date){
 if(blocked)return {verification:'NOT_ATTEMPTED',error:blocked} as const;
 try{return {verification:'LIVE',price:await provider.close('005930',end,'KOSPI')} as const;}
 catch(e){const failure=e instanceof HistoricalPriceError?e:new HistoricalPriceError('KRX_COMMUNICATION','COMMUNICATION');if(failure.category!=='NO_DATA')blocked={code:failure.code,category:failure.category};return {verification:'LIVE_FAILED',error:{code:failure.code,category:failure.category,providerCode:failure.providerCode}} as const;}
}
try{
 console.log(JSON.stringify({symbol:'005930',mode:'READ_ONLY',recent:await price(new Date(`${getSeoulClock().dateKey}T00:00:00Z`))}));
 // Required boundary checks before extending to the intervening years.
 const boundaries=new Map([[2025,await price(new Date('2025-12-31'))],[2015,await price(new Date('2015-12-31'))]]);
 const security=await db.security.findFirst({where:{symbol:'005930',marketType:'KOSPI'}});
 for(let year=2015;year<=2025;year++){
  const close=boundaries.get(year)??await price(new Date(`${year}-12-31`));
  const filing=security?await db.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL',isWithdrawn:false},orderBy:{receiptDate:'desc'}}):null;
  const stored=security?await db.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL'}}}):null;
  const supplemental={...(stored?.supplemental as Supplemental??{}),price:'price'in close?close.price:undefined};
  const calculated=filing?calculatePeriod(filing,undefined,supplemental):null;
  console.log(JSON.stringify({year,...close,filing:filing?{receiptNo:filing.receiptNo,division:filing.fsDivision}:null,values:calculated?.values??null,reasons:calculated?.reasons??{filing:'STORED_FILING_MISSING'},basis:calculated?.provenance??null}));
 }
}finally{await db.$disconnect();}
