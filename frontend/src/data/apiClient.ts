/** Same-origin API client. IDs and decimal values stay strings until a view needs a number. */
import { fetchRead } from './readBatch';
import {csrfToken,identityHeaders} from '../auth/client';
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiEnvelope<T>(path: string, init: RequestInit = {}): Promise<T> {
  const write=!['GET','HEAD','OPTIONS'].includes((init.method??'GET').toUpperCase());
  const response = await fetchRead(path, write || init.body || init.headers ? {
    ...init, ...(write?{body:init.body??'{}'}:{}),headers: { ...(write||init.body ? { 'Content-Type': 'application/json','X-CSRF-Token':csrfToken(),...identityHeaders() } : {}), ...init.headers },
  } : init);
  if (!response.ok) {
    if(response.status===401)window.dispatchEvent(new Event('roxstock-auth-required'));
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if((response.status===403&&payload?.error?.code==='ADMIN_REQUIRED')||(response.status===409&&payload?.error?.code==='IDENTITY_CHANGED'))window.dispatchEvent(new CustomEvent('roxstock-auth-required',{detail:payload?.error?.code}));
    throw new ApiError(response.status, payload?.error?.code ?? 'HTTP_ERROR', payload?.error?.message ?? `API 요청 실패 (${response.status})`);
  }
  if (init.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase())) window.dispatchEvent(new Event('roxstock-data-mutated'));
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data?: unknown };
  if (!('data' in payload)) throw new ApiError(response.status, 'INVALID_RESPONSE', 'API 응답에 data가 없습니다.');
  return payload as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const payload = await apiEnvelope<{ data: T }>(path, init);
  return payload?.data;
}
