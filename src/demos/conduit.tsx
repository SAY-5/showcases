import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './conduit.css';
import { beat, resetRun, startClock, startRun, store, touch, useRunVersion } from './conduit/state';
import { CONNECTORS, PLAN_TOTALS, RUN_ID, UNIQUE_PER_CONNECTOR } from './conduit/engine';
import { NEW_CONNECTOR_NAME, NEW_CONNECTOR_YAML } from './conduit/specs';
import type { BreakerState } from './conduit/throttle';

// In-browser conduit: a port of the connector worker on virtual clocks. Tasks
// land on one SQS-style work queue per connector with a sha256 idempotency
// key; the worker checks the source schema and mapping rules (misfits go to
// quarantine), claims the key with a conditional put, takes a token from the
// connector's bucket and delivers with full-jitter retries. Failed deliveries
// are never acknowledged, so the queue redrives them into the DLQ after
// maxReceiveCount receives, and target failures trip a breaker that stops
// polling. make demo reproduces the README run: 300 submitted, 60
// deduplicated, 60 retried, 10 dead-lettered and replayed to 0, and a fourth
// connector YAML that plans 8 resources.

const SPEEDS = [1, 2, 4];
const STATES: BreakerState[] = ['closed', 'open', 'half_open'];
const ease = [0.22, 1, 0.36, 1] as const;

