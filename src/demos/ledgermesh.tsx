import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './ledgermesh.css';
import { resetSession, session, startClock, touch, useSessionVersion } from './ledgermesh/state';
import { CHAOS, type BreakerSnap, type ServiceSnap, type Snap } from './ledgermesh/sim';

// In-browser ledgermesh: the three services on a virtual clock. Each service
// commits its state change together with the outbox row that announces it, a
// relay publishes outbox rows to a Kafka-shaped log with at-least-once
// delivery, and consumers ignore redeliveries by event id. The order saga runs
// PENDING to RESERVED to CONFIRMED or CANCELLED, the stock check falls back to
// the last live value behind a breaker, and payment authorization defers the
// payment when retries run out or its breaker is open. Kill services by hand
// or run the 60 s chaos load; the seeded run reports the measured counts.

const SPEEDS = [1, 2, 4, 8];
const REAL = { orders: 1200, confirmed: 1162, cancelled: 38, failed: 0, kills: 3, p50: 12825, p95: 36859 };
const STATES = ['CLOSED', 'OPEN', 'HALF_OPEN'] as const;
const ease = [0.22, 1, 0.36, 1] as const;

function short(name: string): string {
  return name.replace('-service', '');
}

function serviceState(s: ServiceSnap): string {
  if (!s.alive) return 'killed';
  if (!s.ready) return 'booting';
  return 'up';
}

function statusLine(snap: Snap): string {
  if (snap.phase === 'idle') return `ready: seed ${CHAOS.seed}, ${CHAOS.rate} orders/s for ${CHAOS.durationMs / 1000} s`;
  if (snap.phase === 'done') return `settled at t+${(snap.now / 1000).toFixed(1)} s: ${snap.stats.submitted} orders, ${snap.stats.failed} failed or stuck`;
  const prefix = snap.paused ? 'paused, ' : '';
  if (snap.phase === 'draining') return `${prefix}load done, draining ${snap.inFlight} open orders`;
  return `${prefix}load t+${(snap.now / 1000).toFixed(1)} s, ${snap.stats.submitted} submitted, ${snap.inFlight} in flight`;
}

