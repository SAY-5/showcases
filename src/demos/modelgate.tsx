import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './modelgate.css';
import { loadgen, service, startClock, touch, useServiceVersion } from './modelgate/state';
import { REJECTION_REASONS } from './modelgate/validate';
import { REAL_DEMO, VERSIONS } from './modelgate/manifest';
import type { PredictOutcome } from './modelgate/service';

// In-browser modelgate: the real v1 and v2 ETA networks run on their exported
// weights behind a port of the FastAPI request path. Build a request and read
// the 422 reasons, put v2 in shadow and score its divergence on live traffic,
// then promote it mid-load and watch the dropped counter stay at 0.

const PRESETS: { id: string; label: string; body: string }[] = [
  {
    id: 'valid',
    label: 'valid trip',
    body: '{"distance_km": 12.4, "hour_of_day": 8, "day_of_week": 1, "pickup_zone_id": 3, "traffic_index": 0.62, "is_raining": false}',
  },
  {
    id: 'zone',
    label: 'zone 13',
    body: '{"distance_km": 12.4, "hour_of_day": 8, "day_of_week": 1, "pickup_zone_id": 13, "traffic_index": 0.62, "is_raining": false}',
  },
  {
    id: 'nan',
    label: 'NaN distance',
    body: '{"distance_km": NaN, "hour_of_day": 8, "day_of_week": 1, "pickup_zone_id": 3, "traffic_index": 0.62, "is_raining": false}',
  },
  {
    id: 'string',
    label: '"8" as hour',
    body: '{"distance_km": 12.4, "hour_of_day": "8", "day_of_week": 1, "pickup_zone_id": 3, "traffic_index": 0.62, "is_raining": false}',
  },
  {
    id: 'range',
    label: 'traffic 1.4',
    body: '{"distance_km": 12.4, "hour_of_day": 8, "day_of_week": 1, "pickup_zone_id": 3, "traffic_index": 1.4, "is_raining": false}',
  },
  {
    id: 'extra',
    label: 'extra field',
    body: '{"distance_km": 12.4, "hour_of_day": 8, "day_of_week": 1, "pickup_zone_id": 3, "traffic_index": 0.62, "is_raining": false, "driver_tip": 3}',
  },
  {
    id: 'missing',
    label: 'missing + bool',
    body: '{"distance_km": 12.4, "hour_of_day": 8, "pickup_zone_id": 3, "traffic_index": 0.62, "is_raining": 1}',
  },
];

const DELTA_EDGES = [0.5, 1, 2, 3, 5, 10];
const SPLIT_SECONDS = 20;
const ease = [0.22, 1, 0.36, 1] as const;

const fmt = (v: number, d = 2) => v.toFixed(d);

