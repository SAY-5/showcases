// Token-bucket rate limiting keyed by client identity. Port of failsafe/ratelimit.py.
import type { Clock } from './prng';

export interface Decision {
  allowed: boolean;
  remaining: number;
  // Seconds until at least one token is available (0 when allowed).
  retryAfter: number;
}

export class TokenBucket {
  readonly capacity: number;
  readonly refillRate: number;
  private readonly clock: Clock;
  private tokensNow: number;
  private updated: number;

  constructor(capacity: number, refillRate: number, clock: Clock) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.clock = clock;
    this.tokensNow = capacity;
    this.updated = clock();
  }

  private refill(now: number): void {
    const elapsed = now - this.updated;
    if (elapsed > 0) {
      this.tokensNow = Math.min(this.capacity, this.tokensNow + elapsed * this.refillRate);
      this.updated = now;
    }
  }

  get tokens(): number {
    this.refill(this.clock());
    return this.tokensNow;
  }

  tryAcquire(cost = 1): Decision {
    const now = this.clock();
    this.refill(now);
    if (this.tokensNow >= cost) {
      this.tokensNow -= cost;
      return { allowed: true, remaining: this.tokensNow, retryAfter: 0 };
    }
    const deficit = cost - this.tokensNow;
    return { allowed: false, remaining: this.tokensNow, retryAfter: deficit / this.refillRate };
  }
}

export class RateLimiter {
  readonly capacity: number;
  readonly refillRate: number;
  private readonly clock: Clock;
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(capacity: number, refillRate: number, clock: Clock) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.clock = clock;
  }

  bucket(key: string): TokenBucket {
    let b = this.buckets.get(key);
    if (b === undefined) {
      b = new TokenBucket(this.capacity, this.refillRate, this.clock);
      this.buckets.set(key, b);
    }
    return b;
  }

  check(key: string, cost = 1): Decision {
    return this.bucket(key).tryAcquire(cost);
  }
}

// Retry-After must be an integer number of seconds; round up so clients never retry early.
export function retryAfterHeader(seconds: number): string {
  return String(Math.max(1, Math.ceil(seconds)));
}
