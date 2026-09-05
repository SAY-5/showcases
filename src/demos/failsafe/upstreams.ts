// Replica pool: selection, passive failure marking, active health checks.
// Port of failsafe/upstreams.py.
import { CircuitBreaker, type BreakerOptions, type BreakerState } from './breaker';
import type { Clock } from './prng';

export interface HealthCheckConfig {
  intervalSeconds: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

export const DEFAULT_HEALTH: HealthCheckConfig = { intervalSeconds: 1, unhealthyThreshold: 1, healthyThreshold: 1 };

// The gateway's view of one upstream replica plus the process behind it.
export class Replica {
  readonly label: string;
  readonly breaker: CircuitBreaker;
  healthy: boolean;
  consecutiveOk = 0;
  consecutiveFail = 0;
  // Process state, invisible to the gateway except through probes and attempts.
  alive = true;
  // When set, the replica answers with this status instead of 200 (failure injection).
  failStatus: number | null = null;
  // When true, the replica accepts the connection and then never answers (timeout injection).
  hang = false;
  served = 0;

  constructor(label: string, breaker: CircuitBreaker, healthy: boolean) {
    this.label = label;
    this.breaker = breaker;
    this.healthy = healthy;
  }

  get available(): boolean {
    return this.healthy && this.breaker.state !== 'open';
  }
}

export type HealthHook = (replica: Replica, healthy: boolean, at: number) => void;

export class UpstreamPool {
  readonly replicas: Replica[] = [];
  readonly health: HealthCheckConfig;
  private readonly clock: Clock;
  private rr = 0;
  onHealth: HealthHook | undefined;

  constructor(
    labels: readonly string[],
    clock: Clock,
    breakerOpts: BreakerOptions,
    health: HealthCheckConfig,
    onTransition: (name: string, from: BreakerState, to: BreakerState) => void,
  ) {
    this.clock = clock;
    this.health = health;
    for (const label of labels) {
      const breaker = new CircuitBreaker(label, clock, breakerOpts);
      breaker.onTransition = (cb, from, to) => onTransition(cb.name, from, to);
      this.replicas.push(new Replica(label, breaker, false));
    }
  }

  get(label: string): Replica | undefined {
    return this.replicas.find((r) => r.label === label);
  }

  healthyCount(): number {
    return this.replicas.filter((r) => r.healthy).length;
  }

  // Round-robin over healthy replicas whose breaker admits the call.
  // `breaker.allow()` is only invoked on the replica actually returned.
  pick(exclude: ReadonlySet<string> = new Set()): Replica | null {
    const n = this.replicas.length;
    for (let i = 0; i < n; i++) {
      const r = this.replicas[(this.rr + i) % n];
      if (exclude.has(r.label) || !r.healthy) continue;
      if (r.breaker.allow()) {
        this.rr = (this.rr + i + 1) % n;
        return r;
      }
    }
    return null;
  }

  reportSuccess(replica: Replica): void {
    replica.breaker.recordSuccess();
  }

  reportFailure(replica: Replica, connectionFailed: boolean): void {
    replica.breaker.recordFailure();
    if (connectionFailed && replica.healthy) this.setHealth(replica, false);
  }

  private setHealth(replica: Replica, healthy: boolean): void {
    if (replica.healthy !== healthy) {
      replica.healthy = healthy;
      this.onHealth?.(replica, healthy, this.clock());
    }
    if (healthy) {
      replica.consecutiveFail = 0;
      replica.consecutiveOk = 0;
    } else {
      replica.consecutiveOk = 0;
      replica.consecutiveFail = Math.max(replica.consecutiveFail, 1);
    }
  }

  observeCheck(replica: Replica, ok: boolean): void {
    const hc = this.health;
    if (ok) {
      replica.consecutiveOk += 1;
      replica.consecutiveFail = 0;
      if (!replica.healthy && replica.consecutiveOk >= hc.healthyThreshold) this.setHealth(replica, true);
    } else {
      replica.consecutiveFail += 1;
      replica.consecutiveOk = 0;
      if (replica.healthy && replica.consecutiveFail >= hc.unhealthyThreshold) this.setHealth(replica, false);
    }
  }

  // One active probe round: a replica passes when its process is alive and not hanging.
  checkAll(): void {
    for (const r of this.replicas) this.observeCheck(r, r.alive && !r.hang);
  }
}

// Drives probe rounds on the virtual clock, like HealthChecker._loop in the gateway.
export class HealthChecker {
  private readonly pool: UpstreamPool;
  private readonly clock: Clock;
  private nextRound = 0;

  constructor(pool: UpstreamPool, clock: Clock) {
    this.pool = pool;
    this.clock = clock;
  }

  start(): void {
    this.pool.checkAll();
    this.nextRound = this.clock() + this.pool.health.intervalSeconds;
  }

  tick(): void {
    while (this.clock() >= this.nextRound) {
      this.pool.checkAll();
      this.nextRound += this.pool.health.intervalSeconds;
    }
  }
}