export default function ModelgateDemo() {
  useServiceVersion();
  const reduce = useReducedMotion();
  const [body, setBody] = useState(PRESETS[0].body);
  const [response, setResponse] = useState<PredictOutcome | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);

  // The sim clock runs while the demo is mounted; the generator only sends
  // while it is started.
  useEffect(() => startClock(), []);

  const primary = service.registry.primary?.version ?? 'none';
  const shadow = service.registry.shadow?.version ?? null;
  const previous = service.registry.previous?.version ?? null;
  const report = service.shadowReport();
  const hist = service.tracker.histogram(DELTA_EDGES);
  const histMax = Math.max(1, ...hist);
  const stats = loadgen.stats();
  const split = loadgen.recentSplit(SPLIT_SECONDS);
  const splitMax = Math.max(1, ...split.map((s) => Object.values(s.counts).reduce((a, b) => a + b, 0) + s.rejected));
  const swaps = service.registry.swapHistory;
  const lastSwap = swaps[swaps.length - 1] ?? null;
  const rejections = service.metrics.inputRejections;
  const running = loadgen.running;

  const send = () => {
    setResponse(service.predict(body));
    touch();
  };

  const toggleShadow = () => {
    service.setShadow(shadow ? null : primary === 'v1' ? 'v2' : 'v1');
    touch();
  };

  const promote = (version: string) => {
    service.promote(version);
    touch();
  };

  const rollback = () => {
    service.rollback();
    touch();
  };

  const toggleLoad = () => {
    if (running) loadgen.stop();
    else loadgen.start();
    touch();
  };

  const resetLoad = () => {
    loadgen.stop();
    loadgen.reset();
    touch();
  };

  const toggleChaos = () => {
    loadgen.chaos = loadgen.chaos > 0 ? 0 : 0.05;
    touch();
  };

  return (
    <div className="demo" aria-label="modelgate serving simulation">
      <span className="demo__tag">Model serving</span>
      <h3 className="demo__title">modelgate</h3>
      <p className="demo__lede">
        Two real ETA networks (v1: 64 x 2, v2: 96 x 3, exported from the
        trained artifacts) sit behind a port of the serving path. Every body
        is checked before a tensor is built and rejected with a per-field
        reason. A shadow version scores itself against the primary on the
        same inputs. Start 200 rps, press Promote, and the serving version
        flips inside one second while in-flight requests finish on the model
        they captured: nothing is dropped.
      </p>

      <div className="mg__grid">
        <section className="mg__panel" aria-label="Request builder">
          <div className="mg__panel-head">
            POST /predict
            <span className="mg__panel-count">primary {primary}{shadow ? `, shadow ${shadow}` : ''}</span>
          </div>
          <div className="mg__presets" role="group" aria-label="Request presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`mg__preset${body === p.body ? ' mg__preset--on' : ''}`}
                onClick={() => setBody(p.body)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            className="mg__body mono"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            spellCheck={false}
            aria-label="Request body"
          />
          <div className="demo__controls mg__controls">
            <button className="demo__btn" onClick={send}>
              Send request
            </button>
            <span className="demo__hint">strict schema: no coercion, no extra fields</span>
          </div>
          <AnimatePresence mode="wait">
            {response && (
              <motion.div
                key={response.requestId}
                className={`mg__response${response.status === 200 ? ' mg__response--ok' : ' mg__response--bad'}`}
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.25, ease }}
              >
                <div className="mg__response-head mono">
                  <span className="mg__status">{response.status}</span>
                  <span>request {response.requestId}</span>
                </div>
                {response.status === 200 ? (
                  <dl className="mg__kv">
                    <dt>eta_minutes</dt>
                    <dd className="mg__hi">{fmt(response.etaMinutes)}</dd>
                    <dt>model_version</dt>
                    <dd>{response.modelVersion}</dd>
                    {response.shadow && (
                      <>
                        <dt>shadow {response.shadow.version}</dt>
                        <dd>
                          {fmt(response.shadow.etaMinutes)} min, |d| {fmt(response.shadow.absDelta)}
                          <span className="mg__note"> (recorded, not returned to the client)</span>
                        </dd>
                      </>
                    )}
                  </dl>
                ) : response.status === 422 ? (
                  <ul className="mg__rejections">
                    {response.rejections.map((r, i) => (
                      <li key={i}>
                        <span className="mg__field mono">{r.field}</span>
                        <span className="mg__reason mono">{r.reason}</span>
                        <span className="mg__msg">{r.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mg__msg">{response.error}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mg__reasons">
            <span className="mg__reasons-head">modelgate_input_rejections_total</span>
            <ul>
              {REJECTION_REASONS.map((reason) => (
                <li key={reason} className={rejections.get({ reason }) > 0 ? 'mg__reason-on' : ''}>
                  <span className="mono">{reason}</span>
                  <b className="mono">{rejections.get({ reason })}</b>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mg__panel" aria-label="Shadow runs">
          <div className="mg__panel-head">
            Shadow divergence
            <span className="mg__panel-count">
              {shadow ? `${shadow} shadowing ${primary}, n=${report.window}` : 'shadow off'}
            </span>
          </div>
          <div className="mg__versions">
            {Object.entries(VERSIONS).map(([v, entry]) => {
              const role = v === primary ? 'primary' : v === shadow ? 'shadow' : v === previous ? 'previous' : 'resident';
              return (
                <div key={v} className={`mg__version mg__version--${role}`}>
                  <span className="mg__version-name mono">{v}</span>
                  <span className="mg__version-role mono">{role}</span>
                  <span className="mg__version-meta">
                    {entry.arch.hidden} x {entry.arch.depth}, test MAE {entry.testMae.toFixed(2)} min
                  </span>
                </div>
              );
            })}
          </div>
          <div className="demo__controls mg__controls">
            <button className={`demo__btn${shadow ? ' demo__btn--ghost' : ''}`} onClick={toggleShadow}>
              {shadow ? 'Disable shadow' : `Shadow ${primary === 'v1' ? 'v2' : 'v1'}`}
            </button>
            <span className="demo__hint">runs on every request, client always gets the primary</span>
          </div>
          {shadow && report.window > 0 ? (
            <>
              <div className="mg__stats">
                <div className="mg__stat">
                  <span className="mg__stat-label">mean |d|</span>
                  <span className="mg__stat-val">{fmt(report.absDelta.mean)}<small>min</small></span>
                </div>
                <div className="mg__stat">
                  <span className="mg__stat-label">p95 |d|</span>
                  <span className="mg__stat-val">{fmt(report.absDelta.p95)}<small>min</small></span>
                </div>
                <div className="mg__stat">
                  <span className="mg__stat-label">beyond {report.thresholdMinutes} min</span>
                  <span className="mg__stat-val">{Math.round(report.shareBeyondThreshold * 100)}<small>%</small></span>
                </div>
                <div className="mg__stat">
                  <span className="mg__stat-label">bias</span>
                  <span className="mg__stat-val">{report.biasMinutes > 0 ? '+' : ''}{fmt(report.biasMinutes)}<small>min</small></span>
                </div>
              </div>
              <div className="mg__hist" aria-label="Histogram of absolute shadow divergence">
                {hist.map((n, i) => (
                  <div key={i} className="mg__hist-col">
                    <motion.span
                      className="mg__hist-bar"
                      animate={{ height: `${(n / histMax) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.25, ease }}
                    />
                    <span className="mg__hist-lab mono">{i < DELTA_EDGES.length ? `<${DELTA_EDGES[i]}` : `>${DELTA_EDGES[DELTA_EDGES.length - 1]}`}</span>
                  </div>
                ))}
              </div>
              <p className="mg__note">
                README run: n={REAL_DEMO.shadowReport.n}, mean |d| {REAL_DEMO.shadowReport.meanAbs}, p95 |d|{' '}
                {REAL_DEMO.shadowReport.p95Abs}, beyond 2 min {Math.round(REAL_DEMO.shadowReport.beyond2min * 100)}%.
              </p>
            </>
          ) : (
            <p className="mg__note">
              {shadow
                ? 'Send requests or start the load to fill the divergence window.'
                : 'Enable the shadow, then send requests or start the load. Each request runs both versions on the same features and records |shadow - primary|.'}
            </p>
          )}
        </section>
      </div>

      <section className="mg__panel mg__panel--load" aria-label="Live request stream">
        <div className="mg__panel-head">
          Version swap under load
          <span className="mg__panel-count">
            open-loop {loadgen.rps} rps, {loadgen.inFlight} in flight, t+{stats.elapsed.toFixed(1)} s
          </span>
        </div>
        <div className="mg__load">
          <div>
            <div className="demo__controls mg__controls mg__controls--top">
              <button className="demo__btn" onClick={toggleLoad}>
                {running ? 'Pause load' : stats.sent > 0 ? 'Resume load' : `Start ${loadgen.rps} rps`}
              </button>
              <button className="demo__btn demo__btn--ghost" onClick={() => promote(primary === 'v1' ? 'v2' : 'v1')}>
                Promote {primary === 'v1' ? 'v2' : 'v1'}
              </button>
              <button className="demo__btn demo__btn--ghost" onClick={rollback} disabled={!previous}>
                Rollback
              </button>
              <button
                className={`demo__btn demo__btn--ghost${loadgen.chaos > 0 ? ' mg__btn--on' : ''}`}
                onClick={toggleChaos}
                aria-pressed={loadgen.chaos > 0}
              >
                5% malformed
              </button>
              <button className="demo__btn demo__btn--ghost" onClick={resetLoad} disabled={stats.sent === 0}>
                Reset
              </button>
            </div>
            <div className="mg__split" aria-label="Per-second version split, last 20 seconds">
              {split.map((s) => {
                const total = Object.values(s.counts).reduce((a, b) => a + b, 0) + s.rejected;
                const v1 = s.counts.v1 ?? 0;
                const v2 = s.counts.v2 ?? 0;
                return (
                  <div key={s.second} className="mg__split-col" title={`${s.second}s: v1 ${v1}, v2 ${v2}, rejected ${s.rejected}, dropped ${s.dropped}`}>
                    <div className="mg__split-stack" style={{ height: `${(total / splitMax) * 100}%` }}>
                      {s.rejected > 0 && <span className="mg__split-rej" style={{ flex: s.rejected }} />}
                      {v2 > 0 && <span className="mg__split-v2" style={{ flex: v2 }} />}
                      {v1 > 0 && <span className="mg__split-v1" style={{ flex: v1 }} />}
                    </div>
                    <span className="mg__split-lab mono">{s.second}</span>
                  </div>
                );
              })}
            </div>
            <div className="mg__legend mono">
              <span><i className="mg__sw mg__sw--v1" /> v1</span>
              <span><i className="mg__sw mg__sw--v2" /> v2</span>
              <span><i className="mg__sw mg__sw--rej" /> 422</span>
              <span>per-second split of answered requests</span>
            </div>
          </div>
          <div className="mg__stats mg__stats--load">
            <div className="mg__stat mg__stat--hero">
              <span className="mg__stat-label">dropped</span>
              <span className="mg__stat-val">{stats.dropped}</span>
              <span className="mg__stat-ref">non-2xx or no response; measured {REAL_DEMO.dropped} of {REAL_DEMO.totalRequests}</span>
            </div>
            <div className="mg__stat">
              <span className="mg__stat-label">successes / sent</span>
              <span className="mg__stat-val">{stats.ok}<small>/ {stats.sent}</small></span>
              <span className="mg__stat-ref">{stats.rejected} rejected with 422</span>
            </div>
            <div className="mg__stat">
              <span className="mg__stat-label">latency p50 / p95</span>
              <span className="mg__stat-val">{fmt(stats.latency.p50)}<small>/ {fmt(stats.latency.p95)} ms</small></span>
              <span className="mg__stat-ref">measured {REAL_DEMO.latencyMs.p50} / {REAL_DEMO.latencyMs.p95} ms</span>
            </div>
            <div className="mg__stat">
              <span className="mg__stat-label">last swap</span>
              <span className="mg__stat-val mg__stat-val--small">
                {lastSwap ? `${lastSwap.from ?? 'none'} to ${lastSwap.to}` : 'none yet'}
              </span>
              <span className="mg__stat-ref">
                {lastSwap
                  ? `${lastSwap.kind} at t+${(lastSwap.at - loadgen.startedAt).toFixed(3)} s, one reference assignment under the lock`
                  : 'candidate is loaded and warmed off the request path first'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mg__panel" aria-label="Prometheus metrics">
        <div className="mg__panel-head">
          GET /metrics
          <span className="mg__panel-count">
            requests {service.metrics.requests.total()}, swaps {service.metrics.versionSwaps.total()}, dropped {service.metrics.droppedRequests.total()}
          </span>
        </div>
        <ul className="mg__metrics">
          {service.metrics.requests.series().map((s) => (
            <li key={`req-${s.labels.version}-${s.labels.outcome}`}>
              <span className="mono">modelgate_requests_total{`{version="${s.labels.version}",outcome="${s.labels.outcome}"}`}</span>
              <b className="mono">{s.value}</b>
            </li>
          ))}
          <li>
            <span className="mono">modelgate_dropped_requests_total</span>
            <b className="mono">{service.metrics.droppedRequests.total()}</b>
          </li>
          {service.metrics.versionSwaps.series().map((s) => (
            <li key={`swap-${s.labels.kind}`}>
              <span className="mono">modelgate_version_swaps_total{`{kind="${s.labels.kind}"}`}</span>
              <b className="mono">{s.value}</b>
            </li>
          ))}
          {service.metrics.shadowRequests.series().map((s) => (
            <li key={`sh-${s.labels.shadow}-${s.labels.outcome}`}>
              <span className="mono">modelgate_shadow_requests_total{`{shadow="${s.labels.shadow}",outcome="${s.labels.outcome}"}`}</span>
              <b className="mono">{s.value}</b>
            </li>
          ))}
        </ul>
        <div className="demo__controls mg__controls">
          <button className="demo__btn demo__btn--ghost" onClick={() => setShowMetrics((v) => !v)} aria-expanded={showMetrics}>
            {showMetrics ? 'Hide exposition' : 'Show full exposition'}
          </button>
        </div>
        {showMetrics && (
          <pre className="mg__expo mono" aria-label="Prometheus text exposition">
            {service.exposition()}
          </pre>
        )}
      </section>
    </div>
  );
}
