/** User-approved approximation. Never overwrites existing values or converts currencies. */
export function currentSharesYearendReference({symbol, year, currentShares, financial, price, existing = {}, fields, Decimal}) {
  const patch = {}, held = {}, perMetric = {}, reasons = {};
  const number = value => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? new Decimal(value) : null;
  const shares = number(currentShares?.value), profit = number(financial?.profit), capital = number(financial?.capital);
  const common = reason => ({patch, perMetric, reasons, held: Object.fromEntries(fields.filter(k => existing[k] == null).map(k => [k, reason]))});
  if (year !== 2025 || financial?.year !== year || financial.symbol !== symbol) return common('FINANCIAL_IDENTITY_MISMATCH');
  if (!shares?.gt(0) || !shares.isInteger() || currentShares.symbol !== symbol || !/^\d{4}-\d{2}-\d{2}$/.test(currentShares.observedDate ?? '')) return common('CURRENT_SHARES_NOT_VERIFIED');
  if (!/^[A-Z]{3}$/.test(financial.currency ?? '')) return common('CURRENCY_NOT_VERIFIED');
  const close = number(price?.value), validPrice = price?.symbol === symbol && price.currency === 'KRW' && price.date >= '2025-12-24' && price.date <= '2025-12-31' && close?.gt(0);
  const candidates = {eps:profit?.div(shares), bps:capital?.div(shares)};
  for (const key of ['eps', 'bps', 'per', 'pbr']) {
    if (!fields.includes(key) || existing[key] != null) continue;
    let value = candidates[key], error;
    if (key === 'per' || key === 'pbr') {
      const denominator = key === 'per' ? profit : capital;
      if (!denominator) error = 'FINANCIAL_AMOUNT_MISSING';
      else if (!denominator.gt(0)) error = key === 'per' ? 'PROXY_EARNINGS_NON_POSITIVE' : 'PROXY_CAPITAL_NON_POSITIVE';
      else if (financial.currency !== 'KRW') error = 'CURRENCY_CONVERSION_REQUIRED';
      else if (!validPrice) error = 'YEAR_END_CLOSE_NOT_PROVIDED';
      else value = close.mul(shares).div(denominator);
    } else if (!value) error = 'FINANCIAL_AMOUNT_MISSING';
    if (!error && (!value?.isFinite() || value.abs().gte('1e24'))) error = 'CALCULATION_OUT_OF_RANGE';
    if (error) { held[key] = error; continue; }
    patch[key] = value.toDecimalPlaces(4).toFixed();
    const approximation = {method:'CURRENT_CONNECTED_SHARES_WITH_2025_YEAR_END_CLOSE', referenceOnly:true, shares:shares.toFixed(), sharesObservedDate:currentShares.observedDate, sharesSource:currentShares.source, financialSource:financial.source, financialPeriodEnd:financial.periodEnd, profitBasis:financial.profitBasis, capitalBasis:financial.capitalBasis, profit:profit?.toFixed() ?? null, capital:capital?.toFixed() ?? null, price:validPrice?close.toFixed():null, priceDate:validPrice?price.date:null, priceSource:validPrice?price.source:null, historicalShareCountVerified:false, annualization:'NONE'};
    perMetric[key] = {source:'USER_CURRENT_SHARES_REFERENCE', kind:'FINAL_ANNUAL', fiscalYear:year, periodType:'ANNUAL', periodEnd:financial.periodEnd, fsDivision:financial.fsDivision, receiptNo:financial.receiptNo ?? null, currency:financial.currency, flow:'ANNUAL', fiscalDuration:financial.fiscalDuration ?? null, referenceOnly:true, bpsReferenceOnly:key==='bps'||key==='pbr', epsBasis:key==='eps'?'PROFIT_DIV_CURRENT_LISTED_SHARES_APPROXIMATION':undefined, approximation};
    reasons[key] = `참고 계산: ${currentShares.observedDate} 현재 연결 주식수 사용(2025년 말 확정 주식수 아님)` + (key==='per'||key==='pbr'?` · ${price.date} 종가 기준`:'') + ' · 기존 확정 지표와 구분';
  }
  return {patch, perMetric, reasons, held};
}
