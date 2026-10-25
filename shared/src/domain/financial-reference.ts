import type {FinancialStatement} from '../generated/prisma/index.js';

export function isFinancialReference(row: Pick<FinancialStatement,'source'> | undefined): boolean {
  return row?.source==='KIS_API_REFERENCE'||row?.source==='DART_PUBLIC_REFERENCE';
}

export function financialReferenceBasis(row: Pick<FinancialStatement,'source'|'sourceMetadata'>): string {
  if(row.source==='KIS_API_REFERENCE')return 'KIS_API:REFERENCE_UNVERIFIED_DIVISION';
  const metadata=row.sourceMetadata as {fsDivision?:string;accountingStandard?:string}|null;
  const division=['CFS','OFS'].includes(metadata?.fsDivision??'')?metadata!.fsDivision:'UNVERIFIED_DIVISION';
  const standard=['KIFRS','KGAAP'].includes(metadata?.accountingStandard??'')?metadata!.accountingStandard:'UNVERIFIED_STANDARD';
  return 'DART_PUBLIC:REFERENCE_'+division+':'+standard;
}
