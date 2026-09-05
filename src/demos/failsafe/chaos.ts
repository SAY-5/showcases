// The chaos run: a fixed request rate through the gateway while replicas are
// SIGKILLed and restarted. Mirrors chaos/run.py + chaos/kill.sh on a virtual
// clock. The same object also serves the hand-driven panels: the token
// bucket, the breaker state machine and single requests.
import { DEFAULT_BREAKER } from './breaker';
import { Gateway, type RequestResult } from './gateway';
import { Prng, VirtualClock } from './prng';
import { RateLimiter } from './ratelimit';
import { RetryPolicy } from './retry';
import { DEFAULT_HEALTH, HealthChecker, UpstreamPool } from './upstreams';

// routes.yaml defaults for the /orders route and the compose chaos target.
export const CHAOS = {
  seed: 20260903,
  durationSeconds: 45,
  rps: 150,
  replicas: 3,
  killIntervalMin: 8,
  killIntervalMax: 13,
  restartAfter: 3,
  postShare: 0.25,
  rateLimit: { capacity: 200, refillPerSecond: 400 },
  retry: { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 150 },
};

export type TimelineKind = 'kill' | 'start' | 'unhealthy' | 'healthy' | 'breaker';

export interface TimelineEvent {
  at: number;
  kind: TimelineKind;
  replica: string;
  note?: string;
}

export class ChaosRun {
  readonly clock = new VirtualClock();
  readonly rng: Prng;
  readonly pool: UpstreamPool;
  readonly gateway: Gateway;
  readonly checker: HealthChecker;
  readonly timeline: TimelineEvent[] = [];
  // Requests whose lifecycle included a retry, most recent last.
  readonly retried: RequestResult[] = [];
  // The most recent completions, for the fan-out view.
  readonly recent: RequestResult[] = [];
  readonly perSecond: { second: number; ok: number; failed: number; retried: number }[] = [];
  kills = 0;
  running = false;
  autoChaos = false;
  startedAt = 0;
  private nextArrival = Infinity;
  private nextKill = Infinity;
  private pendingRestarts: { at: number; label: string }[] = [];
  private nextId = 1;
  private bucketSecond = 0;
  private bucket = { ok: 0, failed: 0, retried: 0 };

  constructor() {
    this.rng = new Prng(CHAOS.seed);
    this.pool = new UpstreamPool(
      Array.from({ length: CHAOS.replicas }, (_, i) => `upstream-${i + 1}`),
      this.clock.now,
      DEFAULT_BREAKER,
      DEFAULT_HEALTH,
      (name, from, to) => {
        this.gateway.metrics.recordTransition(this.clock.now(), name, from, to);
        this.push({ at: this.clock.now(), kind: 'breaker', replica: name, note: `${from} -> ${to}` });
      },
    );
    this.pool.onHealth = (r, healthy, at) => this.push({ at, kind: healthy ? 'healthy' : 'unhealthy', replica: r.label });
    const policy = new RetryPolicy(CHAOS.retry.maxAttempts, CHAOS.retry.baseDelayMs / 1000, CHAOS.retry.maxDelayMs / 1000);
    const limiter = new RateLimiter(CHAOS.rateLimit.capacity, CHAOS.rateLimit.refillPerSecond, this.clock.now);
    this.gateway = new Gateway(this.pool, policy, this.rng, this.clock.now, { timeoutSeconds: 2, idempotentPost: false }, limiter);
    this.gateway.onResult = (r) => this.onResult(r);
    this.checker = new HealthChecker(this.pool, this.clock.now);
    this.checker.start();
  }

  get now(): number {
    return this.clock.now();
  }

  get elapsed(): number {
    return this.now - this.startedAt;
  }

  get arrivalsDone(): boolean {
    return this.nextArrival === Infinity;
  }

  get finished(): boolean {
    return this.running && this.arrivalsDone && this.gateway.inflightCount === 0;
  }

  private push(e: TimelineEvent): void {
    this.timeline.push(e);
    if (this.timeline.length > 60) this.timeline.shift();
  }

  // Start the load: `rps` for `durationSeconds`, with a random replica killed
  // every few seconds and restarted after `restartAfter`.
  start(): void {
    this.running = true;
    this.startedAt = this.now;
    this.nextArrival = this.now;
    this.autoChaos = true;
    this.scheduleKill(2 + this.rng.uniform(0, 3));
    this.kills = 0;
  }

