import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './diagkit.css';
import { useStore } from './diagkit/state';
import { bundleFor, setScenario } from './diagkit/store';
import type { ScenarioId, ServiceId } from './diagkit/types';

// In-browser diagkit incident console. The collector, the log-signature
// fingerprinter, and the explainable root-cause ranking all run client-side
// from a seeded PRNG, exactly like the CLI: same seed, same scenario, same
// answer, every time. Run a diagnosis to watch raw log lines collapse into
// signature clusters and the ranked list name the culprit with its reasons.

type Phase = 'idle' | 'streaming' | 'clustering' | 'ranking' | 'done';

const STREAM_TICKS = 26;
const STREAM_MS = 95;
const SIG_MS = 340;
const RANK_MS = 420;
const WINDOW = 7;
const ease = [0.22, 1, 0.36, 1] as const;

const SCENARIOS: { id: ScenarioId; label: string; blurb: string }[] = [
  {
    id: 'payments-outage',
    label: 'payments-outage',
    blurb: 'the acquirer behind payments starts refusing connections',
  },
  {
    id: 'db-slowdown',
    label: 'db-slowdown',
    blurb: 'the database crosses its slow-query threshold under load',
  },
];

export default function DiagkitDemo() {
  const { scenario } = useStore();
  const reduce = useReducedMotion();
  const bundle = bundleFor(scenario);

  const [phase, setPhase] = useState<Phase>('idle');
  const [streamed, setStreamed] = useState(0); // ticks consumed
  const [sigsShown, setSigsShown] = useState(0);
  const [ranksShown, setRanksShown] = useState(0);
  const [openSig, setOpenSig] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  useEffect(() => clearTimers, []);

  function at(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, reduce ? 0 : ms));
  }

  function resetRun() {
    clearTimers();
    setPhase('idle');
    setStreamed(0);
    setSigsShown(0);
    setRanksShown(0);
    setOpenSig(null);
  }

  function pickScenario(id: ScenarioId) {
    setScenario(id);
    resetRun();
  }

  function runDiagnosis() {
    if (phase === 'streaming' || phase === 'clustering' || phase === 'ranking') {
      return;
    }
    resetRun();
    setPhase('streaming');

    let t = 0;
    for (let i = 1; i <= STREAM_TICKS; i++) {
      t += STREAM_MS;
      const tick = i;
      at(t, () => setStreamed(tick));
    }

    t += 260;
    at(t, () => setPhase('clustering'));
    for (let i = 1; i <= bundle.errorSignatures.length; i++) {
      t += SIG_MS;
      const n = i;
      at(t, () => setSigsShown(n));
    }

    t += 300;
    at(t, () => setPhase('ranking'));
    for (let i = 1; i <= bundle.ranking.length; i++) {
      t += RANK_MS;
      const n = i;
      at(t, () => setRanksShown(n));
    }

    t += 200;
    at(t, () => setPhase('done'));
  }

  const busy =
    phase === 'streaming' || phase === 'clustering' || phase === 'ranking';
  const linesSeen = Math.round(
    (streamed / STREAM_TICKS) * bundle.logs.length,
  );

  // The visible slice of the stream: a sliding window over an evenly sampled
  // set of lines, so the tail of the stream is always deterministic.
  const sampleStep = Math.max(1, Math.floor(bundle.logs.length / STREAM_TICKS));
  const sampled = Array.from(
    { length: STREAM_TICKS },
    (_, i) => bundle.logs[Math.min(i * sampleStep, bundle.logs.length - 1)],
  );
  const visible = sampled.slice(Math.max(0, streamed - WINDOW), streamed);

  const showSigs = phase !== 'idle' && phase !== 'streaming';
  const showRanks = phase === 'ranking' || phase === 'done';
  const top = bundle.ranking[0];

  return (
    <div className="demo" aria-label="diagkit incident console">
      <span className="demo__tag">Incident console</span>
      <h3 className="demo__title">diagkit</h3>
      <p className="demo__lede">
        Pick an injected fault and run a diagnosis. The collector streams the
        incident window's logs, the fingerprinter collapses them into recurring
        signature templates, and the analyzer ranks every service with an
        explainable score. Switch the scenario and the culprit changes,
        deterministically.
      </p>

      <div className="dgk__bar">
        <div className="dgk__scenarios" role="tablist" aria-label="Scenario">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={scenario === s.id}
              className={`dgk__scenario ${
                scenario === s.id ? 'dgk__scenario--on' : ''
              }`}
              onClick={() => pickScenario(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="dgk__bar-spacer" />
        <span className="dgk__seed">
          seed <b>{bundle.seed}</b>
        </span>
      </div>

      <p className="dgk__blurb">
        Injected fault: {SCENARIOS.find((s) => s.id === scenario)?.blurb}.
      </p>

      <div className="demo__controls" style={{ marginTop: 0 }}>
        <button className="demo__btn" disabled={busy} onClick={runDiagnosis}>
          {busy ? 'Diagnosing...' : 'Run diagnosis'}
        </button>
        <button
          className="demo__btn demo__btn--ghost"
          disabled={phase === 'idle'}
          onClick={resetRun}
        >
          Reset
        </button>
      </div>

      <p className="dgk__sr" role="status" aria-live="polite">
        {phase === 'done' ? bundle.verdict : ''}
      </p>

      <div className="dgk__grid">
        <section className="dgk__panel" aria-label="Log stream">
          <div className="dgk__panel-head">
            Log stream
            <span className="dgk__panel-count">
              {phase === 'idle' ? bundle.logs.length : linesSeen} /{' '}
              {bundle.logs.length} lines
            </span>
          </div>
          <div className="dgk__stream">
            {phase === 'idle' && (
              <p className="dgk__empty">
                {bundle.logs.length} log lines collected across{' '}
                {bundle.services.length} services for this incident window.
                Run the diagnosis to replay them.
              </p>
            )}
            <AnimatePresence initial={false}>
              {visible.map((line) => (
                <motion.div
                  key={line.id}
                  className={`dgk__line ${
                    line.level === 'error' ? 'dgk__line--err' : ''
                  }`}
                  initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.18 }}
                >
                  <span className={`dgk__svc dgk__svc--${line.service}`}>
                    {line.service}
                  </span>
                  <span className="dgk__line-raw">{line.raw}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        <section className="dgk__panel" aria-label="Signature clusters">
          <div className="dgk__panel-head">
            Error signatures
            <span className="dgk__panel-count">
              {showSigs
                ? `${Math.min(sigsShown, bundle.errorSignatures.length)} templates`
                : 'awaiting run'}
            </span>
          </div>
          <div className="dgk__sigs">
            {!showSigs && (
              <p className="dgk__empty">
                Raw lines normalize into templates here: hex ids become
                &lt;id&gt;, durations become &lt;dur&gt;, numbers become
                &lt;n&gt;. Identical templates cluster with a count.
              </p>
            )}
            {showSigs &&
              bundle.errorSignatures.slice(0, sigsShown).map((sig) => {
                const open = openSig === sig.id;
                const maxCount = bundle.errorSignatures[0].count;
                return (
                  <motion.button
                    key={sig.id}
                    className={`dgk__sig ${open ? 'dgk__sig--open' : ''}`}
                    onClick={() => setOpenSig(open ? null : sig.id)}
                    aria-expanded={open}
                    initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.3, ease }}
                  >
                    <span className="dgk__sig-top">
                      <span className={`dgk__svc dgk__svc--${sig.service}`}>
                        {sig.service}
                      </span>
                      <span className="dgk__sig-template">{sig.template}</span>
                      <span className="dgk__sig-count">x{sig.count}</span>
                    </span>
                    <span className="dgk__sig-meter" aria-hidden="true">
                      <motion.span
                        className="dgk__sig-fill"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.max(4, (sig.count / maxCount) * 100)}%`,
                        }}
                        transition={{ duration: reduce ? 0 : 0.6, ease }}
                      />
                    </span>
                    {open && (
                      <span className="dgk__sig-samples">
                        {sig.samples.map((s, i) => (
                          <span key={i} className="dgk__sig-sample">
                            {s}
                          </span>
                        ))}
                      </span>
                    )}
                  </motion.button>
                );
              })}
          </div>
        </section>
      </div>

      <section className="dgk__panel dgk__panel--rank" aria-label="Root-cause ranking">
        <div className="dgk__panel-head">
          Ranked root causes
          <span className="dgk__panel-count">
            {showRanks ? 'explainable scores' : 'awaiting signatures'}
          </span>
        </div>

        {!showRanks && (
          <p className="dgk__empty">
            The analyzer scores each service from signature density, latency
            spike, error rate, and the share of entry errors tracing through
            it, each normalized against the incident-wide max.
          </p>
        )}

        {showRanks &&
          bundle.ranking.slice(0, ranksShown).map((r, i) => (
            <motion.div
              key={r.service}
              className={`dgk__rank ${i === 0 ? 'dgk__rank--top' : ''}`}
              initial={{ opacity: 0, y: reduce ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.35, ease }}
            >
              <span className="dgk__rank-idx">{i + 1}</span>
              <span className={`dgk__svc dgk__svc--${r.service as ServiceId}`}>
                {r.service}
              </span>
              <span className="dgk__rank-score">
                score {r.score.toFixed(3)}
              </span>
              <span className="dgk__rank-meter" aria-hidden="true">
                <motion.span
                  className="dgk__rank-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(3, r.score * 100)}%` }}
                  transition={{ duration: reduce ? 0 : 0.6, ease }}
                />
              </span>
              <span className="dgk__rank-factors">
                {r.factors.map((f) => (
                  <span key={f.key} className="dgk__factor">
                    <b>{f.label}</b> {f.detail}
                  </span>
                ))}
              </span>
            </motion.div>
          ))}

        <AnimatePresence>
          {phase === 'done' && (
            <motion.div
              className="dgk__verdict"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <span className="dgk__verdict-head">
                Likely root cause: {top.service}
              </span>
              <span className="dgk__verdict-text">
                {top.factors
                  .map((f) => f.detail)
                  .join('; ')}
                . Same seed, same scenario, same answer.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
