// The serving layer: port of the request path in modelgate/serving/app.py.
//
// A request is split into `admit` (validation, capture the primary) and
// `finish` (inference, shadow run, metrics) so the load generator can hold
// requests in flight across a swap exactly the way the async server does.
import { encode, type Trip } from './features';
import { MetricSet } from './metrics';
import { Prng } from './prng';
import { ModelRegistry, type LoadedModel, type SwapRecord } from './registry';
import { ShadowTracker, type ShadowReport } from './shadow';
import { parseBody, validateBody, type Rejection } from './validate';

export interface PredictOk {
  status: 200;
  etaMinutes: number;
  modelVersion: string;
  requestId: string;
  shadow?: { version: string; etaMinutes: number; absDelta: number };
}

export interface PredictRejected {
  status: 422;
  rejections: Rejection[];
  requestId: string;
}

export interface PredictError {
  status: 503;
  error: string;
  requestId: string;
}

export type PredictOutcome = PredictOk | PredictRejected | PredictError;

export interface InFlight {
  requestId: string;
  primary: LoadedModel;
  features: Float32Array;
  sentAt: number;
}

export type Admitted = { kind: 'inflight'; req: InFlight } | { kind: 'done'; outcome: PredictOutcome };

export class Service {
  readonly metrics = new MetricSet();
  readonly registry: ModelRegistry;
  readonly tracker: ShadowTracker;
  private readonly ids: Prng;
  private simTime = 0;

  constructor(seed = 7) {
    this.registry = new ModelRegistry(this.metrics, () => this.simTime);
    this.tracker = new ShadowTracker(2.0, 5000);
    this.ids = new Prng(seed * 7919 + 13);
  }

  get now(): number {
    return this.simTime;
  }

  advance(dtSeconds: number): void {
    this.simTime += dtSeconds;
  }

  // Lifespan: load the lowest version as primary.
  boot(primary = 'v1'): void {
    this.registry.promote(primary);
  }

  private nextRequestId(): string {
    let s = '';
    for (let i = 0; i < 3; i++) s += this.ids.int(0x10000).toString(16).padStart(4, '0');
    return s;
  }

  // Validation plus primary capture. Returns either an in-flight handle or a
  // finished outcome (422 for rejected input, 503 with no primary).
  admit(body: unknown): Admitted {
    const requestId = this.nextRequestId();
    const result = typeof body === 'string' ? parseBody(body) : validateBody(body);
    if (!result.ok) {
      const reasons = new Set(result.rejections.map((r) => r.reason));
      for (const reason of reasons) this.metrics.inputRejections.inc({ reason });
      const primary = this.registry.primary;
      this.metrics.requests.inc({ version: primary ? primary.version : 'none', outcome: 'rejected' });
      return { kind: 'done', outcome: { status: 422, rejections: result.rejections, requestId } };
    }
    const primary = this.registry.primary;
    if (primary === null) {
      this.metrics.droppedRequests.inc();
      this.metrics.requests.inc({ version: 'none', outcome: 'error' });
      return { kind: 'done', outcome: { status: 503, error: 'no primary model loaded', requestId } };
    }
    return { kind: 'inflight', req: { requestId, primary, features: encode(result.trip), sentAt: this.simTime } };
  }

  // Inference on the captured primary, shadow run, metrics, response.
  finish(req: InFlight, latencyS: number): PredictOutcome {
    const { primary, features, requestId } = req;
    const eta = primary.net.forward(features);
    this.metrics.requests.inc({ version: primary.version, outcome: 'ok' });
    this.metrics.predictionsEta.observe({ version: primary.version }, eta);
    this.metrics.requestLatency.observe({ version: primary.version }, latencyS);

    const out: PredictOk = {
      status: 200,
      etaMinutes: Math.round(eta * 100) / 100,
      modelVersion: primary.version,
      requestId,
    };
    const shadow = this.registry.shadow;
    if (shadow !== null && shadow.version !== primary.version) {
      // The shadow path never affects the client response.
      const shadowEta = shadow.net.forward(features);
      const delta = Math.abs(shadowEta - eta);
      this.metrics.shadowRequests.inc({ shadow: shadow.version, outcome: 'ok' });
      this.metrics.shadowDivergence.observe({ primary: primary.version, shadow: shadow.version }, delta);
      this.tracker.record({
        requestId,
        primaryVersion: primary.version,
        shadowVersion: shadow.version,
        primaryEta: eta,
        shadowEta,
        at: this.simTime,
      });
      out.shadow = { version: shadow.version, etaMinutes: Math.round(shadowEta * 100) / 100, absDelta: delta };
    }
    return out;
  }

  // One-shot predict for the request builder.
  predict(body: unknown): PredictOutcome {
    const admitted = this.admit(body);
    return admitted.kind === 'done' ? admitted.outcome : this.finish(admitted.req, 0.0018);
  }

  // ---- admin ------------------------------------------------------------

  setShadow(version: string | null): void {
    if (version !== null && this.registry.primary?.version === version) return;
    this.registry.setShadow(version);
    this.tracker.reset();
  }

  shadowReport(): ShadowReport {
    return this.tracker.report();
  }

  // Load and warm happens off the request path; the swap is the reference
  // assignment under the lock.
  promote(version: string): SwapRecord | null {
    if (!this.registry.isKnown(version)) return null;
    return this.registry.promote(version);
  }

  rollback(): SwapRecord | null {
    return this.registry.rollback();
  }

  exposition(): string {
    return this.metrics.expose();
  }
}

// Random trips, the same distribution as loadtest/run.py::random_trip.
export class TripSource {
  private readonly rng: Prng;

  constructor(seed: number) {
    this.rng = new Prng(seed);
  }

  next(): Trip {
    return {
      distance_km: Math.round(this.rng.logNormal(1.6, 0.7) * 100) / 100,
      hour_of_day: this.rng.int(24),
      day_of_week: this.rng.int(7),
      pickup_zone_id: this.rng.int(12) + 1,
      traffic_index: Math.round(this.rng.next() * 1000) / 1000,
      is_raining: this.rng.next() < 0.2,
    };
  }
}
