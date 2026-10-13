/** Bounded, process-local cache. An invalidated in-flight result can never refill it. */
export class PageCache {
  private entries = new Map<string, { expires: number; promise: Promise<unknown> }>();
  constructor(private ttlMs = 10_000, private limit = 64, private now = Date.now) {}
  delete(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
  async get<T>(key: string, load: () => Promise<T>): Promise<{ value: T; status: 'HIT' | 'MISS' | 'COALESCED' }> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.now()) {
      const status = hit.expires === Infinity ? 'COALESCED' : 'HIT';
      return { value: await hit.promise as T, status };
    }
    if (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value!);
    const entry = { expires: Infinity, promise: Promise.resolve().then(load) };
    this.entries.set(key, entry);
    try {
      const value = await entry.promise;
      if (this.entries.get(key) === entry) entry.expires = this.now() + this.ttlMs;
      return { value, status: 'MISS' };
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }
}
