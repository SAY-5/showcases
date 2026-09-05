import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './rideloop.css';
import { startClock, touch, useWorldVersion, world } from './rideloop/state';
import { offsetM } from './rideloop/geo';
import { matchSteps, type MatchOutcome, type MatchStep } from './rideloop/matcher';
import type { Trip } from './rideloop/world';
import {
  cellRect,
  latLngToPx,
  metersToPx,
  pxToLatLng,
  visibleCells,
} from './rideloop/projection';

// In-browser rideloop: 300 simulated drivers ping a geohash-partitioned
// position index with a 20 s TTL, riders drop pickups, and the dispatcher
// claims the nearest available driver with a conditional update, widening
// the ring when nobody is claimable. The 60 s load run replays the demo
// schedule (10 rides a second) against the same port and reports the same
// figures the README prints.

const SIZE = 640;
const REAL = { perMinute: 601, p50: 59, p95: 101, rate: 10, durationS: 60, ttl: 20 };
const SILENCED_DRIVER = 'drv-000';
const SPEEDS = [1, 2, 4, 8];
const STEP_DELAY: Record<MatchStep['kind'], number> = { query: 650, claim: 600, widen: 500 };
const ease = [0.22, 1, 0.36, 1] as const;

type Who = 'A' | 'B';

interface TraceLine {
  id: number;
  who: Who;
  kind: MatchStep['kind'] | 'done' | 'none';
  text: string;
  tone: 'a' | 'b' | 'muted' | 'warn';
}

interface Run {
  who: Who;
  trip: Trip;
  radiusM: number;
  spent: number[];
  plan: string[];
  candidates: string[];
  won: string | null;
  lost: string[];
  outcome: MatchOutcome | null;
  latencyMs: number | null;
}

interface Job {
  who: Who;
  gen: Generator<MatchStep, MatchOutcome, void>;
  run: Run;
  done: boolean;
}

const fmt = (v: number | null, digits = 0) => (v === null ? '...' : v.toFixed(digits));

