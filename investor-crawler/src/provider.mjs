/** Public web adapter. Missing fields remain null; never infer money from closing price. */
export class ProviderError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function numeric(value) {
  if (value == null || value === '' || value === '-') return null;
  const text = String(value).replaceAll(',', '').replace(/^\+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new ProviderError('INVALID_NUMBER');
  return text;
}
export function dateKey(value) {
  const text = String(value).replaceAll('-', '');
  if (!/^\d{8}$/.test(text)) throw new ProviderError('INVALID_DATE');
  const iso = `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}`;
  if (new Date(iso+'T00:00:00Z').toISOString().slice(0,10) !== iso) throw new ProviderError('INVALID_DATE');
  return iso;
}
async function json(url, fetcher) {
  let response;
  try { response = await fetcher(url, {signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}}); }
  catch { throw new ProviderError('PROVIDER_UNAVAILABLE'); }
  if (!response.ok) throw new ProviderError(response.status === 403 ? 'PROVIDER_ACCESS_DENIED' : `PROVIDER_HTTP_${response.status}`);
  try { return await response.json(); } catch { throw new ProviderError('INVALID_JSON'); }
}
const subjects = [['INDIVIDUAL','개인','individual'],['FOREIGN','외국인','foreign'],['INSTITUTION','기관 합계','organization']];
export async function stockFlows(symbol, fetcher=fetch) {
  if (!/^[A-Z0-9]{6}$/.test(symbol) || symbol.startsWith('Z99')) throw new ProviderError('EXCLUDED_SYMBOL');
  const body=await json(`https://m.stock.naver.com/front-api/stock/domestic/trend?code=${symbol}`,fetcher);
  if (body?.isSuccess!==true || !Array.isArray(body.result?.items)) throw new ProviderError('RESPONSE_SCHEMA');
  return body.result.items.flatMap(item=>{
    // Explicit KRX branch only. Do not silently mix NXT and consolidated data.
    if (!item.krx) return [];
    const tradeDate=dateKey(item.localTradedAt);
    return subjects.map(([investorCode,investorName,prefix])=>({
      tradeDate,investorCode,investorName,exchangeScope:'KRX',source:'NAVER_WEB',
      buyQuantity:numeric(item.krx[prefix+'BuyVolume']),sellQuantity:numeric(item.krx[prefix+'SellVolume']),netQuantity:numeric(item.krx[prefix+'NetVolume']),
      buyAmount:null,sellAmount:null,netAmount:null,quantityUnit:'SHARE',amountUnit:null,
      publicationStatus:'UNSPECIFIED',reason:'금액·기관 세부 주체·공급자 확정 여부 미제공',
      raw:{date:item.localTradedAt,branch:'krx',closingPrice:numeric(item.krx.closingPrice),closeChange:numeric(item.krx.changePrice),buy:item.krx[prefix+'BuyVolume']??null,sell:item.krx[prefix+'SellVolume']??null,net:item.krx[prefix+'NetVolume']??null},
    }));
  });
}
export async function marketFlows(market,fetcher=fetch) {
  if (!['KOSPI','KOSDAQ'].includes(market)) throw new ProviderError('INVALID_MARKET');
  const body=await json(`https://m.stock.naver.com/api/index/${market}/trend`,fetcher);
  const tradeDate=dateKey(body?.bizdate);
  return [['INDIVIDUAL','개인','personalValue'],['FOREIGN','외국인','foreignValue'],['INSTITUTION','기관 합계','institutionalValue']].map(([investorCode,investorName,key])=>{
    const reportedValue=numeric(body[key]);
    if (reportedValue===null) throw new ProviderError('RESPONSE_SCHEMA');
    // Unit and exchange coverage have not been verified. Retain raw observations,
    // but do NOT present these values as KRW or combine them with KRX stock data.
    return {tradeDate,investorCode,investorName,exchangeScope:'UNVERIFIED',source:'NAVER_WEB',buyQuantity:null,sellQuantity:null,netQuantity:null,buyAmount:null,sellAmount:null,netAmount:null,quantityUnit:null,amountUnit:null,publicationStatus:'UNVERIFIED',reason:'시장 원본 값의 단위·거래소 범위·잠정/확정 상태 검증 대기',raw:{date:body.bizdate,reportedValue}};
  });
}
