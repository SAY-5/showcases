import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './failsafe.css';
import { run, startClock, touch, useRunVersion } from './failsafe/state';
import { CHAOS } from './failsafe/chaos';
import type { BreakerState } from './failsafe/breaker';
import type { RequestResult } from './failsafe/gateway';

// In-browser failsafe: a port of the gateway's request path on a virtual
// clock. Requests fan out to three replicas through a token bucket, a breaker
// per replica, and a forwarder that retries with jittered backoff and fails
// over. Kill, hang or break replicas by hand, then run the 45 s chaos load
// and watch client-visible failures stay at 0 while retries and failovers
// count what the gateway absorbed.

const SPEEDS = [1, 2, 4];
const REAL = { requests: 6751, success: 6751, failed: 0, retries: 5, failovers: 5, kills: 4, p50: 3.2, p95: 5.1, p99: 7.8 };
const STATES: BreakerState[] = ['closed', 'open', 'half_open'];
const ease = [0.22, 1, 0.36, 1] as const;

function attemptsText(r: RequestResult): string {
  return r.attempts
    .map((a) => {
      const took = ((a.endedAt - a.startedAt) * 1000).toFixed(1);
      const tail = a.outcome === 'success' ? `${a.status} in ${took} ms` : a.outcome === 'status' ? `${a.status}` : a.outcome;
      const sleep = a.backoff > 0 ? `, sleep ${(a.backoff * 1000).toFixed(0)} of ${(a.backoffCeiling * 1000).toFixed(0)} ms` : '';
      return `${a.replica} ${tail}${sleep}`;
    })
    .join(' > ');
}