  private scheduleKill(delay: number): void {
    this.nextKill = this.now + delay;
  }

  // Kill a specific replica (or a random live one) right now, like kill.sh.
  kill(label?: string): string | null {
    const live = this.pool.replicas.filter((r) => r.alive);
    if (live.length <= 1) return null;
    const target = label ? live.find((r) => r.label === label) : this.rng.pick(live);
    if (!target) return null;
    this.gateway.kill(target);
    this.kills += 1;
    this.push({ at: this.now, kind: 'kill', replica: target.label });
    this.pendingRestarts.push({ at: this.now + CHAOS.restartAfter, label: target.label });
    return target.label;
  }

  private restart(label: string): void {
    const r = this.pool.get(label);
    if (!r || r.alive) return;
    this.gateway.restart(r);
    this.push({ at: this.now, kind: 'start', replica: label });
  }

  // One hand-sent request through the whole path.
  send(method: 'GET' | 'POST', idempotencyKey: boolean, clientKey = 'key:demo'): void {
    const id = this.nextId++;
    this.gateway.submit({
      id,
      method,
      path: method === 'POST' ? '/orders' : `/orders/${1 + this.rng.int(500)}`,
      headers: idempotencyKey ? { 'Idempotency-Key': `demo-${id}` } : undefined,
      clientKey,
    });
  }

  private nextEventAt(): number {
    let t = this.gateway.nextEventAt();
    if (this.nextArrival < t) t = this.nextArrival;
    if (this.nextKill < t) t = this.nextKill;
    for (const p of this.pendingRestarts) if (p.at < t) t = p.at;
    const nextSecond = Math.floor(this.now) + 1;
    if (nextSecond < t) t = nextSecond;
    return t;
  }

  // Advance the virtual clock by `seconds`, resolving every event in order.
  step(seconds: number): void {
    const target = this.now + seconds;
    for (;;) {
      const t = this.nextEventAt();
      if (t > target) break;
      this.clock.set(t);
      this.dispatch();
    }
    this.clock.set(target);
    this.dispatch();
  }

  private dispatch(): void {
    const now = this.now;
    if (Math.floor(now) !== this.bucketSecond) this.flushBucket(Math.floor(now));
    this.checker.tick();
    for (const p of [...this.pendingRestarts]) {
      if (p.at <= now) {
        this.restart(p.label);
        this.pendingRestarts = this.pendingRestarts.filter((x) => x !== p);
      }
    }
    const endAt = this.startedAt + CHAOS.durationSeconds;
    if (now >= this.nextKill) {
      if (this.autoChaos && now < endAt - CHAOS.restartAfter) {
        this.kill();
        this.scheduleKill(this.rng.uniform(CHAOS.killIntervalMin, CHAOS.killIntervalMax));
      } else {
        this.autoChaos = false;
        this.nextKill = Infinity;
      }
    }
    while (this.nextArrival <= now) {
      if (this.nextArrival >= endAt) {
        this.nextArrival = Infinity;
        break;
      }
      this.submitOne();
      this.nextArrival += 1 / CHAOS.rps;
    }
    this.gateway.advance();
  }

  private submitOne(): void {
    const id = this.nextId++;
    const isPost = this.rng.next() < CHAOS.postShare;
    this.gateway.submit({
      id,
      method: isPost ? 'POST' : 'GET',
      path: isPost ? '/orders' : `/orders/${1 + this.rng.int(500)}`,
      headers: isPost ? { 'Idempotency-Key': `chaos-${id}` } : undefined,
      clientKey: 'key:chaos',
    });
  }

  private onResult(r: RequestResult): void {
    this.recent.push(r);
    if (this.recent.length > 12) this.recent.shift();
    if (r.status >= 200 && r.status < 300) this.bucket.ok += 1;
    if (r.status >= 500) this.bucket.failed += 1;
    if (r.attempts.length > 1) {
      this.bucket.retried += 1;
      this.retried.push(r);
      if (this.retried.length > 20) this.retried.shift();
    }
  }

  private flushBucket(second: number): void {
    if (this.running) {
      this.perSecond.push({ second: this.bucketSecond, ...this.bucket });
      if (this.perSecond.length > 45) this.perSecond.shift();
    }
    this.bucket = { ok: 0, failed: 0, retried: 0 };
    this.bucketSecond = second;
  }
}
