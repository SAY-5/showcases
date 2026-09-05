// Open-loop load generator: port of loadtest/run.py driven by a sim clock.
//
// Requests are admitted on schedule regardless of responses. Each one
// captures the primary at admission and completes a short while later, so a
// promote that lands between admission and completion is the exact case the
// zero-drop guarantee covers. Anything that is not a 2xx or a 422 is counted
// as dropped, the same accounting as the real load test.
import type { Trip } from './features';
import { Prng } from './prng';
import { Service, TripSource, type InFlight, type PredictOutcome } from './service';

export interface Outcome {
  seq: number;
  sentAt: number;
  latencyMs: number;
  status: number;
  version: string | null;
}

export type SecondSplit = { second: number; counts: Record<string, number>; dropped: number; rejected: number };

export interface LoadStats {
  sent: number;
  ok: number;
  dropped: number;
  rejected: number;
  achievedRps: number;
  elapsed: number;
  latency: { p50: number; p95: number; p99: number; max: number };
}

interface Pending {
  seq: number;
  req: InFlight;
  completeAt: number;
  serviceMs: number;
}

const LATENCY_WINDOW = 4000;

export class LoadGen {
  readonly service: Service;
  rps: number;
  running = false;
  private carry = 0;
  private seq = 0;
  private pending: Pending[] = [];
  private readonly trips: TripSource;
  private readonly delay: Prng;
  private readonly latencies: number[] = [];
  private latencyHead = 0;
  readonly timeline = new Map<number, SecondSplit>();
  startedAt: number;
  private lastSentAt = 0;
  sent = 0;
  ok = 0;
  dropped = 0;
  rejected = 0;
  // Fraction of admitted requests that are deliberately malformed.
  chaos = 0;
  private readonly chaosRng: Prng;

  constructor(service: Service, rps = 200, seed = 1) {
    this.service = service;
    this.rps = rps;
    this.trips = new TripSource(seed);
    this.delay = new Prng(seed * 31 + 7);
    this.chaosRng = new Prng(seed * 101 + 3);
    this.startedAt = service.now;
  }

  reset(): void {
    this.carry = 0;
    this.seq = 0;
    this.pending = [];
    this.latencies.length = 0;
    this.latencyHead = 0;
    this.timeline.clear();
    this.sent = this.ok = this.dropped = this.rejected = 0;
    this.startedAt = this.service.now;
    this.lastSentAt = 0;
  }

  start(): void {
    if (!this.running) {
      if (this.sent === 0) this.startedAt = this.service.now;
      this.running = true;
    }
  }

  stop(): void {
    this.running = false;
  }

  get elapsed(): number {
    return this.service.now - this.startedAt;
  }

  get inFlight(): number {
    return this.pending.length;
  }

  private malformed(trip: Trip): unknown {
    switch (this.chaosRng.int(5)) {
      case 0:
        return { ...trip, hour_of_day: String(trip.hour_of_day) };
      case 1:
        return { ...trip, pickup_zone_id: 13 };
      case 2:
        return { ...trip, distance_km: Number.NaN };
      case 3:
        return { ...trip, traffic_index: 1.4 };
      default:
        return { ...trip, driver_tip: 3 };
    }
  }

  // Advance the sim clock by dt seconds: admit the requests that fall due,
  // then complete the ones whose service time has elapsed.
  tick(dt: number): Outcome[] {
    const completed: Outcome[] = [];
    if (this.running) {
      this.carry += this.rps * dt;
      const n = Math.floor(this.carry);
      this.carry -= n;
      const t0 = this.service.now;
      for (let i = 0; i < n; i++) this.admitOne(t0 + (dt * i) / Math.max(n, 1), completed);
    }
    this.service.advance(dt);
    const now = this.service.now;
    if (this.pending.length) {
      const still: Pending[] = [];
      for (const p of this.pending) {
        if (p.completeAt <= now) completed.push(this.completeOne(p));
        else still.push(p);
      }
      this.pending = still;
    }
    return completed;
  }

  private admitOne(sentAt: number, completed: Outcome[]): void {
    const seq = this.seq++;
    this.sent += 1;
    this.lastSentAt = sentAt;
    const trip = this.trips.next();
    const body = this.chaos > 0 && this.chaosRng.next() < this.chaos ? this.malformed(trip) : trip;
    const admitted = this.service.admit(body);
    if (admitted.kind === 'done') {
      completed.push(this.record(seq, sentAt, 0, admitted.outcome));
      return;
    }
    // Service time: a short log-normal delay stands in for the async hop and
    // the padded forward pass; its median sits near the measured p50.
    const serviceMs = this.delay.logNormal(Math.log(1.75), 0.42);
    this.pending.push({ seq, req: admitted.req, completeAt: sentAt + serviceMs / 1000, serviceMs });
  }

  private completeOne(p: Pending): Outcome {
    const outcome = this.service.finish(p.req, p.serviceMs / 1000);
    return this.record(p.seq, p.req.sentAt, p.serviceMs, outcome);
  }

  private record(seq: number, sentAt: number, latencyMs: number, outcome: PredictOutcome): Outcome {
    const version = outcome.status === 200 ? outcome.modelVersion : null;
    const o: Outcome = { seq, sentAt, latencyMs, status: outcome.status, version };
    if (outcome.status === 200) {
      this.ok += 1;
      this.pushLatency(latencyMs);
    } else if (outcome.status === 422) {
      this.rejected += 1;
    } else {
      this.dropped += 1;
    }
    const second = Math.floor(sentAt - this.startedAt);
    let split = this.timeline.get(second);
    if (!split) {
      split = { second, counts: {}, dropped: 0, rejected: 0 };
      this.timeline.set(second, split);
      for (const key of [...this.timeline.keys()]) if (key < second - 60) this.timeline.delete(key);
    }
    if (version) split.counts[version] = (split.counts[version] ?? 0) + 1;
    if (outcome.status >= 500) split.dropped += 1;
    if (outcome.status === 422) split.rejected += 1;
    return o;
  }

  private pushLatency(ms: number): void {
    if (this.latencies.length < LATENCY_WINDOW) this.latencies.push(ms);
    else {
      this.latencies[this.latencyHead] = ms;
      this.latencyHead = (this.latencyHead + 1) % LATENCY_WINDOW;
    }
  }

  stats(): LoadStats {
    const lat = [...this.latencies].sort((a, b) => a - b);
    const pct = (p: number) =>
      lat.length ? lat[Math.min(lat.length - 1, Math.max(0, Math.round((p / 100) * (lat.length - 1))))] : 0;
    const span = Math.max(this.lastSentAt - this.startedAt, 1e-9);
    return {
      sent: this.sent,
      ok: this.ok,
      dropped: this.dropped,
      rejected: this.rejected,
      achievedRps: this.sent > 1 ? this.sent / span : 0,
      elapsed: this.elapsed,
      latency: { p50: pct(50), p95: pct(95), p99: pct(99), max: lat.length ? lat[lat.length - 1] : 0 },
    };
  }

  // The last `n` seconds of version split, oldest first.
  recentSplit(n: number): SecondSplit[] {
    const current = Math.floor(this.elapsed);
    const out: SecondSplit[] = [];
    for (let s = Math.max(0, current - n + 1); s <= current; s++) {
      out.push(this.timeline.get(s) ?? { second: s, counts: {}, dropped: 0, rejected: 0 });
    }
    return out;
  }
}
