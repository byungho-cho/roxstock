/** Read-only evidence calculator. Call only after validateStoredDartRows succeeds. */
export function verifiedParentEquity(rows, filing, corpCode) {
  if (filing.fsDivision !== 'CFS' || !corpCode || rows.length === 0) return null;
  if (rows.some(r => r.receiptNo !== filing.receiptNo || r.corpCode !== corpCode || r.fiscalYear !== filing.fiscalYear || r.reportCode !== filing.reportCode || r.currency !== rows[0].currency)) return null;
  const bs = rows.filter(r => r.statementDivision === 'BS');
  const exact = id => { const matches = bs.filter(r => r.accountId === id); return matches.length === 1 ? matches[0] : null; };
  if (bs.some(r => r.accountId === 'ifrs-full_EquityAttributableToOwnersOfParent' && r.currentAmount != null)) return null;
  const equity = exact('ifrs-full_Equity'), nci = exact('ifrs-full_NoncontrollingInterests');
  const assets = exact('ifrs-full_Assets'), liabilities = exact('ifrs-full_Liabilities');
  const integer = v => typeof v === 'string' && /^-?\d{1,40}$/.test(v);
  if (![equity, nci, assets, liabilities].every(Boolean)) return null;
  if (![equity.currentAmount, nci.currentAmount, assets.currentAmount, liabilities.currentAmount].every(integer)) return null;
  if (BigInt(assets.currentAmount) !== BigInt(liabilities.currentAmount) + BigInt(equity.currentAmount)) return null;
  const source = (amount, periodEnd) => ({statementDivision:'BS', accountId:'DERIVED_EQUITY_MINUS_NONCONTROLLING_INTERESTS', accountName:'자본총계 - 비지배지분 (동일 연결 재무상태표)', amount, ytdAmount:null, periodEnd, derivation:{method:'EXACT_SAME_STATEMENT_EQUITY_MINUS_NCI', receiptNo:filing.receiptNo, currency:rows[0].currency, operands:[equity,nci].map(r=>({accountId:r.accountId, amount:periodEnd===filing.periodEndDate.toISOString().slice(0,10)?r.currentAmount:r.previousAmount}))}});
  const current = source((BigInt(equity.currentAmount)-BigInt(nci.currentAmount)).toString(),filing.periodEndDate.toISOString().slice(0,10));
  const previous = new Date(filing.periodEndDate); previous.setUTCFullYear(previous.getUTCFullYear()-1);
  const previousEnd = previous.toISOString().slice(0,10);
  const validPrevious = r => integer(r.previousAmount) && (r.previousPeriodEnd === previousEnd || r.previousPeriodEnd == null && r.previousPeriodSequential === true && filing.reportCode === '11011' && filing.periodEndDate.toISOString().slice(5,10) === '12-31');
  const opening = [equity,nci,assets,liabilities].every(validPrevious) && BigInt(assets.previousAmount) === BigInt(liabilities.previousAmount)+BigInt(equity.previousAmount) ? source((BigInt(equity.previousAmount)-BigInt(nci.previousAmount)).toString(),previousEnd) : null;
  return {current,opening};
}
