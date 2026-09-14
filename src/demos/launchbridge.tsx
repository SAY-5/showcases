import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './launchbridge.css';
import { bridge, resetBridge, startClock, touch, useBridgeVersion } from './launchbridge/state';
import { BENCH, BURST, type Tamper, type TimelineSnap } from './launchbridge/sim';
import { DESTINATIONS } from './launchbridge/delivery';

// In-browser launchbridge: the webhook service, its delivery worker and the
// receiver fake on virtual clocks. Requests are signed with HMAC-SHA256 over
// "<unix seconds>.<body>", verified step by step (timestamp, 300 s window,
// header, constant-time digest, signature not seen before), then recorded in a
// ledger keyed on (source, event_key) so a re-send is deduplicated. Deliveries
// retry 5xx with doubling backoff and 20 percent jitter to a bounded attempt
// count, failed ones replay as a new series with the same idempotency key, and
// the 300-event burst reports the same counts the README prints.

const SPEEDS = [1, 2, 4];
const REAL = { received: 300, deduplicated: 50, delivered: 250, retried: 60, failed: 20, replayed: 20, rejections: 3, p50: 1987.5, p95: 7828.5 };
const STEP_ORDER = ['timestamp', 'window', 'header', 'hmac', 'nonce', 'dedup'] as const;
const STEP_NAMES: Record<(typeof STEP_ORDER)[number], string> = {
  timestamp: 'X-Timestamp is unix seconds',
  window: `|now - timestamp| <= ${BENCH.tolerance} s`,
  header: 'X-Signature starts with sha256=',
  hmac: 'HMAC-SHA256 over "<timestamp>.<body>" matches',
  nonce: 'signature not accepted before',
  dedup: 'ledger ON CONFLICT (source, event_key)',
};
const PHASES = ['first-pass', 'duplicates', 'rejections', 'settling', 'replay', 'resettling', 'done'] as const;
const ease = [0.22, 1, 0.36, 1] as const;

function statusText(status: number, error: string | null, deliveries: number): string {
  if (status === 202) return `202 Accepted, ${deliveries} deliveries enqueued`;
  if (status === 200) return '200 OK, deduplicated: true, no deliveries';
  return `${status} ${error ?? ''}`;
}

