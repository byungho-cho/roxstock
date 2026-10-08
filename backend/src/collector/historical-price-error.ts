export type PriceFailureCategory = 'AUTH' | 'PERMISSION' | 'COMMUNICATION' | 'RATE_LIMIT' | 'PROVIDER' | 'PARSE' | 'NO_DATA';
/** Only allowlisted codes are carried into logs; never provider bodies or request headers. */
export class HistoricalPriceError extends Error {
  readonly providerCode?: string;
  constructor(public readonly code: string, public readonly category: PriceFailureCategory, providerCode?: string) {
    super(code);
    this.providerCode = providerCode && (/^\d{1,3}$/.test(providerCode) || ['SERVICE_KEY_IS_NOT_REGISTERED_ERROR','SERVICE_ACCESS_DENIED_ERROR'].includes(providerCode)) ? providerCode : providerCode ? 'UNRECOGNIZED' : undefined;
  }
}
