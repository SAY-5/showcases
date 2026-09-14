import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './expertloop.css';
import { README_FIGURES, type LogLine, type ReceiptView, type Reviewer } from './expertloop/lab';
import { resetStore, startPlayback, store, touch, useStoreVersion } from './expertloop/state';

// In-browser expertloop: a port of the note compiler, source registry, review
// workflow and publish path. Every compiled step cites the note lines it came
// from; re-hashing a cited source opens drift flags on exactly the citing
// steps and the publish gate refuses until they are re-verified. A review
// policy refuses approval by the version author and holds for a required
// role, publishing delivers signed webhook and Jira receipts, and the demo
// script replays to the summary block quoted in the README.

const TRACK = ['draft', 'in_review', 'approved'] as const;
const REVIEWERS: Reviewer[] = ['dana', 'ravi', 'mei', 'ops'];
const ease = [0.22, 1, 0.36, 1] as const;

function Log({ lines, empty }: { lines: LogLine[]; empty: string }) {
  return (
    <ul className="el__log" aria-live="polite">
      {lines.length === 0 ? (
        <li className="el__empty">{empty}</li>
      ) : (
        lines.map((l) => (
          <li key={l.id} data-kind={l.kind}>
            {l.text}
          </li>
        ))
      )}
    </ul>
  );
}

