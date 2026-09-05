// The whole stack in one deterministic engine driven by a simulated clock:
// the fleet pings positions once a second into Redis GEO and the
// driver-positions topic, the ride source posts requests at a fixed rate
// (shard insert + produce to ride-requests), and the Streams task polls
// ride-requests, runs the Matcher, and branches into ride-matches or
// ride-unmatched.
import { MemoryDriverIndex, type DriverPosition } from './driverIndex';
import { drawMatchLatencyMs, drawPollDelayMs } from './latency';
import { DEFAULT_PROPS, Matcher, type Match, type MatchTrace, type RideRequest, type RideUnmatched } from './matcher';
import { Rng } from './rng';
import { CityShardRouter } from './shard';
import { MatchStats } from './stats';
import { Consumer, TOPIC_DRIVER_POSITIONS, TOPIC_RIDE_MATCHES, TOPIC_RIDE_REQUESTS, TOPIC_RIDE_UNMATCHED, Topic } from './topics';
import { CITIES, Fleet, RideSource, type City } from './world';

export const HEARTBEAT_TTL_MS = 15_000;
export const RIDES_PER_SECOND = 10;
export const RUN_MS = 60_000;

export interface TripRow {
  rideId: string;
  cityId: number;
  status: 'REQUESTED' | 'MATCHED' | 'UNMATCHED';
  driverId: string | null;
}

export interface FeedEvent {
  at: number;
  kind: 'match' | 'unmatched';
  text: string;
}

export class Engine {
  readonly cities: City[] = CITIES;
  readonly router = new CityShardRouter(2);
  readonly index: MemoryDriverIndex;
  readonly matcher: Matcher;
  readonly stats: MatchStats;
  readonly fleet: Fleet;
  readonly rides: RideSource;
  readonly rideRequests = new Topic<RideRequest>(TOPIC_RIDE_REQUESTS);
  readonly driverPositions = new Topic<DriverPosition>(TOPIC_DRIVER_POSITIONS);
  readonly rideMatches = new Topic<Match>(TOPIC_RIDE_MATCHES);
  readonly rideUnmatched = new Topic<RideUnmatched>(TOPIC_RIDE_UNMATCHED);
  readonly streamsConsumer: Consumer<RideRequest>;
  readonly shards: Map<string, TripRow>[] = [new Map(), new Map()];
  readonly feed: FeedEvent[] = [];
  private readonly rnd: Rng;
  private now = 0;
  private nextPingAt = 1000;
  private nextRideAt = Infinity;
  private nextPollAt = 0;
  private runEndsAt = 0;
  submitted = 0;
  loadRuns = 0;
  pingsOk = 0;
  manualSeq = 0;
  // Partition activity in the last tick, for the pipeline view.
  readonly partitionPulse: number[] = new Array<number>(6).fill(0);

  constructor(seed = 7) {
    this.index = new MemoryDriverIndex(() => this.now);
    this.matcher = new Matcher(this.index, DEFAULT_PROPS, () => this.now);
    this.stats = new MatchStats(() => this.now);
    this.fleet = new Fleet(this.cities, 300, seed);
    this.rides = new RideSource(this.cities, seed + 99);
    this.streamsConsumer = new Consumer(this.rideRequests);
    this.rnd = new Rng(seed * 31 + 5);
    // The load generator seeds the index with one round of pings before rides start.
    for (const d of this.fleet.drivers) this.ping(d.position(this.now));
  }

  get time(): number {
    return this.now;
  }

  get loadRunning(): boolean {
    return this.nextRideAt !== Infinity;
  }

  get loadEndsAt(): number {
    return this.runEndsAt;
  }

  // Start the 60 s load run: 10 rides a second, round-robin across cities.
  startLoad(): void {
    if (this.loadRunning) return;
    this.loadRuns += 1;
    this.nextRideAt = this.now;
    this.runEndsAt = this.now + RUN_MS;
  }

  stopLoad(): void {
    this.nextRideAt = Infinity;
  }

  private ping(p: DriverPosition): void {
    this.index.upsert(p, HEARTBEAT_TTL_MS);
    this.driverPositions.append(String(p.cityId), p, this.now);
    this.pingsOk++;
  }

  // rider-request-service POST /rides: write the trip to the city's shard, produce ride.requested.
  private submit(r: RideRequest): void {
    const shard = this.router.shardIndexFor(r.cityId);
    this.shards[shard].set(r.rideId, { rideId: r.rideId, cityId: r.cityId, status: 'REQUESTED', driverId: null });
    const rec = this.rideRequests.append(String(r.cityId), r, this.now);
    this.partitionPulse[rec.partition]++;
    this.submitted++;
  }