export default function FailsafeDemo() {
  useRunVersion();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState(1);
  const [breakerFocus, setBreakerFocus] = useState('upstream-1');

  useEffect(() => startClock(speed), [speed]);

  const m = run.gateway.metrics;
  const snap = m.snapshot();
  const bucket = run.gateway.limiter!.bucket('key:demo');
  const tokens = bucket.tokens;
  const focus = run.pool.get(breakerFocus) ?? run.pool.replicas[0];
  const breaker = focus.breaker;
  const bstate = breaker.state;
  const perSecond = run.perSecond.slice(-45);
  const perMax = Math.max(1, ...perSecond.map((b) => b.ok + b.failed));
  const running = run.running && !run.finished;
  const progress = run.running ? Math.min(1, run.elapsed / CHAOS.durationSeconds) : 0;
  const kills = run.timeline.filter((e) => e.kind === 'kill' || e.kind === 'start').slice(-8);
  const transitions = m.breakerTransitions.slice(-5).reverse();

  const act = (fn: () => void) => () => {
    fn();
    touch();
  };

  return (
    <div className="demo" aria-label="failsafe gateway simulation">
      <span className="demo__tag">Resilient gateway</span>
      <h3 className="demo__title">failsafe</h3>
      <p className="demo__lede">
        Requests enter through a per-key token bucket, pick a healthy replica
        whose breaker admits the call, and retry with full-jitter backoff on
        another replica when a connection dies. Kill a replica by hand, make one
        answer 503 until its breaker opens, burst past the bucket, then run the
        45 s chaos load: replicas get SIGKILLed under 150 rps and the client
        failure counter has to stay at 0.
      </p>

      <section className="fs__panel" aria-label="Gateway fan-out">
        <div className="fs__panel-head">
          Gateway fan-out
          <span className="fs__panel-count">
            {snap.inflight} in flight, {snap.requests} completed, health probe every {run.pool.health.intervalSeconds} s
          </span>
        </div>
        <div className="fs__fan">
          <div className="fs__gw">
            <span className="fs__gw-name">failsafe</span>
            <span className="fs__gw-meta mono">route match, token bucket, forwarder</span>
            <span className="fs__gw-meta mono">retry {run.gateway.policy.maxAttempts} attempts, backoff {CHAOS.retry.baseDelayMs} to {CHAOS.retry.maxDelayMs} ms</span>
            <div className="fs__send">
              <button className="demo__btn" onClick={act(() => run.send('GET', false))}>GET /orders/42</button>
              <button className="demo__btn demo__btn--ghost" onClick={act(() => run.send('POST', true))}>POST + Idempotency-Key</button>
              <button className="demo__btn demo__btn--ghost" onClick={act(() => run.send('POST', false))}>POST, no key</button>
            </div>
          </div>
          <div className="fs__replicas">
            {run.pool.replicas.map((r) => {
              const st = r.breaker.state;
              const inflight = run.gateway.inflightOn(r.label);
              const cls = !r.alive ? 'fs__replica--dead' : r.hang ? 'fs__replica--hang' : r.failStatus ? 'fs__replica--503' : !r.healthy ? 'fs__replica--unhealthy' : st === 'open' ? 'fs__replica--open' : 'fs__replica--ok';
              return (
                <div key={r.label} className={`fs__replica ${cls}`}>
                  <div className="fs__replica-head">
                    <span className="fs__replica-name mono">{r.label}</span>
                    <span className="fs__replica-state mono">
                      {!r.alive ? 'killed' : r.hang ? 'hanging' : r.failStatus ? `answers ${r.failStatus}` : r.healthy ? 'healthy' : 'unhealthy'}
                    </span>
                  </div>
                  <div className="fs__replica-meta mono">
                    <span>breaker {st.replace('_', '-')}</span>
                    <span>{inflight} in flight</span>
                    <span>{r.served} served</span>
                  </div>
                  <div className="fs__inflight" aria-hidden="true">
                    {Array.from({ length: Math.min(12, inflight) }, (_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                  <div className="fs__replica-actions">
                    <button className="fs__mini" onClick={act(() => run.kill(r.label))} disabled={!r.alive}>
                      SIGKILL
                    </button>
                    <button className={`fs__mini${r.hang ? ' fs__mini--on' : ''}`} onClick={act(() => { r.hang = !r.hang; })} aria-pressed={r.hang}>
                      hang
                    </button>
                    <button className={`fs__mini${r.failStatus ? ' fs__mini--on' : ''}`} onClick={act(() => { r.failStatus = r.failStatus ? null : 503; })} aria-pressed={!!r.failStatus}>
                      503
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ul className="fs__recent mono" aria-live="polite" aria-label="Recent requests">
          {run.recent.slice(-5).reverse().map((r) => (
            <li key={r.id} className={r.status >= 500 ? 'fs__recent--bad' : r.status === 429 ? 'fs__recent--limited' : r.attempts.length > 1 ? 'fs__recent--retried' : ''}>
              <span className="fs__recent-status">{r.status}</span>
              <span className="fs__recent-req">{r.method} {r.path}</span>
              <span className="fs__recent-detail">
                {r.status === 429 ? `rate limited, Retry-After ${r.retryAfter}` : r.attempts.length ? attemptsText(r) : r.detail}
              </span>
            </li>
          ))}
          {run.recent.length === 0 && <li className="fs__empty">Send a request or start the chaos run.</li>}
        </ul>
      </section>

      <div className="fs__grid">
        <section className="fs__panel" aria-label="Token bucket">
          <div className="fs__panel-head">
            Token bucket, key:demo
            <span className="fs__panel-count">capacity {bucket.capacity}, refill {bucket.refillRate}/s</span>
          </div>
          <div className="fs__bucket" aria-label={`${tokens.toFixed(0)} of ${bucket.capacity} tokens`}>
            <span className="fs__bucket-fill" style={{ width: `${(tokens / bucket.capacity) * 100}%` }} />
            <span className="fs__bucket-lab mono">{tokens.toFixed(0)} / {bucket.capacity} tokens</span>
          </div>
          <dl className="fs__kv">
            <dt>refill</dt>
            <dd>continuous: tokens += elapsed x {bucket.refillRate}, capped at {bucket.capacity}</dd>
            <dt>on deficit</dt>
            <dd>429 with Retry-After = ceil(deficit / {bucket.refillRate}) s</dd>
            <dt>rate limited</dt>
            <dd className={snap.rateLimited > 0 ? 'fs__warn' : ''}>{snap.rateLimited} so far</dd>
          </dl>
          <div className="demo__controls fs__controls">
            <button className="demo__btn" onClick={act(() => { for (let i = 0; i < 50; i++) run.send('GET', false); })}>
              Burst 50
            </button>
            <button className="demo__btn demo__btn--ghost" onClick={act(() => { for (let i = 0; i < 250; i++) run.send('GET', false); })}>
              Burst 250
            </button>
            <span className="demo__hint">a burst over capacity gets exact Retry-After</span>
          </div>
        </section>

        <section className="fs__panel" aria-label="Circuit breaker">
          <div className="fs__panel-head">
            Breaker state machine
            <span className="fs__panel-count">
              window {breaker.opts.window}, ratio {breaker.opts.failureRatio}, {breaker.opts.consecutiveFailures} consecutive, open {breaker.opts.openSeconds} s, {breaker.opts.halfOpenMax} probes
            </span>
          </div>
          <div className="fs__focus" role="group" aria-label="Replica">
            {run.pool.replicas.map((r) => (
              <button key={r.label} className={`fs__chip${r.label === focus.label ? ' fs__chip--on' : ''}`} onClick={() => setBreakerFocus(r.label)} aria-pressed={r.label === focus.label}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="fs__machine">
            {STATES.map((s, i) => (
              <div key={s} className="fs__state-wrap">
                <div className={`fs__state${bstate === s ? ` fs__state--on fs__state--${s}` : ''}`}>
                  <span className="fs__state-name mono">{s.replace('_', '-')}</span>
                  <span className="fs__state-note">
                    {s === 'closed'
                      ? `${breaker.windowSnapshot.filter(Boolean).length} of ${breaker.windowSnapshot.length} failed, ${breaker.consecutiveCount} in a row`
                      : s === 'open'
                        ? bstate === 'open' ? `probe in ${breaker.timeUntilProbe().toFixed(1)} s` : 'no traffic'
                        : `${breaker.probes.succeeded} of ${breaker.opts.halfOpenMax} probes ok`}
                  </span>
                </div>
                {i < STATES.length - 1 && <span className="fs__state-arrow" aria-hidden="true" />}
              </div>
            ))}
          </div>
          <div className="fs__window" aria-label="Outcome window">
            {Array.from({ length: breaker.opts.window }, (_, i) => {
              const v = breaker.windowSnapshot[i];
              return <span key={i} className={`fs__dot${v === undefined ? '' : v ? ' fs__dot--fail' : ' fs__dot--ok'}`} />;
            })}
          </div>
          <div className="demo__controls fs__controls">
            <button
              className={`demo__btn${focus.failStatus ? ' demo__btn--ghost' : ''}`}
              onClick={act(() => { focus.failStatus = focus.failStatus ? null : 503; })}
            >
              {focus.failStatus ? `Stop 503 on ${focus.label}` : `Make ${focus.label} answer 503`}
            </button>
            <button className="demo__btn demo__btn--ghost" onClick={act(() => { for (let i = 0; i < 12; i++) run.send('GET', false); })}>
              Send 12 GETs
            </button>
          </div>
          <ul className="fs__transitions mono">
            {transitions.map((t, i) => (
              <li key={`${t.at}-${i}`}>
                <span className="fs__at">t+{t.at.toFixed(1)}</span>
                <span>{t.upstream}: {t.from.replace('_', '-')} to {t.to.replace('_', '-')}</span>
              </li>
            ))}
            {transitions.length === 0 && <li className="fs__empty">Breaker transitions appear here. Round-robin sends every third GET to the 503 replica; three consecutive failures there trip it open, and each failed attempt is retried on another replica so the client still sees 200.</li>}
          </ul>
        </section>
      </div>

      <section className="fs__panel fs__panel--chaos" aria-label="Chaos run">
        <div className="fs__panel-head">
          Chaos run
          <span className="fs__panel-count">
            {CHAOS.rps} rps for {CHAOS.durationSeconds} s, kill every {CHAOS.killIntervalMin} to {CHAOS.killIntervalMax} s, restart after {CHAOS.restartAfter} s
          </span>
        </div>
        <div className="fs__chaos">
          <div>
            <div className="demo__controls fs__controls fs__controls--top">
              <button className="demo__btn" onClick={act(() => run.start())} disabled={running}>
                {running ? 'Running...' : run.running ? 'Run again' : 'Start make chaos'}
              </button>
              <div className="fs__speeds" role="group" aria-label="Simulation speed">
                {SPEEDS.map((s) => (
                  <button key={s} className={`fs__speed${speed === s ? ' fs__speed--on' : ''}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                    {s}x
                  </button>
                ))}
              </div>
            </div>
            <div className="fs__progress" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="fs__bars" aria-label="Requests per second: successes, retried, failed">
              {perSecond.map((b) => (
                <div key={b.second} className="fs__bar-col" title={`${b.second}s: ${b.ok} ok, ${b.retried} retried, ${b.failed} failed`}>
                  <div className="fs__bar" style={{ height: `${((b.ok + b.failed) / perMax) * 100}%` }}>
                    {b.failed > 0 && <span className="fs__bar-fail" style={{ flex: b.failed }} />}
                    {b.retried > 0 && <span className="fs__bar-retry" style={{ flex: b.retried }} />}
                    <span className="fs__bar-ok" style={{ flex: Math.max(0, b.ok - b.retried) }} />
                  </div>
                </div>
              ))}
              {perSecond.length === 0 && <span className="fs__empty">Per-second outcomes appear here.</span>}
            </div>
            <ul className="fs__timeline mono" aria-label="Kill timeline">
              {kills.map((e, i) => (
                <li key={`${e.at}-${i}`} className={e.kind === 'kill' ? 'fs__tl--kill' : 'fs__tl--start'}>
                  <span className="fs__at">t+{(e.at - run.startedAt).toFixed(1)} s</span>
                  <span>{e.kind}</span>
                  <span>{e.replica}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="fs__stats">
            <div className="fs__stat fs__stat--hero">
              <span className="fs__stat-label">client-visible failed</span>
              <span className="fs__stat-val">{snap.clientFailed}</span>
              <span className="fs__stat-ref">must be 0; measured {REAL.failed} of {REAL.requests}</span>
            </div>
            <div className="fs__stat">
              <span className="fs__stat-label">successful / total</span>
              <span className="fs__stat-val">{snap.success}<small>/ {snap.requests}</small></span>
              <span className="fs__stat-ref">{snap.rateLimited} rate limited (429)</span>
            </div>
            <div className="fs__stat">
              <span className="fs__stat-label">retries / failovers</span>
              <span className="fs__stat-val">{snap.retries}<small>/ {snap.failovers}</small></span>
              <span className="fs__stat-ref">
                connect {snap.retriesByKind.connect}, read {snap.retriesByKind.read}, timeout {snap.retriesByKind.timeout}, status {snap.retriesByKind.status}; measured {REAL.retries} / {REAL.failovers}
              </span>
            </div>
            <div className="fs__stat">
              <span className="fs__stat-label">kills / breaker transitions</span>
              <span className="fs__stat-val">{run.kills}<small>/ {snap.breakerTransitions}</small></span>
              <span className="fs__stat-ref">measured {REAL.kills} kills, 0 transitions</span>
            </div>
            <div className="fs__stat">
              <span className="fs__stat-label">latency p50 / p95 / p99</span>
              <span className="fs__stat-val fs__stat-val--small">{snap.p50.toFixed(1)} / {snap.p95.toFixed(1)} / {snap.p99.toFixed(1)}<small>ms</small></span>
              <span className="fs__stat-ref">measured {REAL.p50} / {REAL.p95} / {REAL.p99} ms, max includes a kill mid-attempt</span>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {run.finished && (
            <motion.div
              className={`fs__verdict${snap.clientFailed > 0 ? ' fs__verdict--fail' : ''}`}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <span className="fs__verdict-head">
                {snap.clientFailed === 0 ? `PASS: 0 client-visible failures across ${run.kills} kills` : `FAIL: ${snap.clientFailed} client-visible failures`}
              </span>
              <span className="fs__verdict-text">
                {snap.retries} request{snap.retries === 1 ? ' was' : 's were'} in flight to a container at the moment it was killed; each one was retried on
                another replica and the client saw a 200. The README run reports {REAL.requests} requests, {REAL.retries} retries, {REAL.failovers} failovers,
                {' '}{REAL.kills} kills and {REAL.failed} failures.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