function Receipts({ rows }: { rows: ReceiptView[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="el__receipts" aria-label="Delivery receipts">
      {rows.map((r) => (
        <li key={r.id}>
          <b>{r.target}</b>
          <span>
            set {r.setId} {r.action} v{r.version}: {r.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'on' }) {
  return (
    <div className="el__stat" data-tone={tone}>
      <span className="el__stat-label">{label}</span>
      <span className="el__stat-val">{value}</span>
      {sub && <span className="el__stat-sub">{sub}</span>}
    </div>
  );
}

export default function ExpertloopDemo() {
  useStoreVersion();
  const reduce = useReducedMotion();
  const [noteIdx, setNoteIdx] = useState(1);
  const [stepId, setStepId] = useState('s6');
  const [playing, setPlaying] = useState(false);

  const snap = store.lab.snapshot();
  const sc = snap.script;
  const running = playing && !sc.done;

  useEffect(() => (running ? startPlayback() : undefined), [running]);

  const act = (fn: () => void) => () => {
    fn();
    touch();
  };

  const note = snap.notes[noteIdx];
  const step = note.steps.find((s) => s.id === stepId) ?? note.steps[0];
  const cited = new Set<number>();
  for (const s of note.steps) for (let n = s.lineStart; n <= s.lineEnd; n++) cited.add(n);
  const totals = snap.notes.reduce(
    (t, n) => ({ steps: t.steps + n.coverage.steps, cited: t.cited + n.coverage.cited_steps, citations: t.citations + n.coverage.citations }),
    { steps: 0, cited: 0, citations: 0 },
  );
  const d = snap.drift;
  const gate = d.stale.length > 0 ? 'blocked' : d.state === 'published' ? 'open' : 'clear';
  const p = snap.policy;
  const trackAt = TRACK.indexOf(p.state as (typeof TRACK)[number]);
  const live = sc.live;
  const matchTone = (actual: number | undefined, expected: number) => (sc.done && actual === expected ? 'on' : undefined);

  return (
    <div className="demo" aria-label="expertloop instruction set simulation">
      <span className="demo__tag">Notes to agent instructions</span>
      <h3 className="demo__title">expertloop</h3>
      <p className="demo__lede">
        An expert note compiles into instruction steps, and each step cites the note lines that produced it.
        When a cited source is rewritten, only the steps that cite it turn stale and publishing is refused
        until an expert re-verifies them. A review policy refuses approval by the version author and holds the
        set until an admin approves; the replayed demo script lands on the README summary of{' '}
        {README_FIGURES.steps} steps, {README_FIGURES.citations} citations at {README_FIGURES.coverage} percent,{' '}
        {README_FIGURES.blocked} blocked publish, {README_FIGURES.deliveries} deliveries and {README_FIGURES.rollbacks} rollback.
      </p>

      <section className="el__panel" aria-label="Compile notes into cited steps">
        <div className="el__panel-head">
          Compile, note lines to cited steps
          <span className="el__panel-count">
            {totals.steps} steps, {totals.citations} citations as ingested, {totals.cited}/{totals.steps} steps cited
          </span>
        </div>
        <div className="el__tabs" role="group" aria-label="Note">
          {snap.notes.map((n, i) => (
            <button
              key={n.key}
              className="el__tab"
              aria-pressed={i === noteIdx}
              onClick={() => {
                setNoteIdx(i);
                setStepId('s1');
              }}
            >
              {n.file}
            </button>
          ))}
        </div>
        <div className="el__compile">
          <div>
            <span className="el__file">
              {note.file}, {note.lines.length} lines, {step.id} cites L{step.lineStart}
              {step.lineEnd !== step.lineStart ? `-${step.lineEnd}` : ''}
            </span>
            <ol className="el__note" aria-label={`${note.file} source lines`}>
              {note.lines.map((text, i) => {
                const no = i + 1;
                return (
                  <li key={no} className="el__line" data-on={no >= step.lineStart && no <= step.lineEnd} data-cited={cited.has(no)}>
                    <span className="el__line-no">{no}</span>
                    <span className="el__line-text">{text}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div>
            <span className="el__file">
              {note.coverage.steps} steps, {note.coverage.citations} citations, {Math.round(note.coverage.coverage * 100)}% cited
            </span>
            <ul className="el__steps">
              {note.steps.map((s) => (
                <li key={s.id}>
                  <button className="el__step" aria-pressed={s.id === step.id} onClick={() => setStepId(s.id)}>
                    <span className="el__step-id">{s.id}</span>
                    <span className="el__step-action">
                      {s.condition ? `only if ${s.condition}: ` : ''}
                      {s.action}
                    </span>
                    <span className="el__step-cites">
                      <span className="el__chip el__chip--on">
                        L{s.lineStart}
                        {s.lineEnd !== s.lineStart ? `-${s.lineEnd}` : ''}
                      </span>
                      {s.refs.map((r) => (
                        <span key={r} className="el__chip">
                          {r}
                        </span>
                      ))}
                      {s.tool && <span className="el__chip">tool {s.tool}</span>}
                      {s.rules > 0 && <span className="el__chip">{s.rules} rule</span>}
                      {s.halts && <span className="el__chip el__chip--bad">halts</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="el__stage" style={{ marginTop: 14 }}>
        <section className="el__panel" aria-label="Source drift">
          <div className="el__panel-head">
            Source drift, set {d.setId}
            <span className="el__panel-count">
              v{d.version}, {d.state.replace('_', ' ')}
              {d.live !== null ? `, live v${d.live}` : ''}
            </span>
          </div>
          <div className="el__doc" data-changed={d.rewritten}>
            <div className="el__doc-ref">doc:{d.ref}</div>
            <p className="el__doc-text">{d.content}</p>
            <div className="el__doc-hash">sha256:{d.hash.slice(0, 32)}</div>
          </div>
          <div className="el__table-wrap">
            <table className="el__table">
              <thead>
                <tr>
                  <th>step</th>
                  <th>source</th>
                  <th>cited</th>
                  <th>registry</th>
                  <th>state</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={`${r.stepId}-${r.source}`} data-stale={r.stale}>
                    <td>{r.stepId}</td>
                    <td>{r.source}</td>
                    <td>{r.cited.slice(0, 10)}</td>
                    <td>{r.current.slice(0, 10)}</td>
                    <td>{r.stale ? 'stale' : 'verified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="el__gate" data-state={gate} aria-live="polite">
            {gate === 'blocked'
              ? `publish blocked: ${d.stale.join(', ')} cites a changed source, ${d.blocked} refused attempt${d.blocked === 1 ? '' : 's'} audited`
              : gate === 'open'
                ? `published: live v${d.live}, delivered to the signed webhook and Jira`
                : `approved with a green run on v${d.version}; no open drift flag`}
          </div>
          <div className="el__row">
            <button className="demo__btn el__small" onClick={act(() => store.lab.rewriteSource())} disabled={d.rewritten}>
              Rewrite doc:{d.ref}
            </button>
            <button className="demo__btn demo__btn--ghost el__small" onClick={act(() => store.lab.publishDrift())} disabled={d.state !== 'approved'}>
              Publish as ops
            </button>
            <button className="demo__btn demo__btn--ghost el__small" onClick={act(() => store.lab.reverifyDrift())} disabled={d.stale.length === 0}>
              Re-verify {d.stale.length ? d.stale.join(', ') : 'stale steps'}
            </button>
            <button className="demo__btn demo__btn--ghost el__small" onClick={act(() => store.lab.resetDrift())}>
              Reset
            </button>
          </div>
          <Log lines={d.log} empty="The gate stays clear until a cited source changes." />
          <Receipts rows={d.receipts} />
        </section>

        <section className="el__panel" aria-label="Review policy">
          <div className="el__panel-head">
            Review policy, set {p.setId}
            <span className="el__panel-count">
              requires role {p.roles.join(', ')}, {p.required} approval
            </span>
          </div>
          <div className="el__track" aria-label={`State ${p.state.replace('_', ' ')}`}>
            {TRACK.map((s, i) => (
              <span key={s} className="el__track-item">
                <span className="el__state" data-on={i === trackAt}>
                  {s.replace('_', ' ')}
                </span>
                {i < TRACK.length - 1 && <span className="el__arrow" aria-hidden="true" />}
              </span>
            ))}
          </div>
          <dl className="el__kv">
            <dt>set</dt>
            <dd>{p.name}</dd>
            <dt>version author</dt>
            <dd>
              {p.author}, v{p.version}
            </dd>
            <dt>approvals</dt>
            <dd>{p.approvers.length ? p.approvers.join(', ') : 'none this round'}</dd>
            <dt>missing roles</dt>
            <dd>{p.state === 'approved' || p.missing.length === 0 ? 'none' : p.missing.join(', ')}</dd>
          </dl>
          <div className="el__row">
            <button className="demo__btn el__small" onClick={act(() => store.lab.submitPolicy())} disabled={p.state !== 'draft'}>
              Submit as dana
            </button>
            {REVIEWERS.map((who) => (
              <button key={who} className="demo__btn demo__btn--ghost el__small" onClick={act(() => store.lab.approvePolicy(who))} disabled={p.state === 'approved'}>
                Approve as {who}
              </button>
            ))}
            <button className="demo__btn demo__btn--ghost el__small" onClick={act(() => store.lab.resetPolicy())}>
              Reset
            </button>
          </div>
          <Log lines={p.log} empty="dana wrote the note, so dana cannot approve it; reviewers alone cannot satisfy the admin role." />
        </section>
      </div>

      <section className="el__panel" style={{ marginTop: 14 }} aria-label="Demo script run">
        <div className="el__panel-head">
          make demo, replayed
          <span className="el__panel-count">{sc.done ? `${sc.total} actions, complete` : sc.started ? `action ${sc.chunk} of ${sc.total}` : `${sc.total} actions`}</span>
        </div>
        <div className="demo__controls el__row" style={{ marginTop: 0, marginBottom: 12 }}>
          <button
            className="demo__btn"
            onClick={() => {
              if (reduce) {
                store.lab.finishScript();
                touch();
                return;
              }
              store.lab.startScript();
              touch();
              setPlaying(true);
            }}
            disabled={running || sc.done}
          >
            {sc.done ? 'Run complete' : sc.started ? 'Resume the script' : 'Run the demo script'}
          </button>
          <button className="demo__btn demo__btn--ghost" onClick={() => setPlaying(false)} disabled={!running}>
            Pause
          </button>
          <button
            className="demo__btn demo__btn--ghost"
            onClick={() => {
              setPlaying(false);
              store.lab.resetScript();
              touch();
            }}
            disabled={!sc.started}
          >
            Reset run
          </button>
        </div>
        <div className="el__progress" aria-hidden="true">
          <span style={{ width: `${(sc.done ? 1 : sc.chunk / sc.total) * 100}%` }} />
        </div>
        <div className="el__script" style={{ marginTop: 12 }}>
          <div>
            <ul className="el__log" aria-live="polite">
              {sc.lines.length === 0 ? (
                <li className="el__empty">
                  The script registers eight sources, ingests the three notes, requests changes on the incident set,
                  reviews, tests and publishes, fixes the blocked refund SOP, then revises onboarding to v2 and rolls it
                  back to v1.
                </li>
              ) : (
                sc.lines.map((line, i) => (
                  <li key={`${sc.chunk}-${i}`} data-kind={line.kind}>
                    {line.text}
                  </li>
                ))
              )}
            </ul>
            <Receipts rows={sc.receipts} />
          </div>
          <div className="el__stats el__stats--flush">
            <Stat label="steps compiled" value={live ? live.steps : '...'} sub={`README ${README_FIGURES.steps}`} tone={matchTone(sc.summary?.steps, README_FIGURES.steps)} />
            <Stat
              label="citations"
              value={live ? live.citations : '...'}
              sub={live ? `${live.cited_steps}/${live.steps} steps, ${Math.round(live.coverage * 100)}%` : `README ${README_FIGURES.citations}, ${README_FIGURES.coverage}%`}
              tone={matchTone(sc.summary?.citations, README_FIGURES.citations)}
            />
            <Stat label="publishes blocked" value={live ? live.publishes_blocked : '...'} sub={`README ${README_FIGURES.blocked}`} tone={matchTone(sc.summary?.publishes_blocked, README_FIGURES.blocked)} />
            <Stat label="deliveries" value={live ? live.deliveries : '...'} sub={`README ${README_FIGURES.deliveries}`} tone={matchTone(sc.summary?.deliveries, README_FIGURES.deliveries)} />
            <Stat label="rollbacks" value={live ? live.rollbacks : '...'} sub={`README ${README_FIGURES.rollbacks}`} tone={matchTone(sc.summary?.rollbacks, README_FIGURES.rollbacks)} />
            <Stat label="test runs" value={live ? live.test_runs : '...'} sub={live ? `${live.runs_green} green, ${live.runs_red} red` : 'README 5'} />
          </div>
        </div>
        <AnimatePresence>
          {sc.done && sc.summary && (
            <motion.div
              className="el__verdict"
              data-pass={sc.matches === true}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              <span className="el__verdict-head">
                {sc.matches ? 'Summary block matches the README' : 'Summary block differs from the README'}
              </span>
              <span className="el__verdict-text">
                {sc.summary.steps} steps, {sc.summary.citations} citations at {Math.round(sc.summary.coverage * 100)} percent,{' '}
                {sc.summary.publishes_blocked} blocked publish, {sc.summary.deliveries} deliveries and {sc.summary.rollbacks} rollback,
                computed from the in-memory records after the run.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {sc.block && <pre className="el__block">{sc.block}</pre>}
      </section>

      <div className="demo__controls">
        <button
          className="demo__btn demo__btn--ghost"
          onClick={() => {
            setPlaying(false);
            resetStore();
            setNoteIdx(1);
            setStepId('s6');
          }}
        >
          Reset all
        </button>
        <span className="demo__hint">sequential ids and a counter clock, the same summary every run</span>
      </div>
    </div>
  );
}
