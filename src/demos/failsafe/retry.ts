// Retry policy: idempotency rules, bounded attempts, full-jitter backoff.
// Port of failsafe/retry.py.
import type { Prng } from './prng';

export const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE']);
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

// Where an attempt failed. Decides whether a retry is safe.
export type FailureKind = 'connect' | 'timeout' | 'read' | 'status';

export function isIdempotent(method: string, headers: Record<string, string> | undefined, idempotentPost = false): boolean {
  const m = method.toUpperCase();
  if (IDEMPOTENT_METHODS.has(m)) return true;
  if (m === 'POST' || m === 'PATCH') {
    if (idempotentPost) return true;
    if (headers) {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === IDEMPOTENCY_KEY_HEADER && headers[k]) return true;
      }
    }
  }
  return false;
}

export class RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly retryOnStatus = new Set([500, 502, 503, 504]);

  constructor(maxAttempts = 3, baseDelay = 0.02, maxDelay = 0.25) {
    this.maxAttempts = maxAttempts;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }

  // `attempt` is 1-based: the number of attempts already made.
  shouldRetry(attempt: number, kind: FailureKind, idempotent: boolean): boolean {
    if (attempt >= this.maxAttempts) return false;
    if (kind === 'connect') return true;
    return idempotent;
  }

  // Ceiling of the jitter window for a given attempt, in seconds.
  ceiling(attempt: number): number {
    return Math.min(this.maxDelay, this.baseDelay * 2 ** (attempt - 1));
  }

  // Full-jitter exponential backoff: uniform(0, min(max, base * 2**(attempt-1))).
  backoff(attempt: number, rng: Prng): number {
    return rng.uniform(0, this.ceiling(attempt));
  }
}
