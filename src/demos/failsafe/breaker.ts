// Circuit breaker with closed / open / half-open states. Port of failsafe/breaker.py.
import type { Clock } from './prng';

export type BreakerState = 'closed' | 'open' | 'half_open';

export type TransitionHook = (breaker: CircuitBreaker, from: BreakerState, to: BreakerState) => void;

export interface BreakerOptions {
  window: number;
  failureRatio: number;
  minRequests: number;
  consecutiveFailures: number;
  openSeconds: number;
  halfOpenMax: number;
}

export const DEFAULT_BREAKER: BreakerOptions = {
  window: 20,
  failureRatio: 0.5,
  minRequests: 5,
  consecutiveFailures: 3,
  openSeconds: 3,
  halfOpenMax: 2,
};

export class CircuitBreaker {
  readonly name: string;
  readonly opts: BreakerOptions;
  private readonly clock: Clock;
  onTransition: TransitionHook | undefined;

  private current: BreakerState = 'closed';
  // Sliding window of outcomes, true == failure, bounded to `window`.
  private outcomes: boolean[] = [];
  private consecutive = 0;
  private openedAt = 0;
  private probesInFlight = 0;
  private probesSucceeded = 0;

  constructor(name: string, clock: Clock, opts: BreakerOptions = DEFAULT_BREAKER) {
    this.name = name;
    this.clock = clock;
    this.opts = opts;
  }

  get state(): BreakerState {
    this.maybeHalfOpen(this.clock());
    return this.current;
  }

  get failureRate(): number {
    if (this.outcomes.length === 0) return 0;
    return this.outcomes.filter(Boolean).length / this.outcomes.length;
  }

  get windowSnapshot(): readonly boolean[] {
    return this.outcomes;
  }

  get consecutiveCount(): number {
    return this.consecutive;
  }

  get probes(): { inFlight: number; succeeded: number } {
    return { inFlight: this.probesInFlight, succeeded: this.probesSucceeded };
  }

  timeUntilProbe(): number {
    if (this.current !== 'open') return 0;
    return Math.max(0, this.openedAt + this.opts.openSeconds - this.clock());
  }

  // True if a call may proceed. Half-open probes are counted here.
  allow(): boolean {
    const now = this.clock();
    this.maybeHalfOpen(now);
    if (this.current === 'closed') return true;
    if (this.current === 'open') return false;
    if (this.probesInFlight + this.probesSucceeded < this.opts.halfOpenMax) {
      this.probesInFlight += 1;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.consecutive = 0;
    if (this.current === 'half_open') {
      this.probesInFlight = Math.max(0, this.probesInFlight - 1);
      this.probesSucceeded += 1;
      if (this.probesSucceeded >= this.opts.halfOpenMax) this.transition('closed');
      return;
    }
    this.push(false);
  }

  recordFailure(): void {
    const now = this.clock();
    this.consecutive += 1;
    if (this.current === 'half_open') {
      this.open(now);
      return;
    }
    if (this.current === 'open') return;
    this.push(true);
    if (this.consecutive >= this.opts.consecutiveFailures) {
      this.open(now);
      return;
    }
    const n = this.outcomes.length;
    const failures = this.outcomes.filter(Boolean).length;
    if (n >= this.opts.minRequests && failures / n >= this.opts.failureRatio) this.open(now);
  }

  reset(): void {
    this.transition('closed');
  }

  private push(failure: boolean): void {
    this.outcomes.push(failure);
    if (this.outcomes.length > this.opts.window) this.outcomes.shift();
  }

  private maybeHalfOpen(now: number): void {
    if (this.current === 'open' && now - this.openedAt >= this.opts.openSeconds) this.transition('half_open');
  }

  private open(now: number): void {
    this.openedAt = now;
    this.transition('open');
  }

  private transition(next: BreakerState): void {
    const old = this.current;
    if (next === 'closed') {
      this.outcomes = [];
      this.consecutive = 0;
    }
    if (next !== 'half_open' || old !== 'half_open') {
      this.probesInFlight = 0;
      this.probesSucceeded = 0;
    }
    this.current = next;
    if (old !== next && this.onTransition) this.onTransition(this, old, next);
  }
}
