// The whole demo in one object: a fleet of simulated drivers pinging the
// position index once a second, riders submitting trips, and the dispatcher
// sweeping pending trips on its poll interval. Time is a simulation clock in
// seconds; nothing here reads the wall clock.
//
// Match latency is modeled the way it arises in the real services: a trip
// waits for the next sweep (the dispatcher polls every 100 ms when idle), then
// pays for each partition read, each conditional claim and the PostgreSQL commit.
import { latLngToLocal, randomPoint, SimDriver } from './city';
import { PositionIndex } from './positions';
import { DEFAULT_RADII, findDriver, type MatchOutcome } from './matcher';
import { Rng } from './prng';
import { LatencyStats, MatchRate } from './stats';

export type TripStatus = 'requested' | 'matched' | 'en_route' | 'completed';

export interface Trip {
  id: string;
  pickupLat: number;
  pickupLng: number;
  status: TripStatus;
  driverId: string | null;
  requestedAt: number;
  matchedAt: number | null;
  startAt: number | null;
  completedAt: number | null;
  matchLatencyMs: number | null;
  dispatchAttempts: number;
  nextAttemptAt: number;
  manual: boolean;
  source: 'load' | 'ambient' | 'manual';
}

export interface WorldEvent {
  at: number;
  kind: 'request' | 'match' | 'no_driver' | 'complete' | 'silence';
  text: string;
}

// Cost model in milliseconds, tuned against the demo summary in the README.
const COST = {
  rowLock: 1.4, // SELECT ... FOR UPDATE SKIP LOCKED
  partitionRead: 0.9, // one DynamoDB Query per partition in the plan
  claim: 1.5, // one conditional UpdateItem
  commit: 2.0, // UPDATE trips + INSERT ride_events, commit
  jitter: 2.0, // network and scheduler noise
  submitJitter: 0.03, // seconds: HTTP round trip on POST /rides
  pollJitter: 0.004, // seconds: asyncio wakeup slack on the poll sleep
};

export const PICKUP_TO_START_S = 3;
export const START_TO_COMPLETE_S = 4;

export class World {
  readonly rng: Rng;
  readonly drivers: SimDriver[];
  readonly index: PositionIndex;
  readonly trips = new Map<string, Trip>();
  readonly tripOrder: string[] = [];
  readonly latency = new LatencyStats();
  readonly rate = new MatchRate();
  readonly log: WorldEvent[] = [];
  readonly silenced = new Set<string>();
  readonly ttlSeconds = 20;
  readonly pollIntervalS = 0.1;
  readonly pingIntervalS = 1;
  readonly retryDelayS = 1;
  readonly radii = DEFAULT_RADII;

  now = 0;
  sweeps = 0;
  nextSweepAt = 0;
  loadStartedAt = 0;
  loadTotal = 0;
  private readonly nextPingAt: number[];
  private readonly scheduled: { at: number }[] = [];
  private nextAmbientAt = 2;
  private readonly ambientRate = 0.6;
  private tripSeq = 0;
  private readonly riderRng: Rng;
  private readonly noiseRng: Rng;

  constructor(seed: number, driverCount = 300) {
    this.rng = new Rng(seed);
    this.riderRng = new Rng(7 + seed);
    this.noiseRng = new Rng(99 + seed);
    this.index = new PositionIndex(5, this.ttlSeconds);
    this.drivers = [];
    this.nextPingAt = [];
    for (let i = 0; i < driverCount; i++) {
      const id = `drv-${String(i).padStart(3, '0')}`;
      this.drivers.push(SimDriver.spawn(id, this.rng.fork()));
      this.nextPingAt.push(((i % 50) / 50) * this.pingIntervalS);
    }
    for (let i = 0; i < this.drivers.length; i++) this.ping(i, 0);
  }

  // -- riders ---------------------------------------------------------------

  // Queue `rate * durationS` submissions starting now, like sim/riders.py.
  scheduleLoad(rate: number, durationS: number): number {
    const total = Math.floor(rate * durationS);
    this.nextAmbientAt = this.now + durationS + 30;
    this.loadStartedAt = this.now;
    this.loadTotal = total;
    this.latency.reset();
    this.rate.reset();
    const gap = 1 / rate;
    for (let i = 0; i < total; i++) {
      this.scheduled.push({ at: this.now + i * gap + this.noiseRng.uniform(0, COST.submitJitter) });
    }
    this.scheduled.sort((a, b) => a.at - b.at);
    return total;
  }

