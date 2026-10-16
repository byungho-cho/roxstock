import {ProviderError,numeric,dateKey} from './provider.mjs';

const origin='https://openapi.koreainvestment.com:9443';
const actors=[['INDIVIDUAL','개인','prsn'],['FOREIGN','외국인','frgn'],['INSTITUTION','기관 합계','orgn'],['SECURITIES','증권','scrt'],['INVESTMENT_TRUST','투자신탁','ivtr'],['PRIVATE_EQUITY','사모펀드','pe_fund'],['BANK','은행','bank'],['INSURANCE','보험','insu'],['MERCHANT_BANK','종금','mrbn'],['FUND','기금','fund']];
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const integer=value=>{const parsed=numeric(value);if(parsed===null||! /^-?\d+$/.test(parsed))throw new ProviderError('KIS_FIELD_MISSING_OR_INVALID');return parsed;};
function signedPriceChange(value,sign){
 const parsed=numeric(value);if(parsed===null||! /^-?\d+$/.test(parsed)||!['1','2','3','4','5'].includes(sign))return null;
 const magnitude=BigInt(parsed)<0n?-BigInt(parsed):BigInt(parsed);
 return sign==='3'?(magnitude===0n?'0':null):((sign==='4'||sign==='5'?-1n:1n)*magnitude).toString();
}
/** Read-only KRX investor endpoint. Credentials never enter URLs, observations or errors. */
export class KisInvestorProvider{
 constructor({appKey=process.env.KIS_APP_KEY,appSecret=process.env.KIS_APP_SECRET,fetcher=fetch,accessToken=null,expiresAt=0}={}){
  this.appKey=appKey?.trim();this.appSecret=appSecret?.trim();this.fetcher=fetcher;
  this.token=accessToken;this.expiresAt=expiresAt;this.pending=null;
 }
 async json(path,options){
  let response,body;
  try{response=await this.fetcher(origin+path,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new ProviderError('KIS_CONNECTION_FAILED');}
  try{body=await response.json();}catch{throw new ProviderError('KIS_INVALID_JSON');}
  if(!response.ok||body.rt_cd!=null&&body.rt_cd!=='0'||body.error_code){
   // Do not propagate provider messages, request headers or response bodies.
   throw new ProviderError(response.status===429?'KIS_RATE_LIMIT':response.status===401||response.status===403?'KIS_AUTH_OR_PERMISSION_FAILED':'KIS_REQUEST_FAILED');
  }
  return body;
 }
 async authenticate(){
  if(!this.appKey||!this.appSecret)throw new ProviderError('KIS_CREDENTIALS_MISSING');
  if(this.token&&this.expiresAt>Date.now()+60000)return this.token;
  if(!this.pending)this.pending=this.json('/oauth2/tokenP',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey:this.appKey,appsecret:this.appSecret})}).then(body=>{
   if(typeof body.access_token!=='string'||!body.access_token||!Number.isFinite(Number(body.expires_in))||Number(body.expires_in)<=60)throw new ProviderError('KIS_INVALID_TOKEN_RESPONSE');
   this.token=body.access_token;this.expiresAt=Date.now()+Math.min(Number(body.expires_in),86400)*1000;return this.token;
  }).finally(()=>{this.pending=null;});
  return this.pending;
 }
 async stockFlows(symbol,selected=today(),exchangeScope='KRX'){
  if(!/^[A-Z0-9]{6}$/.test(symbol)||symbol.startsWith('Z99'))throw new ProviderError('EXCLUDED_SYMBOL');
  const branch={KRX:'J',NXT:'NX'}[exchangeScope];
  if(!branch)throw new ProviderError('INVALID_EXCHANGE_SCOPE');
  const date=dateKey(selected);if(date>today())throw new ProviderError('INVALID_DATE');
  const token=await this.authenticate();
  const query=new URLSearchParams({FID_COND_MRKT_DIV_CODE:branch,FID_INPUT_ISCD:symbol,FID_INPUT_DATE_1:date.replaceAll('-',''),FID_ORG_ADJ_PRC:'',FID_ETC_CLS_CODE:''});
  const body=await this.json('/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily?'+query,{headers:{authorization:'Bearer '+token,appkey:this.appKey,appsecret:this.appSecret,tr_id:'FHPTJ04160001',custtype:'P','content-type':'application/json'}});
  if(!Array.isArray(body.output2))throw new ProviderError('KIS_RESPONSE_SCHEMA');
  const identities=new Set();
  return body.output2.flatMap(item=>{
   const tradeDate=dateKey(item.stck_bsop_date);if(tradeDate>date||identities.has(tradeDate))throw new ProviderError('KIS_DATE_MISMATCH_OR_DUPLICATE');identities.add(tradeDate);
   return actors.map(([investorCode,investorName,prefix],index)=>{
    const parse=value=>index<3?integer(value):numeric(value)===null?null:integer(value);
    const buyQuantity=parse(item[prefix+'_shnu_vol']),sellQuantity=parse(item[prefix+'_seln_vol']),netQuantity=parse(item[prefix+(prefix==='pe_fund'?'_ntby_vol':'_ntby_qty')]);
    const buy=parse(item[prefix+'_shnu_tr_pbmn']),sell=parse(item[prefix+'_seln_tr_pbmn']),net=parse(item[prefix+'_ntby_tr_pbmn']);
    if([buyQuantity,sellQuantity,buy,sell].some(value=>value!==null&&BigInt(value)<0n)||[buyQuantity,sellQuantity,netQuantity].every(value=>value!==null)&&BigInt(buyQuantity)-BigInt(sellQuantity)!==BigInt(netQuantity))throw new ProviderError('KIS_NET_QUANTITY_MISMATCH');
    const delta=[buy,sell,net].every(value=>value!==null)?BigInt(buy)-BigInt(sell)-BigInt(net):null;
    // Each source amount is an integer million KRW; independently rounded fields can differ by one unit.
    if(delta!==null&&(delta < -1n||delta > 1n))throw new ProviderError('KIS_NET_AMOUNT_MISMATCH');
    const won=value=>value===null?null:(BigInt(value)*1000000n).toString();
    return {tradeDate,investorCode,investorName,exchangeScope,source:'KIS_API',buyQuantity,sellQuantity,netQuantity,buyAmount:won(buy),sellAmount:won(sell),netAmount:won(net),quantityUnit:'SHARE',amountUnit:'KRW',publicationStatus:'UNSPECIFIED',reason:'한국투자증권 '+exchangeScope+' · 금액 원본 백만원 단위 · 누락은 null · 공급자 확정 여부 미제공',raw:{date:item.stck_bsop_date,branch,amountUnit:'MILLION_KRW',buyAmount:buy,sellAmount:sell,netAmount:net,amountRoundingDifference:delta?.toString()??null,closingPrice:numeric(item.stck_clpr)===null?null:integer(item.stck_clpr),closeChange:signedPriceChange(item.prdy_vrss,item.prdy_vrss_sign),priceChangeSign:item.prdy_vrss_sign??null,buy:buyQuantity,sell:sellQuantity,net:netQuantity}};
   });
  });
 }
 async currentFundamentals(symbol){
  if(!/^[A-Z0-9]{6}$/.test(symbol)||symbol.startsWith('Z99'))throw new ProviderError('EXCLUDED_SYMBOL');
  const token=await this.authenticate();
  const query=new URLSearchParams({FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:symbol});
  const body=await this.json('/uapi/domestic-stock/v1/quotations/inquire-price?'+query,{headers:{authorization:'Bearer '+token,appkey:this.appKey,appsecret:this.appSecret,tr_id:'FHKST01010100',custtype:'P','content-type':'application/json'}});
  const item=body.output;
  if(!item||typeof item!=='object'||Array.isArray(item)||item.stck_shrn_iscd!==symbol)throw new ProviderError('KIS_SYMBOL_OR_SCHEMA_MISMATCH');
  const fields={per:'per',pbr:'pbr',eps:'eps',bps:'bps',listedShares:'lstn_stcn',foreignHoldingShares:'frgn_hldn_qty',foreignExhaustionRate:'hts_frgn_ehrt'};
  const values={},raw={};
  for(const [field,key] of Object.entries(fields)){
   const value=numeric(item[key]);
   if(value!==null&&(!/^-?\d+(\.\d{1,4})?$/.test(value)||value.replace(/[-.]/g,'').length>24))throw new ProviderError('KIS_INVALID_FUNDAMENTAL');
   if(value!==null&&['listedShares','foreignHoldingShares'].includes(field)&&(!/^\d+$/.test(value)))throw new ProviderError('KIS_INVALID_SHARE_COUNT');
   if(value!==null&&field==='foreignExhaustionRate'&&(Number(value)<0||Number(value)>100))throw new ProviderError('KIS_INVALID_FOREIGN_RATE');
   // Nonpositive valuation multiples/BPS are unsupported, not zero-valued estimates.
   values[field]=value!==null&&['per','pbr','bps','listedShares'].includes(field)&&Number(value)<=0?null:value;
   raw[key]=typeof item[key]==='string'?item[key]:null;
  }
  if(Object.values(values).every(value=>value===null))throw new ProviderError('KIS_NO_FUNDAMENTALS');
  return {...values,source:'KIS_API',exchangeScope:'KRX',collectedAt:new Date(),raw:{...raw,endpoint:'inquire-price',symbol,price:item.stck_prpr??null,periodBasis:'CURRENT_REFERENCE_ONLY',shareUnit:'SHARE',rateUnit:'PERCENT',ratioBasis:'FOREIGN_SHARES_DIVIDED_BY_LISTED_SHARES',exhaustionField:'hts_frgn_ehrt'}};
 }
 async marketFlows(market,selected=today()){
  const config={KOSPI:['0001','KSP'],KOSDAQ:['1001','KSQ']}[market];
  if(!config)throw new ProviderError('INVALID_MARKET');
  const date=dateKey(selected);if(date>today())throw new ProviderError('INVALID_DATE');
  const token=await this.authenticate(),[industry,code]=config;
  const query=new URLSearchParams({FID_COND_MRKT_DIV_CODE:'U',FID_INPUT_ISCD:industry,FID_INPUT_DATE_1:date.replaceAll('-',''),FID_INPUT_ISCD_1:code,FID_INPUT_DATE_2:date.replaceAll('-',''),FID_INPUT_ISCD_2:industry});
  const body=await this.json('/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market?'+query,{headers:{authorization:'Bearer '+token,appkey:this.appKey,appsecret:this.appSecret,tr_id:'FHPTJ04040000',custtype:'P','content-type':'application/json'}});
  if(!Array.isArray(body.output))throw new ProviderError('KIS_RESPONSE_SCHEMA');
  const dates=new Set();
  return body.output.flatMap(item=>{
   const tradeDate=dateKey(item.stck_bsop_date);if(tradeDate>date||dates.has(tradeDate))throw new ProviderError('KIS_DATE_MISMATCH_OR_DUPLICATE');dates.add(tradeDate);
   return actors.map(([investorCode,investorName,prefix],index)=>{
    const amount=item[prefix+'_ntby_tr_pbmn'],net=index<3?integer(amount):numeric(amount)===null?null:integer(amount);
    // Market API has net fields only. Its quantity scale is not documented;
    // retain that original field without pretending it is a number of shares.
    return {tradeDate,investorCode,investorName,exchangeScope:'KIS_MARKET',source:'KIS_API',buyQuantity:null,sellQuantity:null,netQuantity:null,buyAmount:null,sellAmount:null,netAmount:net===null?null:(BigInt(net)*1000000n).toString(),quantityUnit:null,amountUnit:'KRW',publicationStatus:'UNSPECIFIED',reason:'한국투자증권 시장별 순매수 · 금액 원본 백만원 · 매수/매도 및 수량 단위 미확인 · 종목 KRX 자료와 별도 집계',raw:{date:item.stck_bsop_date,market:code,industry,amountUnit:'MILLION_KRW',netAmount:net,netQuantity:numeric(item[prefix+(prefix==='pe_fund'?'_ntby_vol':'_ntby_qty')]),quantityUnit:'UNVERIFIED',closingPrice:numeric(item.bstp_nmix_prpr),closeChange:numeric(item.bstp_nmix_prdy_vrss)}};
   });
  });
 }
}
