type Snapshot = { snapshotDate: Date; investmentAmount: { toString(): string } | null };
export function annualInvestmentCapital(snapshots: Snapshot[], today: string) {
  const currentYear = Number(today.slice(0, 4));
  const years = new Set([currentYear, ...snapshots.map(row => row.snapshotDate.getUTCFullYear()).filter(year => year <= currentYear)]);
  return [...years].sort((a,b) => b-a).map(year => {
    const candidates = snapshots.filter(row => row.snapshotDate.toISOString().slice(0,10) <= today && row.snapshotDate.getUTCFullYear() === year);
    const snapshot = year === currentYear
      ? candidates.filter(row => row.investmentAmount !== null).sort((a,b) => b.snapshotDate.getTime()-a.snapshotDate.getTime())[0]
      : candidates.find(row => row.snapshotDate.toISOString().slice(0,10) === `${year}-12-31`);
    return { year, date: snapshot?.snapshotDate.toISOString().slice(0,10) ?? null,
      investmentAmount: snapshot?.investmentAmount?.toString() ?? null,
      status: !snapshot ? year === currentYear ? 'NOT_COLLECTED' : 'YEAR_END_MISSING' : snapshot.investmentAmount === null ? 'AMOUNT_MISSING' : 'AVAILABLE' };
  });
}