export default function LedgermeshDemo() {
  useSessionVersion();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState(2);

  useEffect(() => startClock(speed), [speed]);

  const snap = session().snapshot();
  const st = snap.stats;
  const act = (fn: () => void) => () => {
    fn();
    touch();
  };
  const end = Math.max(CHAOS.durationMs * 1.25, snap.now + 2000);
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / end) * 100))}%`;
  const primary =
    snap.phase === 'idle'
      ? { label: 'Start chaos run', run: act(() => session().start()) }
      : snap.phase === 'done'
        ? { label: 'Run again', run: () => resetSession(true) }
        : { label: snap.paused ? 'Resume' : 'Pause', run: act(() => session().togglePause()) };

  return (
    <div className="demo lm" data-motion={reduce ? 'reduced' : 'full'} aria-label="ledgermesh saga simulation">
      <span className="demo__tag">Saga under chaos</span>
      <h3 className="demo__title">ledgermesh</h3>
      <p className="demo__lede">
        Orders enter the order service, which writes the order and its event in one transaction; a relay publishes the
        event, inventory reserves stock, payment authorizes, and the saga confirms or cancels. Kill any service while
        orders flow, force the payment processor into transient faults, then run the {CHAOS.durationMs / 1000} s chaos
        load: {CHAOS.rate} orders a second with three kills, and the failed or stuck counter has to stay at 0.
      </p>

      <div className="lm__status mono" aria-live="polite">
        <span className="lm__dot" data-phase={snap.phase} data-paused={snap.paused} />
        {statusLine(snap)}
      </div>

      <section className="lm__panel" aria-label="Services">
        <div className="lm__panel-head">
          Services
          <span className="lm__panel-count">outbox poll 200 ms, 3 consumers per topic, boot 2.5 s after restart</span>
        </div>
        <div className="lm__services">
          {snap.services.map((s) => (
            <div key={s.name} className="lm__svc" data-state={serviceState(s)}>
              <div className="lm__svc-head">
                <span className="lm__svc-name mono">{s.name}</span>
                <span className="lm__svc-state mono">{serviceState(s)}</span>
              </div>
              <p className="lm__svc-note mono">{s.note}</p>
              <dl className="lm__kv mono">
                <div>
                  <dt>outbox</dt>
                  <dd>{s.outbox}</dd>
                </div>
                <div>
                  <dt>relay</dt>
                  <dd>{s.relay}</dd>
                </div>
                <div>
                  <dt>lag</dt>
                  <dd>{s.lag}</dd>
                </div>
                <div>
                  <dt>restarts</dt>
                  <dd>{s.restarts}</dd>
                </div>
              </dl>
              <button className="lm__kill mono" onClick={act(() => session().kill(s.name))} disabled={!s.alive || snap.phase === 'done'}>
                SIGKILL {short(s.name)}
              </button>
            </div>
          ))}
        </div>
        <ul className="lm__topics mono" aria-label="Topic lag">
          {snap.topics.map((t) => (
            <li key={t.name} data-busy={t.lag > 0}>
              {t.name} <b>{t.lag}</b>
            </li>
          ))}
        </ul>
        <p className="lm__note">
          Scheduled kills pick inventory or payment, as chaos/run.sh does. order-service is the entry point: while it is
          down POST /orders is refused, and the harness counts refused submissions as failed.
        </p>
      </section>

      <div className="lm__grid">
        {snap.breakers.map((b) => (
          <Breaker key={b.owner} b={b} snap={snap} onFault={act(() => session().setProcessorFault(!session().processorFault))} />
        ))}

        <section className="lm__panel" aria-label="Saga stream">
          <div className="lm__panel-head">
            Saga stream
            <span className="lm__panel-count">latest orders to reach a terminal state</span>
          </div>
          <ul className="lm__orders mono">
            {snap.recent.length === 0 && <li className="lm__empty">Settled orders appear here once the run starts.</li>}
            {snap.recent.map((o) => (
              <li key={o.id} data-status={o.path[o.path.length - 1]}>
                <span className="lm__ord-id">{o.id.slice(4, 12)}</span>
                <span className="lm__ord-path">
                  {o.path.join(' > ')}
                  {o.reason ? ` (${o.reason})` : ''}
                </span>
                <span className="lm__ord-meta">
                  {o.sku} x{o.quantity}, {(o.ms / 1000).toFixed(2)} s
                </span>
              </li>
            ))}
          </ul>
          {snap.lastStockout && (
            <p className="lm__note mono">
              last out of stock: {snap.lastStockout.id.slice(4, 12)} {snap.lastStockout.sku} x{snap.lastStockout.quantity} at t+
              {(snap.lastStockout.at / 1000).toFixed(1)} s, no stock touched
            </p>
          )}
        </section>

        <section className="lm__panel" aria-label="Notable events">
          <div className="lm__panel-head">
            Notable events
            <span className="lm__panel-count">kills, breakers, redeliveries, deferrals</span>
          </div>
          <ol className="lm__log mono">
            {snap.log.length === 0 && <li className="lm__empty">Kills, breaker transitions and ignored duplicates appear here.</li>}
            {snap.log.map((t, i) => (
              <li key={`${t.t}-${t.kind}-${i}`} data-kind={t.kind}>
                <span className="lm__at">{(t.t / 1000).toFixed(1)}s</span>
                <span className="lm__src">{short(t.source)}</span>
                <span className="lm__txt">{t.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="lm__panel lm__panel--chaos" aria-label="Chaos run">
        <div className="lm__panel-head">
          Chaos run
          <span className="lm__panel-count">
            {CHAOS.rate} orders/s for {CHAOS.durationMs / 1000} s, {CHAOS.kills} kills, restart after {CHAOS.restartAfterMs / 1000} s, then drain
          </span>
        </div>
        <div className="demo__controls lm__controls">
          <button className="demo__btn" onClick={primary.run}>
            {primary.label}
          </button>
          <button className="demo__btn demo__btn--ghost" onClick={() => resetSession(false)}>
            Reset
          </button>
          <label className="lm__toggle mono">
            <input type="checkbox" checked={snap.autoChaos} onChange={act(() => session().setAutoChaos(!session().autoChaos))} /> scheduled kills
          </label>
          <div className="lm__speeds" role="group" aria-label="Simulation speed">
            {SPEEDS.map((x) => (
              <button key={x} className="lm__speed mono" data-on={speed === x} aria-pressed={speed === x} onClick={() => setSpeed(x)}>
                {x}x
              </button>
            ))}
          </div>
        </div>
        <div className="lm__track" aria-label="Kill timeline">
          <span className="lm__track-load" style={{ width: pct(Math.min(snap.now, CHAOS.durationMs)) }} />
          <span className="lm__track-drain" style={{ left: pct(CHAOS.durationMs), width: pct(Math.max(0, snap.now - CHAOS.durationMs)) }} />
          {snap.kills.map((k) => (
            <span key={`${k.service}-${k.at}`} className="lm__outage" style={{ left: pct(k.at), width: pct(k.readyAt - k.at) }} />
          ))}
          <span className="lm__cursor" style={{ left: pct(snap.now) }} />
        </div>
        <p className="lm__track-labels mono">
          {snap.kills.length === 0
            ? `scheduled: ${snap.plan.map((k) => `${short(k.service)} @${k.at / 1000}s`).join(', ')}`
            : `kills: ${snap.kills.map((k) => `${short(k.service)} @${Math.round(k.at / 1000)}s, ready @${(k.readyAt / 1000).toFixed(1)}s`).join('; ')}`}
        </p>
        <div className="lm__stats">
          <div className="lm__stat lm__stat--hero" data-bad={st.failed > 0}>
            <span className="lm__stat-label">failed / stuck</span>
            <span className="lm__stat-val">{st.failed}</span>
            <span className="lm__stat-ref">
              must be 0; measured {REAL.failed} of {REAL.orders}
              {st.refused ? `; ${st.refused} refused at POST /orders` : ''}
            </span>
          </div>
          <Stat label="submitted / confirmed" value={st.submitted} small={st.confirmed} refText={`measured ${REAL.orders} / ${REAL.confirmed}`} />
          <Stat label="cancelled (stock)" value={st.cancelledStock} refText={`measured ${REAL.cancelled}; SKU-SCARCE starts at 40`} />
          <Stat label="in flight / open payments" value={snap.inFlight} small={snap.openPayments} refText="waiting in an outbox, a topic or the sweeper" />
          <Stat label="deferred payments" value={st.deferred} refText={`${st.retries.failed_with_retry} exhausted, ${st.retries.failed_without_retry} not permitted`} />
          <Stat label="retried, then ok" value={st.retries.successful_with_retry} refText={`${st.retries.successful_without_retry} ok first time`} />
          <Stat label="duplicates ignored" value={st.duplicates} refText={`outbox backlog ${st.outboxBacklog}`} />
          <Stat
            label="saga p50 / p95"
            value={`${(st.p50 / 1000).toFixed(1)} / ${(st.p95 / 1000).toFixed(1)}`}
            refText={`virtual clock; measured ${(REAL.p50 / 1000).toFixed(1)} / ${(REAL.p95 / 1000).toFixed(1)} s on the Compose stack`}
          />
        </div>
        <pre className="lm__summary mono">{snap.summary}</pre>
        <AnimatePresence>
          {snap.phase === 'done' && (
            <motion.div
              className="lm__verdict"
              data-pass={st.failed === 0}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <span className="lm__verdict-head">
                {st.failed === 0 ? `PASS: 0 failed or stuck across ${st.kills.length} kills` : `FAIL: ${st.failed} failed or stuck`}
              </span>
              <span className="lm__verdict-text">
                {st.submitted} orders: {st.confirmed} confirmed and {st.cancelledStock} cancelled for stock. The measured run
                reports {REAL.orders} orders, {REAL.confirmed} confirmed, {REAL.cancelled} cancelled for stock, {REAL.kills} kills
                and {REAL.failed} failed or stuck.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function Breaker({ b, snap, onFault }: { b: BreakerSnap; snap: Snap; onFault: () => void }) {
  const log = snap.breakerLog.filter((t) => t.owner === b.owner).slice(-4).reverse();
  const note =
    b.state === 'OPEN'
      ? `calls not permitted, half-open in ${(b.reopensInMs / 1000).toFixed(1)} s`
      : b.state === 'HALF_OPEN'
        ? `${b.trials.length} of ${b.permitted} trial calls answered`
        : `${b.window.length} calls in window, ${b.failureRate.toFixed(0)}% failed`;
  return (
    <section className="lm__panel" aria-label={`${b.owner} circuit breaker`}>
      <div className="lm__panel-head">
        {b.owner === 'inventory' ? 'Breaker: order to inventory' : 'Breaker: payment to processor'}
        <span className="lm__panel-count">
          window {b.size}, min {b.minCalls}, {b.threshold}%, open {b.waitMs / 1000} s, {b.permitted} trials
        </span>
      </div>
      <div className="lm__machine">
        {STATES.map((s, i) => (
          <span key={s} className="lm__state-wrap">
            <span className="lm__state mono" data-on={b.state === s} data-state={s}>
              {s.replace('_', '-')}
            </span>
            {i < STATES.length - 1 && <span className="lm__arrow mono">{'->'}</span>}
          </span>
        ))}
      </div>
      <div className="lm__window" aria-label="Call outcomes in the sliding window">
        {Array.from({ length: b.size }, (_, i) => {
          const v = b.window[i];
          return <span key={i} className="lm__cell" data-v={v === undefined ? 'none' : v ? 'ok' : 'fail'} />;
        })}
      </div>
      <p className="lm__note">
        {note}.{' '}
        {b.owner === 'inventory' ? 'Fallback: the last live stock value for the sku.' : 'Fallback: the payment is deferred and the sweeper retries it.'}
      </p>
      {b.owner === 'processor' && (
        <label className="lm__toggle mono">
          <input type="checkbox" checked={snap.processorFault} onChange={onFault} /> processor answers transient faults
        </label>
      )}
      <ul className="lm__trans mono">
        {log.length === 0 && <li className="lm__empty">No transitions yet.</li>}
        {log.map((t, i) => (
          <li key={`${t.at}-${i}`}>
            <span className="lm__at">t+{(t.at / 1000).toFixed(1)}s</span> {t.from.replace('_', '-')} {'->'} {t.to.replace('_', '-')}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, small, refText }: { label: string; value: number | string; small?: number; refText: string }) {
  return (
    <div className="lm__stat">
      <span className="lm__stat-label">{label}</span>
      <span className="lm__stat-val">
        {value}
        {small !== undefined && <small>/ {small}</small>}
      </span>
      <span className="lm__stat-ref">{refText}</span>
    </div>
  );
}
