/**
 * Rate limit em memória (janela deslizante). Suficiente para uma instância;
 * para múltiplas instâncias, troque por um adaptador Redis com a mesma interface.
 */
export interface RateLimiter {
  hit(key: string): { allowed: boolean; retryAfterSec: number };
  reset(key: string): void;
}

export function createMemoryRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key) {
      const now = Date.now();
      const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (list.length >= limit) {
        hits.set(key, list);
        return { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - list[0])) / 1000) };
      }
      list.push(now);
      hits.set(key, list);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      }
      return { allowed: true, retryAfterSec: 0 };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

const g = globalThis as unknown as { __loginLimiter?: RateLimiter };
/** 8 tentativas de login por IP+e-mail a cada 15 minutos. */
export const loginLimiter = (g.__loginLimiter ??= createMemoryRateLimiter(8, 15 * 60_000));