  get scheduledRemaining(): number {
    return this.scheduled.length;
  }

  requestRide(pickup: [number, number], source: Trip['source']): Trip {
    const id = `trip-${String(++this.tripSeq).padStart(4, '0')}`;
    const trip: Trip = {
      id,
      pickupLat: pickup[0],
      pickupLng: pickup[1],
      status: 'requested',
      driverId: null,
      requestedAt: this.now,
      matchedAt: null,
      startAt: null,
      completedAt: null,
      matchLatencyMs: null,
      dispatchAttempts: 0,
      nextAttemptAt: this.now,
      manual: source === 'manual',
      source,
    };
    this.trips.set(id, trip);
    this.tripOrder.push(id);
    if (source === 'load') this.rate.noteRequest(this.now);
    this.push({ at: this.now, kind: 'request', text: `${id} requested` });
    return trip;
  }

  // Where a manual trip's latency comes from: the wait for the next sweep plus the work.
  estimateLatency(outcome: MatchOutcome): { waitMs: number; readsMs: number; claimsMs: number; commitMs: number; totalMs: number } {
    const waitMs = Math.max(0, this.nextSweepAt - this.now) * 1000 + COST.rowLock;
    const readsMs = COST.partitionRead * outcome.partitionReads;
    const claimsMs = COST.claim * outcome.claimAttempts;
    const commitMs = COST.commit;
    return { waitMs, readsMs, claimsMs, commitMs, totalMs: waitMs + readsMs + claimsMs + commitMs };
  }

  applyOutcome(trip: Trip, outcome: MatchOutcome, latencyMs: number): void {
    if (outcome.driver) this.markMatched(trip, outcome, this.now, latencyMs);
    else this.defer(trip, this.now);
  }

  // -- drivers --------------------------------------------------------------

  silence(driverId: string): void {
    if (this.silenced.has(driverId)) return;
    this.silenced.add(driverId);
    this.push({ at: this.now, kind: 'silence', text: `${driverId} stopped pinging` });
  }

  resume(driverId: string): void {
    this.silenced.delete(driverId);
  }

  private ping(i: number, at: number): void {
    const driver = this.drivers[i];
    const [lat, lng] = driver.latlng();
    const item = this.index.putPosition(driver.driverId, lat, lng, driver.heading, at);
    // follow assignment: head for the pickup while busy, wander when released
    const tripId = item.status === 'busy' ? item.tripId : null;
    if (tripId === driver.tripId) return;
    driver.tripId = tripId;
    if (tripId === null) {
      driver.clearTarget();
      return;
    }
    const trip = this.trips.get(tripId);
    if (trip) driver.setTarget(...latLngToLocal(trip.pickupLat, trip.pickupLng));
    else driver.clearTarget();
  }

  // -- dispatcher -----------------------------------------------------------

  private pendingBatch(at: number): Trip[] {
    const out: Trip[] = [];
    for (const id of this.tripOrder) {
      const trip = this.trips.get(id)!;
      if (trip.status === 'requested' && !trip.manual && trip.nextAttemptAt <= at) {
        out.push(trip);
        if (out.length >= 50) break;
      }
    }
    return out;
  }

  private sweep(at: number): number {
    let cursor = at + (COST.rowLock + this.noiseRng.uniform(0, COST.jitter)) / 1000;
    let matched = 0;
    for (const trip of this.pendingBatch(at)) {
      const outcome = findDriver(this.index, trip.pickupLat, trip.pickupLng, trip.id, cursor, this.radii);
      const costMs =
        COST.partitionRead * outcome.partitionReads +
        COST.claim * outcome.claimAttempts +
        COST.commit +
        this.noiseRng.uniform(0, COST.jitter);
      cursor += costMs / 1000;
      if (outcome.driver) {
        this.markMatched(trip, outcome, cursor, Math.round((cursor - trip.requestedAt) * 1000));
        matched += 1;
      } else {
        this.defer(trip, cursor);
      }
    }
    this.sweeps += 1;
    this.nextSweepAt =
      matched > 0 ? cursor : cursor + this.pollIntervalS + this.noiseRng.uniform(0, COST.pollJitter);
    return matched;
  }