export default function LaunchbridgeDemo() {
  useBridgeVersion();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState(1);
  const [tamper, setTamper] = useState<Tamper>({ flipByte: false, wrongSecret: false, stale: false });

  useEffect(() => startClock(speed), [speed]);

  const snap = bridge().snapshot();
  const last = snap.last;
  const failedStep = last?.steps.find((s) => !s.ok)?.id;
  const b = snap.burst;
  const bs = b?.stats;
  const passed = b?.phase === 'done' && b.checks.every((c) => c.ok);
  const act = (fn: () => void) => () => {
    fn();
    touch();
  };
  const toggle = (key: keyof Tamper) => setTamper((t) => ({ ...t, [key]: !t[key] }));

  return (
    <div className="demo lb" data-motion={reduce ? 'reduced' : 'full'} aria-label="launchbridge webhook simulation">
      <span className="demo__tag">Webhook bridge</span>
      <h3 className="demo__title">launchbridge</h3>
      <p className="demo__lede">
        Sign a webhook and watch it pass each verification step, then tamper with it: flip one byte after signing, sign
        with the wrong secret, backdate the timestamp an hour, or replay a captured request. Re-send an event id and the
        ledger deduplicates it. Make the destinations answer 503 to see bounded retries with jittered backoff end in
        failed, replay them once repaired, then push the {BURST.total}-event burst through the same path.
      </p>

      <section className="lb__panel" aria-label="Signed webhook">
        <div className="lb__panel-head">
          POST /webhooks/{BENCH.source}
          <span className="lb__panel-count">secret orders-dev-secret, tolerance {BENCH.tolerance} s, fans out to crm and billing</span>
        </div>
        <div className="lb__bench">
          <div className="lb__compose">
            <span className="lb__label">next payload</span>
            <pre className="lb__code mono">{snap.nextPayload}</pre>
            <div className="lb__checks mono">
              <label>
                <input type="checkbox" checked={tamper.flipByte} onChange={() => toggle('flipByte')} /> flip one byte after signing
              </label>
              <label>
                <input type="checkbox" checked={tamper.wrongSecret} onChange={() => toggle('wrongSecret')} /> sign with the wrong secret
              </label>
              <label>
                <input type="checkbox" checked={tamper.stale} onChange={() => toggle('stale')} /> timestamp {BENCH.staleSeconds} s old
              </label>
            </div>
            <div className="lb__row">
              <button className="demo__btn lb__small" onClick={act(() => bridge().send(tamper))}>
                Sign and send
              </button>
              <button className="demo__btn demo__btn--ghost lb__small" onClick={act(() => bridge().replay())} disabled={!snap.canReplay}>
                Replay last accepted request
              </button>
              <button className="demo__btn demo__btn--ghost lb__small" onClick={act(() => bridge().resend())} disabled={!snap.canReplay}>
                Re-send same event id
              </button>
            </div>
            {last && (
              <dl className="lb__headers mono">
                <dt>X-Timestamp</dt>
                <dd>{last.timestamp}</dd>
                <dt>X-Signature</dt>
                <dd>{last.signature.slice(0, 26)}...</dd>
                {last.expected && last.expected !== last.signature && (
                  <>
                    <dt>expected</dt>
                    <dd className="lb__bad">{last.expected.slice(0, 26)}...</dd>
                  </>
                )}
                <dt>body</dt>
                <dd>{last.body}</dd>
                {last.flipped && (
                  <>
                    <dt>in transit</dt>
                    <dd className="lb__bad">{last.flipped}</dd>
                  </>
                )}
              </dl>
            )}
          </div>
          <div className="lb__verify">
            <span className="lb__label">{last ? last.label : 'verification runs in this order'}</span>
            <ol className="lb__steps mono">
              {STEP_ORDER.map((id, i) => {
                const step = last?.steps.find((s) => s.id === id);
                const state = !step ? 'skipped' : step.ok ? 'ok' : 'fail';
                return (
                  <li key={id} data-state={last ? state : 'idle'}>
                    <span className="lb__step-n">{i + 1}</span>
                    <span className="lb__step-name">{step?.label ?? STEP_NAMES[id]}</span>
                    <span className="lb__step-detail">{step ? step.detail : last ? 'not reached' : ''}</span>
                  </li>
                );
              })}
            </ol>
            {last && (
              <p className="lb__response mono" data-ok={last.status < 300}>
                {statusText(last.status, last.error, last.deliveries)}
                {failedStep ? `, stopped at step ${STEP_ORDER.indexOf(failedStep as (typeof STEP_ORDER)[number]) + 1}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="lb__ledger">
          <div className="lb__counts mono">
            <span>
              accepted <b>{snap.counts.accepted}</b>
            </span>
            <span>
              deduplicated <b>{snap.counts.deduplicated}</b>
            </span>
            {Object.entries(snap.counts.rejected).map(([reason, n]) => (
              <span key={reason}>
                {reason} <b className="lb__bad">{n}</b>
              </span>
            ))}
          </div>
          <ul className="lb__rows mono" aria-label="processed_events ledger">
            {snap.ledger.length === 0 && <li className="lb__empty">processed_events rows appear here: (source, event_key) unique, signature unique.</li>}
            {snap.ledger.map((row) => (
              <li key={row.signature}>
                <span>{BENCH.source}</span>
                <span>{row.key}</span>
                <span className="lb__faint">sig {row.signature}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lb__panel lb__panel--gap" aria-label="Delivery attempts">
        <div className="lb__panel-head">
          Delivery attempts
          <span className="lb__panel-count">
            {DESTINATIONS.map((d) => `${d.name} ${d.retry.maxAttempts} attempts, ${d.retry.baseDelaySeconds} s doubling to ${d.retry.maxDelaySeconds} s`).join('; ')}, jitter 20%
          </span>
        </div>
        <div className="lb__row">
          <label className="lb__toggle mono">
            <input type="checkbox" checked={snap.down} onChange={act(() => bridge().setDown(!bridge().down))} /> destinations answer 503 for new events
          </label>
          <button className="demo__btn demo__btn--ghost lb__small" onClick={act(() => bridge().replayFailed())} disabled={snap.counts.failed === 0}>
            Replay failed deliveries ({snap.counts.failed})
          </button>
        </div>
        <div className="lb__chips" role="group" aria-label="Delivery">
          {snap.choices.length === 0 && <span className="lb__empty">Send an event or run the burst to get deliveries.</span>}
          {snap.choices.map((c) => (
            <button key={c.id} className="lb__chip mono" data-on={snap.timeline?.id === c.id} data-status={c.status} onClick={act(() => bridge().select(c.id))}>
              {c.label} <em>{c.status}</em>
            </button>
          ))}
        </div>
        {snap.timeline && <Timeline t={snap.timeline} />}
      </section>

      <section className="lb__panel lb__panel--gap" aria-label="Burst run">
        <div className="lb__panel-head">
          Burst run
          <span className="lb__panel-count">
            {BURST.total - BURST.duplicates} unique, {BURST.duplicates} re-sends, {BURST.hard} answered 400, {BURST.flaky} answered 503 twice, {BURST.badSignatures} bad signatures
          </span>
        </div>
        <div className="demo__controls lb__controls">
          <button className="demo__btn" onClick={act(() => bridge().startBurst())} disabled={snap.burstRunning}>
            {snap.burstRunning ? 'Running burst' : b?.phase === 'done' ? 'Run burst again' : 'Start burst'}
          </button>
          <button className="demo__btn demo__btn--ghost" onClick={resetBridge}>
            Reset
          </button>
          <div className="lb__speeds" role="group" aria-label="Burst speed">
            {SPEEDS.map((x) => (
              <button key={x} className="lb__speed mono" data-on={speed === x} aria-pressed={speed === x} onClick={() => setSpeed(x)}>
                {x}x
              </button>
            ))}
          </div>
        </div>
        <ol className="lb__phases mono" aria-label="Burst phases">
          {PHASES.map((ph) => {
            const at = b ? PHASES.indexOf(b.phase as (typeof PHASES)[number]) : -1;
            const i = PHASES.indexOf(ph);
            return (
              <li key={ph} data-state={at === -1 ? 'idle' : i < at || b?.phase === 'done' ? 'done' : i === at ? 'now' : 'idle'}>
                {ph}
              </li>
            );
          })}
        </ol>
        <div className="lb__stats">
          <div className="lb__stat lb__stat--hero" data-bad={b?.phase === 'done' && (bs?.deliveries.failed ?? 0) > 0}>
            <span className="lb__stat-label">left failed after replay</span>
            <span className="lb__stat-val">{b?.phase === 'done' ? (bs?.deliveries.failed ?? 0) : '-'}</span>
            <span className="lb__stat-ref">must be 0; measured 0 of {REAL.delivered} deliveries</span>
          </div>
          <Stat label="received / deduplicated" value={bs?.events.received ?? 0} small={bs?.events.deduplicated ?? 0} refText={`measured ${REAL.received} / ${REAL.deduplicated}; ${b?.posted ?? 0} posted`} />
          <Stat label="delivered / retried" value={bs?.deliveries.delivered ?? 0} small={bs?.retries ?? 0} refText={`measured ${REAL.delivered} / ${REAL.retried}`} />
          <Stat label="failed / replayed" value={b?.failedFirstPass ?? bs?.deliveries.failed ?? 0} small={bs?.replays.delivered ?? 0} refText={`measured ${REAL.failed} / ${REAL.replayed}`} />
          <Stat label="signature rejections" value={bs?.signature_rejections ?? 0} refText={b?.rejectionStatuses.length ? `statuses ${b.rejectionStatuses.join(', ')}` : `measured ${REAL.rejections}`} />
          <Stat
            label="dispatch p50 / p95"
            value={bs?.latency_ms.p50 ?? 0}
            small={bs?.latency_ms.p95 ?? 0}
            refText={`virtual ms; measured ${REAL.p50} / ${REAL.p95} ms on the Compose stack`}
          />
        </div>
        {b?.phase === 'done' && <pre className="lb__summary mono">{b.lines.join('\n')}</pre>}
        <AnimatePresence>
          {b?.phase === 'done' && (
            <motion.div
              className="lb__verdict"
              data-pass={passed}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <span className="lb__verdict-head">
                {passed ? `PASS: ${b.checks.length} of ${b.checks.length} checks, 0 left failed` : 'FAIL: a check did not hold'}
              </span>
              <span className="lb__verdict-text">
                {bs?.events.received} events received, {bs?.events.deduplicated} deduplicated, {b.failedFirstPass} deliveries failed on
                the first pass and {bs?.replays.delivered} delivered after the bulk replay. The README run reports {REAL.received} received,{' '}
                {REAL.deduplicated} deduplicated, {REAL.failed} failed then {REAL.replayed} replayed, and 0 still failed.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function Timeline({ t }: { t: TimelineSnap }) {
  const segments: { kind: 'attempt' | 'backoff'; ms: number; label: string; state: string }[] = [];
  for (const a of t.attempts) {
    segments.push({ kind: 'attempt', ms: a.durationMs, label: `${a.status}`, state: a.outcome });
    if (a.backoffMs !== null) segments.push({ kind: 'backoff', ms: a.backoffMs, label: `${a.backoffMs} ms`, state: 'wait' });
  }
  const total = segments.reduce((n, s) => n + s.ms, 0) || 1;
  const lastAttempt = t.attempts[t.attempts.length - 1];
  const verdict =
    t.status === 'delivered'
      ? `delivered after ${t.attempts.length} attempt${t.attempts.length === 1 ? '' : 's'}`
      : t.status === 'failed'
        ? lastAttempt?.outcome === 'permanent'
          ? `failed: ${lastAttempt.status} is not retryable`
          : `failed: retries exhausted after ${t.attempts.length} of ${t.maxAttempts}`
        : t.status === 'replayed'
          ? 'failed, then replayed as a new series'
          : t.nextInMs !== null
            ? `pending, attempt ${t.attempts.length + 1} in ${(t.nextInMs / 1000).toFixed(1)} s`
            : t.status;
  return (
    <div className="lb__timeline">
      <div className="lb__tl-head mono">
        <span>
          {t.destination}, series {t.series}, key {t.key.slice(0, 8)}...:{t.destination}
        </span>
        <b data-status={t.status}>{verdict}</b>
      </div>
      <div className="lb__track" aria-label="Attempts and backoff, to scale">
        {segments.length === 0 && <span className="lb__empty">Claimed on the next worker poll.</span>}
        {segments.map((s, i) => (
          <span key={i} className="lb__seg" data-kind={s.kind} data-state={s.state} style={{ flexGrow: Math.max(s.ms, total * 0.04) }} title={s.label}>
            {s.kind === 'attempt' ? s.label : ''}
          </span>
        ))}
      </div>
      <ol className="lb__attempts mono">
        {t.attempts.map((a) => (
          <li key={a.n} data-outcome={a.outcome}>
            <span className="lb__faint">
              #{a.n} t+{a.offsetMs} ms
            </span>
            <span>
              HTTP {a.status} in {a.durationMs} ms, {a.outcome}
            </span>
            <span className="lb__faint">{a.backoffMs !== null ? `backoff ${a.backoffMs} ms (base ${a.baseMs} ms, jitter within 20%)` : 'no retry scheduled'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Stat({ label, value, small, refText }: { label: string; value: number | string; small?: number; refText: string }) {
  return (
    <div className="lb__stat">
      <span className="lb__stat-label">{label}</span>
      <span className="lb__stat-val">
        {value}
        {small !== undefined && <small>/ {small}</small>}
      </span>
      <span className="lb__stat-ref">{refText}</span>
    </div>
  );
}
