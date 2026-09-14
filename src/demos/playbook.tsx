import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './playbook.css';
import { finish, promote, reset, start, startClock, store, useLoopVersion } from './playbook/state';
import { pct, type RunOutcome } from './playbook/arc';
import type { RunTrace } from './playbook/types';

// In-browser playbook: the support triage SOP and its recorded walkthrough
// are ingested into a cited procedure and rendered as prompt v1. A bounded
// tool-calling loop runs 16 scenarios against stand-ins for Jira, Slack and
// a knowledge base, driven by the offline stand-in for the model API, which
// only follows rules it can parse. Each run is graded against the expert
// rubric, failed criteria become corrections under their SOP step, and the
// next version runs the set again. The promotion gate refuses a version
// while a forbidden action remains. The seed fixes ids and latencies, so the
// arc is always 12.5% to 87.5% to 100% with 12 corrections.

const SPEEDS = [1, 2, 4];
const REAL = { rates: '12.5% > 87.5% > 100.0%', corrections: 12, forbidden: '2 > 2 > 0' };
const ease = [0.22, 1, 0.36, 1] as const;

type Kind = 'prompt' | 'intake' | 'model' | 'tool' | 'final';
interface Entry {
  kind: Kind;
  label: string;
  meta: string;
  body: string;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

function entriesFor(trace: RunTrace): Entry[] {
  const out: Entry[] = [
    { kind: 'prompt', label: 'system prompt', meta: `v${trace.promptVersion}`, body: trace.systemPrompt },
    { kind: 'intake', label: 'intake', meta: 'first user turn', body: trace.userMessage },
  ];
  for (const turn of trace.turns) {
    out.push({ kind: 'model', label: `turn ${turn.turn}`, meta: `stop_reason=${turn.stopReason ?? 'none'} in=${turn.inputTokens} out=${turn.outputTokens}`, body: turn.text || '(no text)' });
    for (const call of trace.toolCalls.filter((c) => c.turn === turn.turn)) {
      out.push({ kind: 'tool', label: call.name, meta: `${call.durationMs} ms`, body: `arguments\n${pretty(call.args)}\n\nresult\n${pretty(call.error ? { error: call.error } : call.result)}` });
    }
  }
  out.push({ kind: 'final', label: 'final', meta: `status=${trace.status} run=${trace.runId}`, body: trace.finalText });
  return out;
}

export default function PlaybookDemo() {
  useLoopVersion();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState(1);
  const [sel, setSel] = useState({ scenarioId: 'triage-01', version: 1 });
  const [step, setStep] = useState(0);

  useEffect(() => startClock(speed), [speed]);

  const { loop, running, decisions } = store;
  const rounds = loop.rounds;
  const inProgress = !loop.done ? { version: loop.spec.version, outcomes: loop.outcomes } : null;
  const columns = [...rounds.map((r) => ({ version: r.spec.version, outcomes: r.outcomes })), ...(inProgress ? [inProgress] : [])];
  const find = (v: number, id: string): RunOutcome | undefined => columns.find((c) => c.version === v)?.outcomes.find((o) => o.trace.scenarioId === id);
  const graded = columns.reduce((n, c) => n + c.outcomes.length, 0);
  const toolCalls = columns.reduce((n, c) => n + c.outcomes.reduce((t, o) => t + o.trace.toolCalls.length, 0), 0);
  const corrections = rounds.flatMap((r) => r.corrections);
  const outcome = find(sel.version, sel.scenarioId);
  const entries = outcome ? entriesFor(outcome.trace) : [];
  const index = Math.min(step, Math.max(0, entries.length - 1));
  const entry = entries[index];
  const progress = loop.done ? 1 : Math.min(1, graded / 48);
  const last = rounds[rounds.length - 1];
  const status = running
    ? `prompt v${loop.spec.version} running, ${loop.outcomes.length} of ${loop.scenarios.length} scenarios graded`
    : loop.done
      ? `loop stopped after v${rounds.length}: ${loop.stopReason}`
      : 'ready';

  const choose = (scenarioId: string, v: number) => {
    setSel({ scenarioId, version: v });
    setStep(0);
  };

  return (
    <div className="demo" aria-label="playbook evaluation loop simulation">
      <span className="demo__tag">Agent evaluation</span>
      <h3 className="demo__title">playbook</h3>
      <p className="demo__lede">
        An expert SOP and walkthrough become prompt v1. Each of 16 support requests runs through a bounded tool-calling
        loop against Jira, Slack and knowledge-base stand-ins, and every run is scored against the expert rubric. Failed
        criteria are rewritten as explicit rules under the SOP step they belong to, the next version runs the whole set
        again, and the gate refuses to promote a version that still posts customer contact details to Slack.
      </p>

      <section className="pl__panel" aria-label="Feedback loop">
        <div className="pl__panel-head">
          Feedback loop
          <span className="pl__panel-count mono">
            {graded} graded runs, {toolCalls} tool calls, seed 0x{loop.seed.toString(16)}
          </span>
        </div>
        <div className="demo__controls pl__controls">
          <button className="demo__btn" onClick={() => (reduce ? (start(), finish()) : start())} disabled={running}>
            {running ? 'Running…' : loop.done ? 'Run again' : 'Run the loop'}
          </button>
          <button className="demo__btn demo__btn--ghost" onClick={() => { reset(); choose('triage-01', 1); }}>
            Reset
          </button>
          <div className="pl__speeds" role="group" aria-label="Simulation speed">
            {SPEEDS.map((s) => (
              <button key={s} className={`pl__speed${speed === s ? ' pl__speed--on' : ''}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s}x
              </button>
            ))}
          </div>
        </div>
        <p className="pl__status mono" aria-live="polite">{status}</p>
        <div className="pl__progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="pl__stats">
          <div className="pl__stat" data-hero="true">
            <span className="pl__stat-label">pass rate by version</span>
            <span className="pl__stat-val">{rounds.length ? rounds.map((r) => pct(r.report.passRate)).join(' > ') : 'not run'}</span>
            <span className="pl__stat-ref">measured {REAL.rates}</span>
          </div>
          <div className="pl__stat">
            <span className="pl__stat-label">forbidden actions</span>
            <span className="pl__stat-val">{rounds.length ? rounds.map((r) => r.report.forbiddenViolations).join(' > ') : '-'}</span>
            <span className="pl__stat-ref">measured {REAL.forbidden}</span>
          </div>
          <div className="pl__stat">
            <span className="pl__stat-label">corrections</span>
            <span className="pl__stat-val">{corrections.length}</span>
            <span className="pl__stat-ref">measured {REAL.corrections}</span>
          </div>
          <div className="pl__stat">
            <span className="pl__stat-label">mean score</span>
            <span className="pl__stat-val">{rounds.length ? rounds.map((r) => pct(r.report.meanScore)).join(' > ') : '-'}</span>
            <span className="pl__stat-ref">rubric threshold 0.95</span>
          </div>
        </div>
        <AnimatePresence>
          {loop.done && last && (
            <motion.div
              className="pl__verdict"
              data-pass={last.report.passRate >= 1 && last.report.forbiddenViolations === 0}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <span className="pl__verdict-head">
                v{last.spec.version}: {last.report.passed} of {last.report.scenarios} scenarios pass with {last.report.forbiddenViolations} forbidden actions
              </span>
              <span className="pl__verdict-text">
                {rounds.length - 1} correction rounds added {corrections.length} rules. v1 leaked customer emails into Slack and v2 still
                leaked phone numbers, so the gate below refuses both; v3 is the first version it promotes.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="pl__grid2">
        <section className="pl__panel" aria-label="Evaluation grid">
          <div className="pl__panel-head">
            Evaluation grid
            <span className="pl__panel-count">a cell opens its transcript</span>
          </div>
          <div className="pl__table-wrap">
            <table className="pl__table mono">
              <thead>
                <tr>
                  <th scope="col">scenario</th>
                  {columns.map((c) => {
                    const r = rounds.find((x) => x.spec.version === c.version);
                    return (
                      <th scope="col" key={c.version}>
                        v{c.version}
                        <small>{r ? pct(r.report.passRate) : `${c.outcomes.length}/16`}</small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loop.scenarios.map((sc) => (
                  <tr key={sc.id}>
                    <th scope="row">
                      {sc.id}
                      <small>{sc.tags.slice(0, 2).join(' ')}</small>
                    </th>
                    {columns.map((c) => {
                      const o = find(c.version, sc.id);
                      const r = rounds.find((x) => x.spec.version === c.version);
                      const fresh = r?.comparison?.newlyPassing.includes(sc.id) ?? false;
                      const state = o ? (o.grade.passed ? 'pass' : 'fail') : 'pending';
                      return (
                        <td key={c.version}>
                          <button
                            className={`pl__cell pl__cell--${state}${fresh ? ' pl__cell--fresh' : ''}${sel.scenarioId === sc.id && sel.version === c.version ? ' pl__cell--sel' : ''}`}
                            disabled={!o}
                            onClick={() => choose(sc.id, c.version)}
                            aria-label={`${sc.id} v${c.version} ${state}`}
                          >
                            {o ? state : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pl__panel" aria-label="Transcript">
          <div className="pl__panel-head">
            Transcript
            <span className="pl__panel-count">
              {sel.scenarioId} v{sel.version}
              {outcome ? `, ${(outcome.grade.score * 100).toFixed(1)}%, ${outcome.grade.passed ? 'pass' : 'fail'}` : ''}
            </span>
          </div>
          {outcome && entry ? (
            <>
              <div className="pl__chips">
                {entries.map((e, i) => (
                  <button key={i} className={`pl__chip pl__chip--${e.kind}${i === index ? ' pl__chip--on' : ''}`} onClick={() => setStep(i)} aria-pressed={i === index}>
                    {e.label}
                  </button>
                ))}
              </div>
              <div className="pl__entry mono">
                <b>{entry.label}</b> {entry.meta}
              </div>
              <pre className="pl__pre mono">{entry.body}</pre>
              <div className="demo__controls pl__controls">
                <button className="demo__btn demo__btn--ghost pl__small" onClick={() => setStep(Math.max(0, index - 1))} disabled={index === 0}>
                  Previous
                </button>
                <button className="demo__btn demo__btn--ghost pl__small" onClick={() => setStep(Math.min(entries.length - 1, index + 1))} disabled={index >= entries.length - 1}>
                  Next
                </button>
                <span className="demo__hint">{index + 1} / {entries.length}</span>
              </div>
              <ul className="pl__criteria mono">
                {outcome.grade.results.filter((r) => !r.passed).map((r) => (
                  <li key={r.id} className={r.forbidden ? 'pl__criteria--forbidden' : ''}>
                    <b>{r.id}</b>{r.forbidden ? ' forbidden' : ''}: {r.rationale}
                  </li>
                ))}
                {outcome.grade.results.every((r) => r.passed) && <li className="pl__criteria--ok">all {outcome.grade.results.length} criteria passed</li>}
              </ul>
            </>
          ) : (
            <p className="pl__empty">Start the loop; the transcript of {sel.scenarioId} under v{sel.version} shows once it is graded.</p>
          )}
        </section>
      </div>

      <div className="pl__grid2">
        <section className="pl__panel" aria-label="Corrections">
          <div className="pl__panel-head">
            Corrections
            <span className="pl__panel-count">{corrections.length} appended across {Math.max(0, rounds.length - 1)} rounds</span>
          </div>
          {rounds.filter((r) => r.corrections.length).map((r) => (
            <div key={r.spec.version} className="pl__round">
              <div className="pl__round-head mono">
                v{r.spec.version - 1} to v{r.spec.version}: {r.comparison?.newlyPassing.length ?? 0} newly passing, pass rate {pct(r.report.passRate)}
              </div>
              <ul className="pl__corrections">
                {r.corrections.map((c) => (
                  <li key={`${c.stepId}-${c.text}`}>
                    <span className="mono pl__step">{c.stepId}</span> {c.text}
                    <small className="mono">{c.criterion}: {c.evidence}</small>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!rounds.some((r) => r.corrections.length) && <p className="pl__empty">Corrections derived from v1 failures appear when v1 finishes grading.</p>}
        </section>

        <section className="pl__panel" aria-label="Promotion gate">
          <div className="pl__panel-head">
            Promotion gate
            <span className="pl__panel-count">blocked while a forbidden action remains</span>
          </div>
          <div className="demo__controls pl__controls pl__controls--top">
            {[1, 2, 3].map((v) => (
              <button key={v} className="demo__btn demo__btn--ghost pl__small" disabled={!loop.done || !rounds.some((r) => r.spec.version === v)} onClick={() => promote(v)}>
                Promote v{v}
              </button>
            ))}
          </div>
          {decisions.map((d) => (
            <pre key={d.seq} className={`pl__decision mono${d.promoted ? ' pl__decision--ok' : ''}`}>
              {d.text}
            </pre>
          ))}
          {decisions.length === 0 && <p className="pl__empty">Once the loop stops, each version can be put to the gate.</p>}
        </section>
      </div>
    </div>
  );
}