  // A pickup dropped on the map: same path as the load, but with a trace so
  // the view can replay the search and the claims. `rivals` is the number of
  // candidates a concurrent Streams task claims between this task's GEOSEARCH
  // and its claim script, which is the only way a claim comes back TAKEN.
  requestManual(cityId: number, lat: number, lng: number, rivals = 0): { request: RideRequest; trace: MatchTrace[] } {
    const request: RideRequest = {
      rideId: `ride-m${(this.manualSeq++).toString(36).padStart(3, '0')}`,
      cityId,
      pickupLat: lat,
      pickupLng: lng,
      requestedAt: this.now,
    };
    this.submit(request);
    this.streamsConsumer.poll(this.now);
    const trace: MatchTrace[] = [];
    let rivalsLeft = rivals;
    const raced = new Set<string>();
    const racing = new Matcher(
      {
        nearby: (c, la, ln, radius, limit) => {
          const found = this.index.nearby(c, la, ln, radius, limit);
          for (const cand of found) {
            if (rivalsLeft <= 0) break;
            if (raced.has(cand.driverId)) continue;
            const rivalRide = `ride-r${(this.manualSeq++).toString(36).padStart(3, '0')}`;
            if (this.index.claim(c, cand.driverId, rivalRide, DEFAULT_PROPS.claimTtlMs) === 'CLAIMED') {
              raced.add(cand.driverId);
              rivalsLeft--;
            }
          }
          return found;
        },
        claim: (c, d, r, ttl) => this.index.claim(c, d, r, ttl),
      },
      DEFAULT_PROPS,
      () => this.now,
    );
    this.handle(request, (t) => trace.push(t), racing);
    return { request, trace };
  }

  // matching-service MatchService.handle on one polled record.
  private handle(r: RideRequest, trace?: (t: MatchTrace) => void, matcher: Matcher = this.matcher): void {
    let claimsTried = 0;
    const outcome = matcher.match(r, (t) => {
      if (t.kind === 'claim') claimsTried++;
      trace?.(t);
    });
    const shard = this.shards[this.router.shardIndexFor(r.cityId)];
    const row = shard.get(r.rideId);
    if (outcome.matched) {
      const m = outcome.match;
      if (!row || row.status !== 'REQUESTED') {
        this.index.release(m.cityId, m.driverId, m.rideId);
        this.stats.recordDropped();
        return;
      }
      row.status = 'MATCHED';
      row.driverId = m.driverId;
      m.matchLatencyMs = drawMatchLatencyMs(this.rnd, claimsTried, this.now - r.requestedAt);
      this.stats.recordMatch(m.matchLatencyMs);
      this.rideMatches.append(String(m.cityId), m, this.now);
      this.push({ at: this.now, kind: 'match', text: `${m.rideId} city ${m.cityId} -> ${m.driverId} at ${Math.round(m.distanceMeters)} m, ring ${m.radiusMeters} m, ${m.matchLatencyMs} ms` });
      return;
    }
    const u = outcome.unmatched;
    if (!row || row.status !== 'REQUESTED') {
      this.stats.recordDropped();
      return;
    }
    row.status = 'UNMATCHED';
    this.stats.recordUnmatched();
    this.rideUnmatched.append(String(u.cityId), u, this.now);
    this.push({ at: this.now, kind: 'unmatched', text: `${u.rideId} unmatched: ${u.reason} within ${u.maxRadiusMeters} m` });
  }

  private push(e: FeedEvent): void {
    this.feed.push(e);
    if (this.feed.length > 40) this.feed.shift();
  }

  // Advance simulated time by dt milliseconds, running every scheduled event in order.
  tick(dtMs: number): void {
    this.partitionPulse.fill(0);
    const target = this.now + dtMs;
    while (this.now < target) {
      const next = Math.min(target, this.nextPingAt, this.nextRideAt, this.nextPollAt);
      this.now = next;
      if (this.now >= this.nextPingAt) {
        for (const d of this.fleet.drivers) {
          d.step();
          this.ping(d.position(this.now));
        }
        this.nextPingAt += 1000;
      }
      if (this.now >= this.nextRideAt) {
        // The load generator's ticker fires at a fixed period; the last ones
        // fire during shutdown, which is why a 60 s run at 10 rides/s reports
        // 603 submissions.
        if (this.now > this.runEndsAt + 250) {
          this.nextRideAt = Infinity;
        } else {
          this.submit(this.rides.next(this.now));
          this.nextRideAt += 1000 / RIDES_PER_SECOND;
        }
      }
      if (this.now >= this.nextPollAt) {
        for (const rec of this.streamsConsumer.poll(this.now, 64)) this.handle(rec.value);
        this.nextPollAt = this.now + drawPollDelayMs(this.rnd);
      }
    }
  }

  shardCounts(): Array<{ shard: number; total: number; byCity: Record<number, number>; matched: number }> {
    return this.shards.map((m, shard) => {
      const byCity: Record<number, number> = {};
      let matched = 0;
      for (const row of m.values()) {
        byCity[row.cityId] = (byCity[row.cityId] ?? 0) + 1;
        if (row.status === 'MATCHED') matched++;
      }
      return { shard, total: m.size, byCity, matched };
    });
  }
}