export default function ConduitDemo() {
  useRunVersion();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState(1);

  useEffect(() => startClock(speed), [speed]);

  const { run } = store;
  const c = run.connectors;
  const jira = c['jira-support'];
  const webhook = c['webhook-crm'];
  const sum = run.summary;
  const busy = run.busy;
  const queued = CONNECTORS.reduce((n, name) => n + c[name].queue.messages.length, 0);
  const bucketTokens = jira.worker.bucket.level();
  const breaker = webhook.worker.breaker;
  const outage = webhook.target.faults.outage;
  const note = jira.quarantine.messages[jira.quarantine.messages.length - 1]?.envelope.quarantine ?? null;
  const progress = run.phase === 'done' ? 1 : run.phase === 'idle' ? 0 : Math.min(0.95, 1 - queued / Math.max(1, run.submitted));
  const recent = run.log.slice(-7).reverse();

  const act = (fn: () => void) => () => {
    fn();
    if (reduce) {
      let guard = 0;
      while (store.run.busy && guard++ < 2000) beat();
    }
    touch();
  };

  const summaryText = sum
    ? [
        `tasks submitted        ${sum.submitted}  (${sum.unique} unique + ${sum.duplicates} duplicate resubmits)`,
        `deduplicated           ${sum.deduplicated}  (must equal duplicates: ${sum.deduplicated === sum.duplicates ? 'ok' : 'MISMATCH'})`,
        'delivered per connector',
        ...Object.entries(sum.delivered).map(([n, v]) => `  ${n.padEnd(15)}${String(v).padStart(3)} delivered, ${c[n as keyof typeof c].worker.stats.deduplicated} deduplicated`),
        `retried                ${sum.retried}  (jira fake returned 429 ${sum.rejected429} times for ${sum.rateLimitedTasks} tasks)`,
        `dead-lettered          ${sum.deadLettered}  (conduit-webhook-crm-dlq after maxReceiveCount=2)`,
        `DLQ replay             ${sum.replayed} replayed after clearing the fault; DLQ now ${sum.dlqAfterReplay}; webhook delivered ${sum.webhookAfter}/${UNIQUE_PER_CONNECTOR}`,
        `new integration        ${sum.planSummary}`,
        `terraform stack        ${sum.planBase} resources for the shipped connectors, ${sum.planAfter} with ${NEW_CONNECTOR_NAME}`,
      ].join('\n')
    : '';

  return (
    <div className="demo" aria-label="conduit connector kit simulation">
      <span className="demo__tag">Connector kit</span>
      <h3 className="demo__title">conduit</h3>
      <p className="demo__lede">
        make demo submits 300 tasks to Jira, Slack and a signed webhook with faults on: 429 twice for 30 Jira tasks and a
        hard 400 for 10 webhook tasks. Resubmits are acknowledged as duplicates on their idempotency key, the 429s back off
        and deliver, the 400s redrive into the dead-letter queue, and replay drains it after the fault is cleared. The labs
        below trip the webhook breaker with an outage and send a payload the schema quarantines.
      </p>

      <section className="cn__panel" aria-label="make demo">
        <div className="cn__panel-head">
          make demo
          <span className="cn__panel-count mono">
            run {RUN_ID}, t+{run.wall.toFixed(1)} s, {run.submitted} submitted, {queued} on the work queues
          </span>
        </div>
        <div className="demo__controls cn__controls">
          <button className="demo__btn" onClick={act(startRun)} disabled={busy}>
            {busy ? 'Running…' : run.phase === 'done' ? 'Run again' : 'Start make demo run'}
          </button>
          <button className="demo__btn demo__btn--ghost" onClick={act(resetRun)}>
            Reset
          </button>
          <div className="cn__speeds" role="group" aria-label="Simulation speed">
            {SPEEDS.map((s) => (
              <button key={s} className={`cn__speed${speed === s ? ' cn__speed--on' : ''}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="cn__progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="cn__connectors">
          {CONNECTORS.map((name) => {
            const k = c[name];
            const depth = k.queue.depth();
            const st = k.worker.stats;
            return (
              <div key={name} className={`cn__conn${depth.visible + depth.inFlight > 0 ? ' cn__conn--busy' : ''}`}>
                <div className="cn__conn-head">
                  <span className="cn__conn-name mono">{name}</span>
                  <span className="cn__conn-type mono">{k.spec.type}</span>
                </div>
                <div className="cn__conn-meta mono">
                  {k.spec.rateLimit.requestsPerSecond}/s burst {k.spec.rateLimit.burst}, redrive after {k.spec.queue.maxReceiveCount}
                </div>
                <div className="cn__dots" aria-label={`${depth.visible} queued, ${depth.inFlight} in flight`}>
                  {Array.from({ length: Math.min(40, depth.visible + depth.inFlight) }, (_, i) => (
                    <span key={i} className={i < depth.inFlight ? 'cn__dot cn__dot--flight' : 'cn__dot'} />
                  ))}
                </div>
                <div className="cn__meter" aria-label={`${k.target.inbox.length} delivered`}>
                  <span style={{ width: `${(Math.min(UNIQUE_PER_CONNECTOR, k.target.inbox.length) / UNIQUE_PER_CONNECTOR) * 100}%` }} />
                  <em className="mono">{k.target.inbox.length} / {UNIQUE_PER_CONNECTOR} delivered</em>
                </div>
                <dl className="cn__nums mono">
                  <div><dt>queued</dt><dd>{depth.visible + depth.inFlight}</dd></div>
                  <div><dt>dedup</dt><dd>{st.deduplicated}</dd></div>
                  <div><dt>retried</dt><dd className={st.retried ? 'cn__warn' : ''}>{st.retried}</dd></div>
                  <div><dt>paced</dt><dd>{st.rateLimitWaits}</dd></div>
                  <div><dt>dlq</dt><dd className={k.dlq.messages.length ? 'cn__bad' : ''}>{k.dlq.messages.length}</dd></div>
                  <div><dt>quar</dt><dd>{k.quarantine.messages.length}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
        <ul className="cn__log mono" aria-label="Worker log">
          {recent.map((e) => (
            <li key={e.seq} className={`cn__log--${e.kind}`}>
              <span className="cn__at">t+{e.t.toFixed(1)}</span>
              <span>{e.connector}</span>
              <span className="cn__event">{e.event}</span>
              <span className="cn__detail">{[e.taskId, e.detail].filter(Boolean).join(' ')}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="cn__empty">Start the run; worker log lines stream here.</li>}
        </ul>
      </section>

      <div className="cn__grid">
        <section className="cn__panel" aria-label="Token bucket">
          <div className="cn__panel-head">
            Token bucket, jira-support
            <span className="cn__panel-count">{jira.worker.bucket.rate}/s, burst {jira.worker.bucket.capacity}</span>
          </div>
          <div className="cn__bucket" aria-label="bucket level">
            <span className="cn__bucket-fill" style={{ width: `${Math.max(0, Math.min(1, bucketTokens / jira.worker.bucket.capacity)) * 100}%` }} />
            <span className="cn__bucket-lab mono">
              {bucketTokens >= 0 ? `${bucketTokens.toFixed(1)} / ${jira.worker.bucket.capacity} tokens` : `${(-bucketTokens).toFixed(1)} tokens reserved ahead`}
            </span>
          </div>
          <dl className="cn__kv">
            <dt>acquire</dt>
            <dd>reserve a token, sleep (1 - tokens) / {jira.worker.bucket.rate} s when short</dd>
            <dt>paced sends</dt>
            <dd>{jira.worker.stats.rateLimitWaits} on jira, {CONNECTORS.reduce((n, name) => n + c[name].worker.stats.rateLimitWaits, 0)} across connectors</dd>
            <dt>429 responses</dt>
            <dd className={jira.target.rejected ? 'cn__warn' : ''}>{jira.target.rejected}, Retry-After honoured {jira.worker.stats.retryAfterHonored} times</dd>
          </dl>
        </section>

        <section className="cn__panel" aria-label="Breaker and dead-letter queue">
          <div className="cn__panel-head">
            Breaker and DLQ, webhook-crm
            <span className="cn__panel-count">{breaker.failureThreshold} failures, {breaker.recoverySeconds} s, one probe</span>
          </div>
          <div className="cn__machine">
            {STATES.map((s) => (
              <div key={s} className={`cn__state${breaker.state === s ? ` cn__state--on cn__state--${s}` : ''}`}>
                <span className="mono">{s.replace('_', '-')}</span>
                <small>{s === 'open' && breaker.state === 'open' ? `probe in ${breaker.remaining().toFixed(1)} s` : s === 'closed' ? `${breaker.failures} in a row` : 'one probe'}</small>
              </div>
            ))}
          </div>
          <dl className="cn__kv">
            <dt>opens</dt>
            <dd>{webhook.worker.stats.breakerOpens}, polling paused {webhook.worker.stats.breakerPausedSeconds.toFixed(1)} s</dd>
            <dt>dead letters</dt>
            <dd className={webhook.dlq.messages.length ? 'cn__bad' : ''}>{webhook.dlq.messages.length === 0 ? 'none' : webhook.dlq.messages.slice(0, 6).map((m) => m.envelope.task.id.replace(`${RUN_ID}-webhook-crm-`, '')).join(', ') + (webhook.dlq.messages.length > 6 ? ` +${webhook.dlq.messages.length - 6}` : '')}</dd>
          </dl>
          <div className="demo__controls cn__controls cn__controls--gap">
            <button className="demo__btn demo__btn--ghost cn__small" onClick={act(() => store.run.setOutage(true))} disabled={busy || outage}>
              Start 503 outage
            </button>
            <button className="demo__btn demo__btn--ghost cn__small" onClick={act(() => store.run.setOutage(false))} disabled={busy || !outage}>
              Clear outage
            </button>
            <button className="demo__btn demo__btn--ghost cn__small" onClick={act(() => { store.run.replay('webhook-crm'); })} disabled={busy || webhook.dlq.messages.length === 0}>
              Replay DLQ
            </button>
          </div>
          <p className="cn__empty">
            Three consecutive 503s open the breaker and the worker stops polling for 15 s, then admits one probe. Probes and batch
            receives still count toward maxReceiveCount 2, so a long outage fills the DLQ; replay once the fault is gone drains it.
          </p>
        </section>

        <section className="cn__panel" aria-label="Quarantine">
          <div className="cn__panel-head">
            Quarantine, jira-support
            <span className="cn__panel-count">schema v2, then mapping rules</span>
          </div>
          <div className="demo__controls cn__controls">
            <button className="demo__btn demo__btn--ghost cn__small" onClick={act(() => store.run.sendMalformed())} disabled={busy}>
              Send malformed payload
            </button>
            <span className="demo__hint">
              quarantine {jira.quarantine.messages.length}, dlq {jira.dlq.messages.length}
            </span>
          </div>
          <pre className="cn__pre mono">
            {note ? JSON.stringify({ task_id: 'T-91', ...note }, null, 2) : 'T-91 sends priority "critical"; the v2 schema only lists low, normal, high and urgent.'}
          </pre>
          <p className="cn__empty">
            A payload that can never be delivered goes to conduit-jira-support-quarantine with the stage, field and reason. It is
            not retried and never counts toward the dead-letter queue.
          </p>
        </section>

        <section className="cn__panel" aria-label="Terraform plan">
          <div className="cn__panel-head">
            One YAML, one plan
            <span className="cn__panel-count">connectors/{NEW_CONNECTOR_NAME}.yaml</span>
          </div>
          <pre className="cn__pre mono">{NEW_CONNECTOR_YAML.trimEnd()}</pre>
          <p className="cn__plan-sum mono">{run.planDiff.summary}</p>
          <ul className="cn__plan mono">
            {run.planDiff.add.map((r) => (
              <li key={r.address} className={r.address.endsWith('quarantine') ? 'cn__plan--new' : ''}>
                + {r.address.replace(`module.connector["${NEW_CONNECTOR_NAME}"].`, '')}
              </li>
            ))}
          </ul>
          <p className="cn__empty">
            {PLAN_TOTALS.base} resources for the three shipped connectors (the shared table, 7 per connector, one SSM parameter per
            secret); this file adds its 8 for a stack of {PLAN_TOTALS.after}.
          </p>
        </section>
      </div>

      <AnimatePresence>
        {sum && (
          <motion.section
            className="cn__panel cn__panel--summary"
            aria-label="Demo summary"
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease }}
          >
            <div className="cn__panel-head">
              Demo summary
              <span className="cn__panel-count">read back from the queues, inboxes and worker stats</span>
            </div>
            <pre className="cn__pre cn__pre--summary mono">{summaryText}</pre>
            <p className="cn__verdict" data-pass={sum.ok}>
              {sum.ok ? 'PASS: deduplicated equals resubmits, dead letters equal hard failures, replay drained the DLQ to 0' : `FAIL: ${sum.problems.join('; ')}`}
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