  private markMatched(trip: Trip, outcome: MatchOutcome, at: number, latencyMs: number): void {
    const driver = outcome.driver!;
    trip.status = 'matched';
    trip.driverId = driver.driverId;
    trip.matchedAt = at;
    trip.matchLatencyMs = latencyMs;
    trip.dispatchAttempts += 1;
    trip.startAt = at + PICKUP_TO_START_S;
    if (trip.source === 'load') {
      this.latency.push(latencyMs);
      this.rate.noteMatch(at);
    }
    this.push({
      at,
      kind: 'match',
      text: `${trip.id} matched ${driver.driverId} at ${Math.round(driver.distanceM)} m in ${latencyMs} ms`,
    });
  }

  private defer(trip: Trip, at: number): void {
    trip.dispatchAttempts += 1;
    trip.nextAttemptAt = at + this.retryDelayS;
    this.push({ at, kind: 'no_driver', text: `${trip.id} no driver within 4 km, retry in 1 s` });
  }

  // -- trip lifecycle -------------------------------------------------------

  private nextLifecycleAt(): number {
    let t = Infinity;
    for (const id of this.tripOrder) {
      const trip = this.trips.get(id)!;
      if (trip.status === 'matched' && trip.startAt !== null) t = Math.min(t, trip.startAt);
      else if (trip.status === 'en_route' && trip.completedAt !== null) t = Math.min(t, trip.completedAt);
    }
    return t;
  }

  private advanceLifecycle(at: number): void {
    for (const id of this.tripOrder) {
      const trip = this.trips.get(id)!;
      if (trip.status === 'matched' && trip.startAt !== null && trip.startAt <= at) {
        trip.status = 'en_route';
        trip.completedAt = trip.startAt + START_TO_COMPLETE_S;
      }
      if (trip.status === 'en_route' && trip.completedAt !== null && trip.completedAt <= at) {
        trip.status = 'completed';
        if (trip.driverId) this.index.setStatus(trip.driverId, 'available');
        this.push({ at: trip.completedAt, kind: 'complete', text: `${id} completed, ${trip.driverId} released` });
      }
    }
  }

  // -- clock ----------------------------------------------------------------

  // Advance the simulation by dtS seconds.
  tick(dtS: number): void {
    const target = this.now + dtS;
    for (let guard = 0; guard < 10_000; guard++) {
      const nextSubmit = this.scheduled.length ? this.scheduled[0].at : Infinity;
      const nextAmbient = this.scheduled.length === 0 ? this.nextAmbientAt : Infinity;
      const nextLife = this.nextLifecycleAt();
      const t = Math.min(nextSubmit, nextAmbient, this.nextSweepAt, nextLife);
      if (t > target) break;
      this.now = Math.max(this.now, t);
      if (t === nextSubmit) {
        this.scheduled.shift();
        this.requestRide(randomPoint(this.riderRng), 'load');
      } else if (t === nextAmbient) {
        this.nextAmbientAt = t + this.noiseRng.uniform(0.4, 1.6) / this.ambientRate;
        this.requestRide(randomPoint(this.riderRng), 'ambient');
      } else if (t === nextLife) {
        this.advanceLifecycle(t);
      } else {
        this.sweep(t);
      }
    }
    this.now = target;
    for (let i = 0; i < this.drivers.length; i++) {
      this.drivers[i].step(dtS);
      if (this.nextPingAt[i] <= target) {
        this.nextPingAt[i] += this.pingIntervalS;
        if (this.nextPingAt[i] <= target) this.nextPingAt[i] = target + this.pingIntervalS;
        if (!this.silenced.has(this.drivers[i].driverId)) this.ping(i, target);
      }
    }
  }

  // -- summary --------------------------------------------------------------

  counts(): { submitted: number; matched: number; completed: number; pending: number; busy: number } {
    let submitted = 0;
    let matched = 0;
    let completed = 0;
    let pending = 0;
    for (const id of this.tripOrder) {
      const trip = this.trips.get(id)!;
      if (trip.source !== 'load' || trip.requestedAt < this.loadStartedAt) continue;
      submitted += 1;
      if (trip.status === 'requested') pending += 1;
      else if (trip.status === 'completed') {
        matched += 1;
        completed += 1;
      } else matched += 1;
    }
    let busy = 0;
    for (const d of this.drivers) if (this.index.getDriver(d.driverId)?.status === 'busy') busy += 1;
    return { submitted, matched, completed, pending, busy };
  }

  private push(event: WorldEvent): void {
    this.log.push(event);
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }
}
