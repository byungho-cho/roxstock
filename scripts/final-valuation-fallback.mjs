/** Pure, opt-in final fallback planner. No network, database writes or scheduler changes. */
export function planFinalFallback({security, current, filing, snapshot, Decimal, allowReviewedExclusion = false, revenueAliasReviewed = false}) {
  const keys = ['eps', 'bps', 'roe', 'per', 'pbr'];
  const held = {}, patch = {}, evidence = {};
  const stop = reason => ({patch: {}, evidence: {}, held: Object.fromEntries(keys.filter(k => current?.values?.[k] == null).map(k => [k, reason]))});
  if (!security || !current || !filing || !snapshot || snapshot.error) return stop('SOURCE_NOT_AVAILABLE');
  if (snapshot.symbol !== security.symbol || String(filing.securityId) !== String(security.id) || String(current.securityId) !== String(security.id)) return stop('IDENTITY_MISMATCH');
  if (filing.isWithdrawn || filing.periodType !== 'ANNUAL' || current.periodType !== 'ANNUAL' || filing.fiscalYear !== current.fiscalYear || current.provenance?.receiptNo !== filing.receiptNo || current.provenance?.fsDivision !== filing.fsDivision) return stop('FILING_BASIS_MISMATCH');
  if (current.supplemental?.kisAnnualExclusion && !allowReviewedExclusion) return stop('PRIOR_REVIEW_EXCLUSION');
  if ((filing.sourceValidation?.currency ?? current.provenance?.currency ?? 'KRW') !== 'KRW' || !snapshot.unitConfirmed || !/^[a-f0-9]{64}$/.test(snapshot.sha256 ?? '')) return stop('CURRENCY_UNIT_OR_EVIDENCE_MISSING');
  const end = new Date(filing.periodEndDate).toISOString().slice(0, 10), month = end.slice(0, 7).replace('-', '/');
  const table = snapshot.financial;
  const headers = table?.header?.filter(h => h.YYMM === month && h.EP_CHK === null && h.NO_TYP === 'IFRS' && h.CONSOL_TYPE === (filing.fsDivision === 'CFS' ? '연결' : '별도')) ?? [];
  if (headers.length !== 1) return stop('ANNUAL_COLUMN_NOT_UNIQUE');
  const num = v => typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v.replaceAll(',', '')) ? new Decimal(v.replaceAll(',', '')) : null;
  const read = (name, col = headers[0].CD) => {
    const rows = table.data.filter(r => r.NAME?.trim() === name && r.LVL === 1);
    return rows.length === 1 ? num(rows[0][col]) : null;
  };
  const anchors = [['매출액','revenueYtd'],['영업이익','operatingProfitYtd'],['당기순이익','netIncomeYtd'],['자산총계','totalAssets'],['부채총계','totalLiabilities'],['자본총계','totalEquity']];
  let matched = 0;
  for (const [label, field] of anchors) {
    const value = read(label);
    if ((value == null || filing[field] == null) && field === 'revenueYtd' && revenueAliasReviewed) continue;
    if (value == null || filing[field] == null) return stop('FINANCIAL_ANCHOR_MISSING');
    if (value.mul(100000000).minus(filing[field]).abs().lte(500000)) matched++;
    else if (!(field === 'revenueYtd' && revenueAliasReviewed)) return stop('FINANCIAL_AMOUNT_MISMATCH');
  }
  if (matched < 5) return stop('FINANCIAL_ANCHORS_INSUFFICIENT');
  const duration = current.supplemental?.fiscalDuration ?? current.provenance?.fiscalDuration;
  const fullYear = duration ? duration.months === 12 && duration.end === end && duration.receiptNo === filing.receiptNo && duration.fsDivision === filing.fsDivision : current.provenance?.months === 12 && end.endsWith('12-31') && current.provenance?.flow === 'ANNUAL';
  const values = Object.fromEntries(keys.map(k => [k, read(k.toUpperCase())]));
  for (const k of keys) {
    if (current.values?.[k] != null) continue;
    let reason;
    const value = values[k];
    if (value == null) reason = 'SOURCE_NOT_PROVIDED';
    else if (['eps','roe','per'].includes(k) && !fullYear) reason = 'FULL_YEAR_FLOW_NOT_VERIFIED';
    if (!reason && (k === 'per' || k === 'pbr')) {
      const base = k === 'per' ? 'eps' : 'bps';
      if (!values[base]?.gt(0)) reason = 'NON_POSITIVE_DENOMINATOR';
      else if (!value.gt(0)) reason = 'INVALID_RATIO';
      else if (current.values?.[base] != null) reason = 'EXISTING_DENOMINATOR_SOURCE_REQUIRES_REVIEW';
    }
    if (!reason && (k === 'eps' || k === 'bps') && current.values?.[k === 'eps' ? 'per' : 'pbr'] != null) reason = 'EXISTING_RATIO_BASIS_REQUIRES_REVIEW';
    if (!reason && k === 'roe') {
      const priorMonth = `${Number(month.slice(0,4))-1}${month.slice(4)}`;
      const prev = table.header.filter(h => h.YYMM === priorMonth && h.EP_CHK === null && h.CONSOL_TYPE === headers[0].CONSOL_TYPE && h.NO_TYP === 'IFRS');
      const equityLabel = filing.fsDivision === 'CFS' ? '자본총계(지배)' : '자본총계';
      const income = read(filing.fsDivision === 'CFS' ? '당기순이익(지배)' : '당기순이익');
      const close = read(equityLabel), open = prev.length === 1 ? read(equityLabel, prev[0].CD) : null;
      const avg = close && open ? close.plus(open).div(2) : null;
      if (!avg?.gt(0) || !income || income.div(avg).mul(100).minus(value).abs().gt('0.02')) reason = 'ROE_POSITIVE_AVERAGE_CAPITAL_NOT_RECONCILED';
    }
    if (reason) held[k] = reason;
    else {
      patch[k] = value.toString();
      evidence[k] = {source:'NAVER_FNGUIDE_ANNUAL', provider:'FNGUIDE_PUBLIC_SNAPSHOT', kind:'FINAL_ANNUAL', fiscalYear:filing.fiscalYear, periodType:'ANNUAL', periodEnd:end, fsDivision:filing.fsDivision, receiptNo:filing.receiptNo, currency:'KRW', sourceUrl:snapshot.url, sourceHash:snapshot.sha256, collectedAt:snapshot.at, financialAnchorsMatched:matched, validation:'STORED_FINANCIAL_ANCHORS_RECONCILED', flow:'ANNUAL', months:fullYear?12:null, fiscalDuration:duration??null, bpsReferenceOnly:k === 'bps' || k === 'pbr', sharePolicy:'PROVIDER_ADJUSTED_ORDINARY_AND_PREFERRED_DENOMINATOR', pricePolicy:'ADJUSTED_ORDINARY_YEAR_END'};
    }
  }
  // A ratio is inseparable from its provider denominator; independent fields remain usable.
  for (const [ratio, base] of [['per','eps'],['pbr','bps']]) if (patch[ratio] != null && patch[base] == null) {delete patch[ratio]; delete evidence[ratio]; held[ratio] = 'DENOMINATOR_NOT_ACCEPTED';}
  return {patch, evidence, held};
}
