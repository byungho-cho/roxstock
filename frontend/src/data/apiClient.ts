/** Same-origin API client. IDs and decimal values stay strings until a view needs a number. */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiEnvelope<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(response.status, payload?.error?.code ?? 'HTTP_ERROR', payload?.error?.message ?? `API 요청 실패 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data?: unknown };
  if (!('data' in payload)) throw new ApiError(response.status, 'INVALID_RESPONSE', 'API 응답에 data가 없습니다.');
  return payload as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const payload = await apiEnvelope<{ data: T }>(path, init);
  return payload?.data;
}
