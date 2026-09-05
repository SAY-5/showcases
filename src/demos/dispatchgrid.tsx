import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './dispatchgrid.css';
import { engine, rollout, startClock, touch, useEngineVersion } from './dispatchgrid/state';
import { offset, toLocalMeters } from './dispatchgrid/geo';
import { partitionFor, PARTITIONS } from './dispatchgrid/topics';
import { FENCE_RADIUS_M } from './dispatchgrid/world';
import { RUN_MS } from './dispatchgrid/engine';
import type { MatchTrace } from './dispatchgrid/matcher';

// In-browser dispatchgrid: two cities produce ride requests keyed by city id
// into a six-partition topic, a Streams task polls them and claims the
// nearest driver from a per-city GEO index with a SET NX script, trips land
// in the shard chosen by floorMod(city_id, 2), and a rolling update replaces
// pods one at a time while the same traffic keeps flowing.

const SIZE = 480;
const EXTENT_M = 7000;
const SCALE = SIZE / (2 * EXTENT_M);
const SPEEDS = [1, 2, 4];
const REAL = { matched: 603, perMinute: 603, p50: 14, p95: 53, p99: 271 };
const STEP_MS: Record<MatchTrace['kind'], number> = { search: 600, claim: 220, grow: 500, widen: 450, matched: 0, unmatched: 0 };
const ease = [0.22, 1, 0.36, 1] as const;

interface Pickup {
  rideId: string;
  cityId: number;
  lat: number;
  lng: number;
}

function toPx(cityLat: number, cityLng: number, lat: number, lng: number): [number, number] {
  const [east, north] = toLocalMeters(cityLat, cityLng, lat, lng);
  return [SIZE / 2 + east * SCALE, SIZE / 2 - north * SCALE];
}

function describe(t: MatchTrace): string {
  switch (t.kind) {
    case 'search':
      return `GEOSEARCH drivers:geo:{city} BYRADIUS ${t.radius} m ASC COUNT ${t.limit}: ${t.candidates.length} candidate${t.candidates.length === 1 ? '' : 's'}`;
    case 'claim':
      return t.result === 'CLAIMED'
        ? `claim ${t.driverId} at ${Math.round(t.distanceMeters)} m: SET NX won, driver leaves the set`
        : t.result === 'TAKEN'
          ? `claim ${t.driverId}: TAKEN, another Streams task won the SET NX`
          : `claim ${t.driverId}: STALE heartbeat, dropped from the set`;
    case 'grow':
      return `full page taken, grow COUNT to ${t.limit} inside ${t.radius} m`;
    case 'widen':
      return `nothing claimable at ${t.from} m, widen to ${t.to} m`;
    case 'matched':
      return `${t.match.rideId} matched ${t.match.driverId} in ring ${t.match.radiusMeters} m, produced to ride-matches`;
    case 'unmatched':
      return `${t.unmatched.rideId} unmatched (${t.unmatched.reason}), produced to ride-unmatched`;
  }
}