export default function RideloopDemo() {
  useWorldVersion();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState(1);
  const [runs, setRuns] = useState<Run[]>([]);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [silencedAt, setSilencedAt] = useState<number | null>(null);
  const [loadStartedAt, setLoadStartedAt] = useState<number | null>(null);
  const lineId = useRef(0);
  const timer = useRef<number | null>(null);

  // The simulation clock runs while the demo is mounted.
  useEffect(() => startClock(speed), [speed]);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const log = useCallback((who: Who, kind: TraceLine['kind'], text: string, tone: TraceLine['tone']) => {
    setTrace((t) => [...t.slice(-9), { id: lineId.current++, who, kind, text, tone }]);
  }, []);

  // ---------- step-by-step matching ----------

  const startMatch = useCallback(
    (pickups: { who: Who; at: [number, number] }[]) => {
      if (timer.current) window.clearTimeout(timer.current);
      setBusy(true);
      setTrace([]);
      const now = world.now;
      const jobs: Job[] = pickups.map(({ who, at }) => {
        const trip = world.requestRide(at, 'manual');
        const gen = matchSteps(world.index, at[0], at[1], trip.id, now, world.radii);
        const run: Run = {
          who,
          trip,
          radiusM: 0,
          spent: [],
          plan: [],
          candidates: [],
          won: null,
          lost: [],
          outcome: null,
          latencyMs: null,
        };
        return { who, gen, run, done: false };
      });
      setRuns(jobs.map((j) => j.run));
      for (const j of jobs) log(j.who, 'query', `${j.run.trip.id} requested at the pin`, 'muted');

      const tick = () => {
        let delay = 0;
        for (const job of jobs) {
          if (job.done) continue;
          const next = job.gen.next();
          if (next.done) {
            job.done = true;
            const outcome = next.value;
            const latency = world.estimateLatency(outcome);
            const latencyMs = Math.round(latency.totalMs);
            job.run = { ...job.run, outcome, latencyMs };
            world.applyOutcome(job.run.trip, outcome, latencyMs);
            if (outcome.driver) {
              log(
                job.who,
                'done',
                `matched ${outcome.driver.driverId} at ${Math.round(outcome.driver.distanceM)} m, ring ${outcome.radiusM} m, ${outcome.candidatesSeen} tried, ${latencyMs} ms`,
                job.who === 'A' ? 'a' : 'b',
              );
            } else {
              log(job.who, 'none', 'no claimable driver within 4 km, trip stays requested and retries in 1 s', 'warn');
            }
            continue;
          }
          const step = next.value;
          delay = Math.max(delay, STEP_DELAY[step.kind]);
          if (step.kind === 'query') {
            job.run = {
              ...job.run,
              radiusM: step.radiusM,
              plan: step.plan.map((p) => p.cell),
              candidates: step.candidates.map((c) => c.driverId),
            };
            const subs = step.plan.reduce((n, p) => n + (p.subcells?.length ?? 0), 0);
            log(
              job.who,
              'query',
              `nearby r=${step.radiusM} m: ${step.plan.length} partition${step.plan.length === 1 ? '' : 's'} read${subs ? `, geohash IN (${subs} subcells)` : ', whole 3 x 3 block'}, ${step.candidates.length} available${step.candidates[0] ? `, nearest ${step.candidates[0].driverId} at ${Math.round(step.candidates[0].distanceM)} m` : ''}`,
              'muted',
            );
          } else if (step.kind === 'widen') {
            job.run = { ...job.run, spent: [...job.run.spent, step.fromM] };
            log(job.who, 'widen', `no claim at ${step.fromM} m, widen to ${step.toM} m`, 'muted');
          } else if (step.ok) {
            job.run = { ...job.run, won: step.driver.driverId };
            log(job.who, 'claim', `claim ${step.driver.driverId}: status = available AND ttl > now held, now busy`, job.who === 'A' ? 'a' : 'b');
          } else {
            job.run = { ...job.run, lost: [...job.run.lost, step.driver.driverId] };
            log(job.who, 'claim', `claim ${step.driver.driverId}: ConditionalCheckFailed, already busy, next candidate`, 'warn');
          }
        }
        setRuns(jobs.map((j) => j.run));
        touch();
        if (jobs.every((j) => j.done)) {
          setBusy(false);
          return;
        }
        timer.current = window.setTimeout(tick, reduce ? 0 : delay || 400);
      };
      timer.current = window.setTimeout(tick, reduce ? 0 : 300);
    },
    [log, reduce],
  );

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    startMatch([{ who: 'A', at: pxToLatLng(x, y, SIZE) }]);
  };

  const randomPin = () => {
    if (busy) return;
    const driver = world.drivers[world.rng.int(world.drivers.length)];
    const [lat, lng] = driver.latlng();
    startMatch([{ who: 'A', at: offsetM(lat, lng, world.rng.uniform(-300, 300), world.rng.uniform(-300, 300)) }]);
  };

  const contend = () => {
    if (busy) return;
    // two riders a few meters apart share the same nearest driver
    const available = world.drivers.filter((d) => world.index.getDriver(d.driverId)?.status === 'available');
    const driver = available[world.rng.int(available.length)] ?? world.drivers[0];
    const [lat, lng] = driver.latlng();
    startMatch([
      { who: 'A', at: offsetM(lat, lng, 60, 40) },
      { who: 'B', at: offsetM(lat, lng, -50, 70) },
    ]);
  };

  // ---------- ttl ----------

  const ttlItem = world.index.getDriver(SILENCED_DRIVER);
  const silenced = world.silenced.has(SILENCED_DRIVER);
  const remaining = ttlItem ? ttlItem.ttl - world.now : 0;
  const visible = ttlItem ? ttlItem.ttl > world.now : false;
  const sinceSilence = silencedAt === null ? null : world.now - silencedAt;

  const silence = () => {
    world.silence(SILENCED_DRIVER);
    setSilencedAt(world.now);
    touch();
  };
  const resume = () => {
    world.resume(SILENCED_DRIVER);
    setSilencedAt(null);
    touch();
  };

  // ---------- load run ----------

  const counts = world.counts();
  const total = world.loadTotal;
  const submitting = world.scheduledRemaining > 0;
  const running = loadStartedAt !== null && (submitting || counts.pending > 0 || counts.submitted < total);
  const done = loadStartedAt !== null && !running && total > 0 && counts.submitted >= total;
  const elapsed = loadStartedAt === null ? 0 : Math.min(REAL.durationS, world.now - loadStartedAt);
  const rateSoFar = done ? world.rate.perMinute() : world.rate.perMinuteSoFar(world.now);
  const p50 = world.latency.percentile(50);
  const p95 = world.latency.percentile(95);
  const hist = world.latency.histogram(10, 20);
  const histMax = Math.max(1, ...hist);

  const startLoad = () => {
    world.scheduleLoad(REAL.rate, REAL.durationS);
    setLoadStartedAt(world.now);
    touch();
  };

  // ---------- map geometry ----------

  const cells5 = visibleCells(5);
  const cells6 = visibleCells(6);
  const planCells = new Set(runs.flatMap((r) => (r.outcome ? [] : r.plan)));
  const highlight = new Map<string, string>();
  for (const r of runs) {
    for (const id of r.candidates) highlight.set(id, `rl__drv--cand-${r.who.toLowerCase()}`);
    for (const id of r.lost) highlight.set(id, 'rl__drv--lost');
    if (r.won) highlight.set(r.won, `rl__drv--won-${r.who.toLowerCase()}`);
  }
  const recent = world.log.filter((e) => e.kind === 'match' || e.kind === 'no_driver').slice(-5).reverse();

  return (
    <div className="demo" aria-label="rideloop dispatch simulation">
      <span className="demo__tag">Dispatch loop</span>
      <h3 className="demo__title">rideloop</h3>
      <p className="demo__lede">
        Every dot is a driver pinging a DynamoDB-style index partitioned by
        geohash cell with a 20 s TTL. Click the map to drop a pickup: the
        matcher reads the surrounding partitions, ranks by haversine, claims the
        nearest with a conditional update and doubles the ring when nobody is
        claimable. Silence a driver to watch it age out, then run the 60 s load
        schedule and compare with the measured summary.
      </p>

      <div className="rl__grid">
        <section className="rl__map glass" aria-label="City map">
          <span className="rl__map-hint mono">
            {busy ? 'matching' : 'click to drop a pickup'}
          </span>
          <svg
            className="rl__svg"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label="City map with drivers, geohash cells, pickup pins and search rings"
            onClick={onMapClick}
          >
            <rect x={0} y={0} width={SIZE} height={SIZE} className="rl__ground" />
            {cells6.map((key) => {
              const c = cellRect(key, SIZE);
              return <rect key={key} x={c.x} y={c.y} width={c.w} height={c.h} className="rl__cell6" />;
            })}
            {cells5.map((key) => {
              const c = cellRect(key, SIZE);
              const on = planCells.has(key);
              return (
                <g key={key}>
                  <rect x={c.x} y={c.y} width={c.w} height={c.h} className={`rl__cell5${on ? ' rl__cell5--read' : ''}`} />
                  <text x={c.x + 8} y={c.y + 16} className="rl__cell-key">
                    {key}
                  </text>
                </g>
              );
            })}
            {runs.map((r) => {
              const [px, py] = latLngToPx(r.trip.pickupLat, r.trip.pickupLng, SIZE);
              const tone = r.who.toLowerCase();
              return (
                <g key={r.trip.id}>
                  {r.spent.map((m) => (
                    <circle key={m} cx={px} cy={py} r={metersToPx(m, SIZE)} className={`rl__ring rl__ring--spent rl__ring--${tone}`} />
                  ))}
                  {r.radiusM > 0 && !r.outcome && (
                    <circle cx={px} cy={py} r={metersToPx(r.radiusM, SIZE)} className={`rl__ring rl__ring--${tone}`} />
                  )}
                  {r.outcome?.driver && (
                    <circle cx={px} cy={py} r={metersToPx(r.outcome.radiusM ?? 0, SIZE)} className={`rl__ring rl__ring--spent rl__ring--${tone}`} />
                  )}
                </g>
              );
            })}
            {world.drivers.map((d) => {
              const [lat, lng] = d.latlng();
              const [x, y] = latLngToPx(lat, lng, SIZE);
              const item = world.index.getDriver(d.driverId);
              const cls =
                d.driverId === SILENCED_DRIVER && silenced
                  ? visible
                    ? 'rl__drv--stale'
                    : 'rl__drv--expired'
                  : item?.status === 'busy'
                    ? 'rl__drv--busy'
                    : 'rl__drv--free';
              const hi = highlight.get(d.driverId);
              return (
                <g key={d.driverId}>
                  <circle cx={x} cy={y} r={2.6} className={`rl__drv ${cls}`} />
                  {hi && <circle cx={x} cy={y} r={7} className={`rl__hi ${hi}`} />}
                  {d.driverId === SILENCED_DRIVER && <circle cx={x} cy={y} r={9} className="rl__hi rl__hi--watch" />}
                </g>
              );
            })}
            {runs.map((r) => {
              const [px, py] = latLngToPx(r.trip.pickupLat, r.trip.pickupLng, SIZE);
              return (
                <g key={`pin-${r.trip.id}`} className={`rl__pin rl__pin--${r.who.toLowerCase()}`}>
                  <line x1={px} y1={py} x2={px} y2={py - 14} />
                  <circle cx={px} cy={py - 17} r={4.5} />
                  <text x={px + 8} y={py - 14}>{runs.length > 1 ? `rider ${r.who}` : 'pickup'}</text>
                </g>
              );
            })}
          </svg>
          <div className="rl__legend mono">
            <span><i className="rl__sw rl__sw--free" /> available</span>
            <span><i className="rl__sw rl__sw--busy" /> busy</span>
            <span><i className="rl__sw rl__sw--cell" /> partition read</span>
            <span><i className="rl__sw rl__sw--expired" /> ttl passed</span>
          </div>
        </section>

        <div className="rl__side">
          <section className="rl__panel" aria-label="Matcher">
            <div className="rl__panel-head">
              Nearest driver, one claim
              <span className="rl__panel-count">rings 500, 1000, 2000, 4000 m</span>
            </div>
            <div className="demo__controls rl__controls">
              <button className="demo__btn" onClick={randomPin} disabled={busy}>
                Drop a pickup
              </button>
              <button className="demo__btn demo__btn--ghost" onClick={contend} disabled={busy}>
                Two riders, one driver
              </button>
            </div>
            <ol className="rl__trace" aria-live="polite" aria-label="Matcher trace">
              {trace.length === 0 && (
                <li className="rl__trace-empty">
                  Drop a pickup to watch the search ring by ring. Two riders a
                  few meters apart race for the same nearest driver: exactly
                  one conditional claim succeeds, the other moves to the next
                  candidate.
                </li>
              )}
              {trace.map((line) => (
                <li key={line.id} className={`rl__trace-line rl__trace-line--${line.tone}`}>
                  <span className={`rl__trace-who rl__trace-who--${line.who.toLowerCase()}`}>{line.who}</span>
                  <span className="rl__trace-kind">{line.kind}</span>
                  <span className="rl__trace-text">{line.text}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rl__panel" aria-label="TTL expiry">
            <div className="rl__panel-head">
              TTL expiry, {SILENCED_DRIVER}
              <span className="rl__panel-count">ttl = now + {REAL.ttl} s</span>
            </div>
            <div className="rl__ttl-bar" aria-hidden="true">
              <span
                className={silenced ? 'rl__ttl-fill rl__ttl-fill--draining' : 'rl__ttl-fill'}
                style={{ width: `${Math.max(0, Math.min(100, (remaining / REAL.ttl) * 100))}%` }}
              />
            </div>
            <dl className="rl__kv">
              <dt>last ping</dt>
              <dd>{ttlItem ? `t+${ttlItem.updatedAt.toFixed(1)} s` : 'none'}</dd>
              <dt>ttl</dt>
              <dd>
                {ttlItem ? `t+${ttlItem.ttl.toFixed(1)} s` : 'none'}
                {silenced && (
                  <span className={`rl__tag ${remaining > 0 ? 'rl__tag--warn' : 'rl__tag--bad'}`}>
                    {remaining > 0 ? `${remaining.toFixed(1)} s left` : 'expired'}
                  </span>
                )}
              </dd>
              <dt>visible to reads</dt>
              <dd className={visible ? 'rl__ok' : 'rl__bad'}>{visible ? 'yes' : 'no, ttl passed'}</dd>
            </dl>
            {silenced && sinceSilence !== null && (
              <div className="rl__timeline">
                <span className="rl__tag rl__tag--warn">silenced at t+{silencedAt?.toFixed(1)} s</span>
                {sinceSilence >= 3 && <span className="rl__tag rl__tag--ok">after 3 s: visible</span>}
                {!visible && <span className="rl__tag rl__tag--bad">after ttl ({REAL.ttl} s): gone</span>}
              </div>
            )}
            <div className="demo__controls rl__controls">
              {silenced ? (
                <button className="demo__btn demo__btn--ghost" onClick={resume}>
                  Resume pings
                </button>
              ) : (
                <button className="demo__btn" onClick={silence}>
                  Silence {SILENCED_DRIVER}
                </button>
              )}
              <span className="demo__hint">
                reads filter ttl &gt; now, no cleanup job
              </span>
            </div>
          </section>
        </div>
      </div>

      <section className="rl__panel rl__panel--load" aria-label="Load run">
        <div className="rl__panel-head">
          The 60 s load run
          <span className="rl__panel-count">
            {REAL.rate} rides/s for {REAL.durationS} s, 300 drivers, dispatcher polls every 100 ms
          </span>
        </div>
        <div className="rl__load">
          <div className="rl__load-left">
            <div className="demo__controls rl__controls">
              <button className="demo__btn" onClick={startLoad} disabled={running}>
                {running ? 'Running...' : done ? 'Run again' : 'Start the 60 s run'}
              </button>
              <div className="rl__speeds" role="group" aria-label="Simulation speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    className={`rl__speed${speed === s ? ' rl__speed--on' : ''}`}
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
            <div className="rl__progress" aria-hidden="true">
              <span style={{ width: `${(elapsed / REAL.durationS) * 100}%` }} />
            </div>
            <div className="rl__stats">
              <div className="rl__stat rl__stat--hero">
                <span className="rl__stat-label">matches per minute</span>
                <span className="rl__stat-val">{fmt(rateSoFar)}</span>
                <span className="rl__stat-ref">measured {REAL.perMinute}</span>
              </div>
              <div className="rl__stat">
                <span className="rl__stat-label">match latency p50</span>
                <span className="rl__stat-val">{fmt(p50)}<small>ms</small></span>
                <span className="rl__stat-ref">measured {REAL.p50} ms</span>
              </div>
              <div className="rl__stat">
                <span className="rl__stat-label">p95</span>
                <span className="rl__stat-val">{fmt(p95)}<small>ms</small></span>
                <span className="rl__stat-ref">measured {REAL.p95} ms</span>
              </div>
              <div className="rl__stat">
                <span className="rl__stat-label">matched / submitted</span>
                <span className="rl__stat-val">{counts.matched}<small>/ {counts.submitted}</small></span>
                <span className="rl__stat-ref">{counts.pending} pending, {counts.busy} drivers busy</span>
              </div>
            </div>
          </div>
          <div className="rl__load-right">
            <div className="rl__hist" aria-label="Match latency histogram, 20 ms buckets">
              {hist.map((n, i) => (
                <div key={i} className="rl__hist-col">
                  <motion.span
                    className="rl__hist-bar"
                    animate={{ height: `${(n / histMax) * 100}%` }}
                    transition={{ duration: reduce ? 0 : 0.25, ease }}
                  />
                  <span className="rl__hist-lab">{i === 9 ? '180+' : i * 20}</span>
                </div>
              ))}
            </div>
            <ul className="rl__feed" aria-live="polite">
              <AnimatePresence initial={false}>
                {recent.map((e) => (
                  <motion.li
                    key={`${e.at}-${e.text}`}
                    className={`rl__feed-line${e.kind === 'no_driver' ? ' rl__feed-line--warn' : ''}`}
                    initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.2 }}
                  >
                    <span className="rl__feed-at">t+{e.at.toFixed(2)}</span>
                    <span>{e.text}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {recent.length === 0 && <li className="rl__trace-empty">Matches appear here as the sweep loop runs.</li>}
            </ul>
          </div>
        </div>
        <AnimatePresence>
          {done && (
            <motion.div
              className="rl__verdict"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <span className="rl__verdict-head">
                {counts.matched} of {counts.submitted} matched, {fmt(world.rate.perMinute())} per minute
              </span>
              <span className="rl__verdict-text">
                The submission rate is the ceiling, not the matcher: p50 {fmt(p50)} ms, p95 {fmt(p95)} ms
                across {world.sweeps} sweeps. The README run reports {REAL.perMinute} per minute with p50 {REAL.p50} ms
                and p95 {REAL.p95} ms from the running services.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