export default function DispatchgridDemo() {
  useEngineVersion();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState(1);
  const [cityId, setCityId] = useState(1);
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [steps, setSteps] = useState<MatchTrace[]>([]);
  const [shown, setShown] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => startClock(speed), [speed]);
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const city = engine.cities.find((c) => c.id === cityId) ?? engine.cities[0];
  const snap = engine.stats.snapshot();
  const shards = engine.shardCounts();
  const shardMax = Math.max(60, ...shards.map((s) => s.total));
  const busy = shown < steps.length;

  const playTrace = (trace: MatchTrace[]) => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setSteps(trace);
    setShown(0);
    let at = 0;
    trace.forEach((t, i) => {
      at += reduce ? 0 : STEP_MS[t.kind];
      timers.current.push(window.setTimeout(() => setShown(i + 1), at));
    });
  };

  const drop = (lat: number, lng: number, rivals: number) => {
    if (busy) return;
    const { request, trace } = engine.requestManual(city.id, lat, lng, rivals);
    setPickup({ rideId: request.rideId, cityId: city.id, lat, lng });
    playTrace(trace);
    touch();
  };

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    const east = (x - SIZE / 2) / SCALE;
    const north = (SIZE / 2 - y) / SCALE;
    if (Math.hypot(east, north) > EXTENT_M) return;
    const [lat, lng] = offset(city.lat, city.lng, north, east);
    drop(lat, lng, 0);
  };

  const randomDrop = () => {
    const drivers = engine.index.drivers(city.id);
    const d = drivers[Math.floor(drivers.length / 2)] ?? { lat: city.lat, lng: city.lng };
    const [lat, lng] = offset(d.lat, d.lng, 350, -280);
    drop(lat, lng, 0);
  };

  const raceDrop = () => {
    // Enough rivals to take the whole first ring and a full page of the next
    // one, so the matcher has to grow its page before it can claim.
    const near = engine.index.nearby(city.id, city.lat, city.lng, 1000, 64).length;
    drop(city.lat, city.lng, near + 20 + 6);
  };

  const startLoad = () => {
    engine.startLoad();
    touch();
  };

  const startRollout = () => {
    rollout.startRollout();
    touch();
  };

  // ---------- derived trace state ----------
  const visible = steps.slice(0, shown);
  const searches = visible.filter((t) => t.kind === 'search');
  const currentSearch = searches[searches.length - 1];
  const currentRadius = currentSearch?.kind === 'search' ? currentSearch.radius : 0;
  const spentRadii = [...new Set(searches.map((t) => (t.kind === 'search' ? t.radius : 0)))].filter((r) => r !== currentRadius);
  const candidates = new Set(currentSearch?.kind === 'search' ? currentSearch.candidates.map((c) => c.driverId) : []);
  const taken = new Set(visible.filter((t) => t.kind === 'claim' && t.result !== 'CLAIMED').map((t) => (t.kind === 'claim' ? t.driverId : '')));
  const won = visible.find((t) => t.kind === 'matched');
  const wonId = won?.kind === 'matched' ? won.match.driverId : null;
  const done = shown === steps.length && steps.length > 0;
  const finalStep = done ? steps[steps.length - 1] : null;

  const drivers = engine.index.drivers(city.id);
  const loadRunning = engine.loadRunning;
  const loadProgress = loadRunning ? Math.max(0, Math.min(1, 1 - (engine.loadEndsAt - engine.time) / RUN_MS)) : engine.submitted > 0 ? 1 : 0;
  const lag = engine.streamsConsumer.lag();
  const pulse = engine.partitionPulse;
  const pipelineCities = engine.cities.map((c) => ({ ...c, partition: partitionFor(String(c.id)) }));
  const pinPx = pickup && pickup.cityId === city.id ? toPx(city.lat, city.lng, pickup.lat, pickup.lng) : null;

  return (
    <div className="demo" aria-label="dispatchgrid matching simulation">
      <span className="demo__tag">Marketplace matching</span>
      <h3 className="demo__title">dispatchgrid</h3>
      <p className="demo__lede">
        Ride requests from two cities land on Kafka partitions keyed by city
        id, a Streams task polls them and claims the nearest driver from a
        Redis GEO index with a SET NX script, and every trip is written to the
        shard chosen by floorMod(city_id, 2). Click a city to drop a pickup and
        replay the search, race it against rival claims to watch the page grow,
        run the 60 s load, and roll all three Deployments with errors at 0.
      </p>

      <section className="dg__panel dg__pipeline" aria-label="Kafka pipeline">
        <div className="dg__pipe-head">
          <span className="dg__panel-head">ride-requests, keyed by city id</span>
          <span className="dg__panel-count">
            produced {engine.rideRequests.total}, consumer lag {lag}, matches {engine.rideMatches.total}, unmatched {engine.rideUnmatched.total}
          </span>
        </div>
        <div className="dg__pipe">
          <div className="dg__pipe-cities">
            {pipelineCities.map((c) => (
              <button
                key={c.id}
                className={`dg__city dg__city--${c.id}${c.id === cityId ? ' dg__city--on' : ''}`}
                onClick={() => setCityId(c.id)}
                aria-pressed={c.id === cityId}
              >
                <span className="dg__city-name">{c.name}</span>
                <span className="dg__city-meta mono">city {c.id}, key "{c.id}" to p{c.partition}</span>
                <span className="dg__city-meta mono">{engine.index.size(c.id)} available of {drivers.length && c.id === cityId ? drivers.length : 300}</span>
              </button>
            ))}
          </div>
          <span className="dg__arrow" aria-hidden="true" />
          <div className="dg__partitions" aria-label="Topic partitions">
            {Array.from({ length: PARTITIONS }, (_, p) => {
              const owner = pipelineCities.find((c) => c.partition === p);
              const depth = engine.rideRequests.endOffset(p);
              return (
                <div key={p} className={`dg__partition${owner ? ` dg__partition--${owner.id}` : ''}`}>
                  <span className="dg__partition-bar" style={{ height: `${Math.min(100, 20 + pulse[p] * 40)}%`, opacity: owner ? 1 : 0.25 }} />
                  <span className="dg__partition-lab mono">p{p}</span>
                  <span className="dg__partition-off mono">{owner ? depth : 'idle'}</span>
                </div>
              );
            })}
          </div>
          <span className="dg__arrow" aria-hidden="true" />
          <div className="dg__streams">
            <span className="dg__streams-name">matching-service</span>
            <span className="dg__city-meta mono">Kafka Streams task, poll every 2 to 7 ms</span>
            <span className="dg__city-meta mono">GEOSEARCH {engine.index.ops.geosearch}, claims {engine.index.ops.claim}</span>
          </div>
          <span className="dg__arrow" aria-hidden="true" />
          <div className="dg__outputs">
            <span className="dg__out mono">ride-matches <b>{engine.rideMatches.total}</b></span>
            <span className="dg__out dg__out--warn mono">ride-unmatched <b>{engine.rideUnmatched.total}</b></span>
          </div>
        </div>
      </section>

      <div className="dg__grid">
        <section className="dg__panel dg__geo" aria-label="Geo matching">
          <div className="dg__panel-head">
            {city.name}: nearest first, one claim
            <span className="dg__panel-count">{busy ? 'matching' : 'click the map to drop a pickup'}</span>
          </div>
          <svg
            className="dg__svg"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label="City map with drivers, pickup pin and search rings"
            onClick={onMapClick}
          >
            <circle cx={SIZE / 2} cy={SIZE / 2} r={FENCE_RADIUS_M * SCALE} className="dg__fence" />
            {pinPx &&
              spentRadii.map((r) => <circle key={r} cx={pinPx[0]} cy={pinPx[1]} r={r * SCALE} className="dg__ring dg__ring--spent" />)}
            {pinPx && currentRadius > 0 && !done && (
              <circle cx={pinPx[0]} cy={pinPx[1]} r={currentRadius * SCALE} className="dg__ring" />
            )}
            {pinPx && won?.kind === 'matched' && (
              <circle cx={pinPx[0]} cy={pinPx[1]} r={won.match.radiusMeters * SCALE} className="dg__ring dg__ring--spent" />
            )}
            {drivers.map((d) => {
              const [x, y] = toPx(city.lat, city.lng, d.lat, d.lng);
              const cls = d.driverId === wonId ? 'dg__drv--won' : taken.has(d.driverId) ? 'dg__drv--taken' : candidates.has(d.driverId) ? 'dg__drv--cand' : d.available ? 'dg__drv--free' : 'dg__drv--claimed';
              return <circle key={d.driverId} cx={x} cy={y} r={cls === 'dg__drv--won' ? 5 : 2.6} className={`dg__drv ${cls}`} />;
            })}
            {pinPx && (
              <g className="dg__pin">
                <line x1={pinPx[0]} y1={pinPx[1]} x2={pinPx[0]} y2={pinPx[1] - 14} />
                <circle cx={pinPx[0]} cy={pinPx[1] - 17} r={4.5} />
                <text x={pinPx[0] + 8} y={pinPx[1] - 14}>{pickup?.rideId}</text>
              </g>
            )}
          </svg>
          <div className="dg__legend mono">
            <span><i className="dg__sw dg__sw--free" /> in GEO set</span>
            <span><i className="dg__sw dg__sw--claimed" /> claimed (20 s TTL)</span>
            <span><i className="dg__sw dg__sw--cand" /> candidate</span>
            <span><i className="dg__sw dg__sw--taken" /> taken by rival</span>
          </div>
          <div className="demo__controls dg__controls">
            <button className="demo__btn" onClick={randomDrop} disabled={busy}>
              Drop a pickup
            </button>
            <button className="demo__btn demo__btn--ghost" onClick={raceDrop} disabled={busy}>
              Race rival claims
            </button>
          </div>
          <ol className="dg__trace" aria-live="polite" aria-label="Matcher trace">
            {visible.length === 0 && (
              <li className="dg__trace-empty">
                The matcher asks the city's GEO set for the nearest 20 inside 1000 m and claims them in
                order with a Lua SET NX. Race rival claims to see a full page come back TAKEN, the page
                grow to 40, and the ring widen to 2000 m.
              </li>
            )}
            {visible.slice(-14).map((t, i) => (
              <li key={`${shown}-${i}`} className={`dg__trace-line dg__trace-line--${t.kind}${t.kind === 'claim' ? ` dg__trace-line--${t.result.toLowerCase()}` : ''}`}>
                <span className="dg__trace-kind mono">{t.kind}</span>
                <span>{describe(t)}</span>
              </li>
            ))}
          </ol>
          <AnimatePresence>
            {finalStep && (
              <motion.div
                className={`dg__verdict${finalStep.kind === 'unmatched' ? ' dg__verdict--warn' : ''}`}
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.3, ease }}
              >
                {finalStep.kind === 'matched'
                  ? `Matched in ring ${finalStep.match.radiusMeters} m after ${visible.filter((t) => t.kind === 'claim').length} claim script${visible.filter((t) => t.kind === 'claim').length === 1 ? '' : 's'}; the trip row in ${engine.router.shardName(city.id)} flipped to MATCHED.`
                  : `Unmatched at ${8000} m; the row stays for a retry consumer.`}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <div className="dg__side">
          <section className="dg__panel" aria-label="Shards">
            <div className="dg__panel-head">
              MySQL shards, shard = floorMod(city_id, 2)
              <span className="dg__panel-count">Flyway migrations applied per shard</span>
            </div>
            <div className="dg__tanks">
              {shards.map((s) => (
                <div key={s.shard} className="dg__tank">
                  <div className="dg__tank-glass" aria-label={`shard-${s.shard}, ${s.total} trips`}>
                    {engine.cities.map((c) => {
                      const n = s.byCity[c.id] ?? 0;
                      return n > 0 ? (
                        <motion.span
                          key={c.id}
                          className={`dg__tank-fill dg__tank-fill--${c.id}`}
                          animate={{ height: `${(n / shardMax) * 100}%` }}
                          transition={{ duration: reduce ? 0 : 0.25, ease }}
                        />
                      ) : null;
                    })}
                  </div>
                  <span className="dg__tank-name mono">shard-{s.shard}</span>
                  <span className="dg__tank-meta mono">
                    {engine.cities.filter((c) => engine.router.shardIndexFor(c.id) === s.shard).map((c) => `city ${c.id}`).join(', ')}
                  </span>
                  <span className="dg__tank-meta mono">{s.total} trips, {s.matched} matched</span>
                </div>
              ))}
            </div>
          </section>

          <section className="dg__panel" aria-label="Load run">
            <div className="dg__panel-head">
              The 60 s load run
              <span className="dg__panel-count">10 rides/s round-robin, 300 drivers per city</span>
            </div>
            <div className="demo__controls dg__controls dg__controls--top">
              <button className="demo__btn" onClick={startLoad} disabled={loadRunning}>
                {loadRunning ? 'Running...' : engine.submitted > 0 ? 'Run again' : 'Start the run'}
              </button>
              <div className="dg__speeds" role="group" aria-label="Simulation speed">
                {SPEEDS.map((s) => (
                  <button key={s} className={`dg__speed${speed === s ? ' dg__speed--on' : ''}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                    {s}x
                  </button>
                ))}
              </div>
            </div>
            <div className="dg__progress" aria-hidden="true">
              <span style={{ width: `${loadProgress * 100}%` }} />
            </div>
            <div className="dg__stats">
              <div className="dg__stat dg__stat--hero">
                <span className="dg__stat-label">matches per minute</span>
                <span className="dg__stat-val">{snap.matchesPerMinute}</span>
                <span className="dg__stat-ref">trailing 60 s; measured {REAL.perMinute}</span>
              </div>
              <div className="dg__stat">
                <span className="dg__stat-label">p50 / p95 latency</span>
                <span className="dg__stat-val">{snap.p50LatencyMs}<small>/ {snap.p95LatencyMs} ms</small></span>
                <span className="dg__stat-ref">measured {REAL.p50} / {REAL.p95} ms</span>
              </div>
              <div className="dg__stat">
                <span className="dg__stat-label">matched / submitted</span>
                <span className="dg__stat-val">{snap.matched}<small>/ {engine.submitted}</small></span>
                <span className="dg__stat-ref">{snap.unmatched} unmatched, {snap.dropped} dropped</span>
              </div>
              <div className="dg__stat">
                <span className="dg__stat-label">driver pings</span>
                <span className="dg__stat-val">{engine.pingsOk}</span>
                <span className="dg__stat-ref">GEOADD + heartbeat TTL 15 s, every second</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="dg__panel dg__rollout" aria-label="Rolling update">
        <div className="dg__panel-head">
          Kubernetes rolling update
          <span className="dg__panel-count">RollingUpdate maxUnavailable 0, maxSurge 1, preStop sleep 10 s</span>
        </div>
        <div className="dg__roll">
          <div>
            <div className="demo__controls dg__controls dg__controls--top">
              <button className="demo__btn" onClick={startRollout} disabled={rollout.rolling}>
                {rollout.rolling ? 'Rolling...' : rollout.rolloutFinishedAt !== null ? 'Roll again' : 'Change ROLLOUT_MARKER'}
              </button>
              <span className="demo__hint">
                {rollout.rolling
                  ? `t+${((rollout.durationMs ?? 0) / 1000).toFixed(1)} s`
                  : rollout.rolloutFinishedAt !== null
                    ? `finished in ${((rollout.durationMs ?? 0) / 1000).toFixed(1)} s`
                    : 'pings, rides and matches route through the Deployments'}
              </span>
            </div>
            <div className="dg__deploys">
              {rollout.deployments.map((d) => (
                <div key={d.name} className="dg__deploy">
                  <div className="dg__deploy-head">
                    <span className="dg__deploy-name mono">{d.name}</span>
                    <span className="dg__deploy-meta mono">rev {d.revision}, {rollout.endpoints(d).length} ready</span>
                  </div>
                  <div className="dg__pods">
                    <AnimatePresence initial={false}>
                      {d.pods.map((p) => (
                        <motion.span
                          key={p.name}
                          className={`dg__pod dg__pod--${p.phase.toLowerCase()}`}
                          initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: reduce ? 0 : 0.2 }}
                          title={`${p.name}: ${p.phase}, served ${p.served}`}
                        >
                          <span className="dg__pod-name mono">{p.name.slice(-7)}</span>
                          <span className="dg__pod-phase mono">{p.phase}</span>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="dg__roll-right">
            <div className="dg__stats dg__stats--roll">
              <div className="dg__stat dg__stat--hero">
                <span className="dg__stat-label">http errors</span>
                <span className="dg__stat-val">{rollout.totalErrors}</span>
                <span className="dg__stat-ref">requests routed to a Ready endpoint only</span>
              </div>
              <div className="dg__stat">
                <span className="dg__stat-label">requests served</span>
                <span className="dg__stat-val">{rollout.totalServed}</span>
                <span className="dg__stat-ref">across all three Services</span>
              </div>
            </div>
            <ul className="dg__events mono" aria-live="polite">
              {rollout.events.slice(-6).reverse().map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <span className="dg__event-at">t+{(e.at / 1000).toFixed(1)}</span>
                  <span>{e.text}</span>
                </li>
              ))}
              {rollout.events.length === 0 && <li className="dg__trace-empty">Controller events appear here.</li>}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
