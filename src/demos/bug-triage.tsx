import { useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './bug-triage.css';
import { useBugs } from './bug-triage/state';
import { createBug } from './bug-triage/store';
import { computeSeverity, priorityCompare, severityOf } from './bug-triage/engine';
import {
  COMPONENTS,
  IMPACTS,
  REPRO,
  STATUSES,
  type Bug,
  type Component,
  type Reproducibility,
  type Severity,
  type Status,
  type UserImpact,
} from './bug-triage/types';

// In-browser bug-triage board. Bugs persist in localStorage and run through a
// pure, deterministic engine: severity is computed from impact, reproducibility
// and regression; columns order their cards by computed priority; the detail
// view surfaces likely duplicates by title token similarity. Nothing here talks
// to a server, and the engine never reads the clock or evaluates strings.

const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  triaged: 'Triaged',
  'in-progress': 'In progress',
  closed: 'Closed',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: 'Blocker',
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
};

type View = 'board' | 'intake';

export default function BugTriageDemo() {
  const bugs = useBugs();
  const [view, setView] = useState<View>('board');

  return (
    <div className="demo bt">
      <span className="demo__tag">bug triage</span>
      <h3 className="demo__title">Bug triage board</h3>
      <p className="demo__lede">
        File a bug and watch its severity computed live from user impact,
        reproducibility and whether it is a regression. Triage it onto the board,
        where each column orders cards by priority and flags likely duplicates.
      </p>

      <div className="bt__tabs" role="tablist" aria-label="Bug triage views">
        <TabButton active={view === 'board'} onClick={() => setView('board')}>
          Board
        </TabButton>
        <TabButton active={view === 'intake'} onClick={() => setView('intake')}>
          File a bug
        </TabButton>
      </div>

      {view === 'intake' ? (
        <IntakeForm onFiled={() => setView('board')} />
      ) : (
        <Board bugs={bugs} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`bt__tab${active ? ' bt__tab--on' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---------- intake ----------

function IntakeForm({ onFiled }: { onFiled: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [component, setComponent] = useState<Component>('api');
  const [reproducibility, setReproducibility] = useState<Reproducibility>('always');
  const [userImpact, setUserImpact] = useState<UserImpact>('broken');
  const [regression, setRegression] = useState(false);
  const [assignee, setAssignee] = useState('');

  // Live severity preview recomputes from the picked factors on every change.
  const preview = useMemo(
    () => computeSeverity(userImpact, reproducibility, regression),
    [userImpact, reproducibility, regression],
  );

  const canSubmit = title.trim().length > 2;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    createBug({
      title,
      description,
      component,
      reproducibility,
      userImpact,
      regression,
      assignee: assignee.trim() || null,
    });
    setTitle('');
    setDescription('');
    setAssignee('');
    onFiled();
  }

  return (
    <form className="bt__intake glass" onSubmit={submit} aria-label="File a new bug">
      <div className="bt__field">
        <label htmlFor="bt-title">Title</label>
        <input
          id="bt-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary of the bug"
          autoComplete="off"
        />
      </div>

      <div className="bt__field">
        <label htmlFor="bt-desc">Description</label>
        <textarea
          id="bt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Steps, expected vs actual, anything useful"
          rows={3}
        />
      </div>

      <div className="bt__row">
        <SelectField
          id="bt-component"
          label="Component"
          value={component}
          options={COMPONENTS}
          onChange={(v) => setComponent(v as Component)}
        />
        <SelectField
          id="bt-impact"
          label="User impact"
          value={userImpact}
          options={IMPACTS}
          onChange={(v) => setUserImpact(v as UserImpact)}
        />
        <SelectField
          id="bt-repro"
          label="Reproducibility"
          value={reproducibility}
          options={REPRO}
          onChange={(v) => setReproducibility(v as Reproducibility)}
        />
      </div>

      <div className="bt__row bt__row--mid">
        <div className="bt__field">
          <label htmlFor="bt-assignee">Assignee (optional)</label>
          <input
            id="bt-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="who owns it"
            autoComplete="off"
          />
        </div>
        <label className="bt__check">
          <input
            type="checkbox"
            checked={regression}
            onChange={(e) => setRegression(e.target.checked)}
          />
          <span>Regression (used to work)</span>
        </label>
      </div>

      <SeverityPreview severity={preview.severity} score={preview.score} />

      <div className="demo__controls">
        <button type="submit" className="demo__btn" disabled={!canSubmit}>
          File bug
        </button>
        <span className="demo__hint">
          Severity is computed, not chosen. Title needs three characters.
        </span>
      </div>
    </form>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="bt__field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function SeverityPreview({ severity, score }: { severity: Severity; score: number }) {
  return (
    <div
      className={`bt__preview bt__sev--${severity}`}
      role="status"
      aria-live="polite"
    >
      <span className="bt__preview-label">Computed severity</span>
      <span className="bt__preview-value">
        {SEVERITY_LABEL[severity]} <span className="bt__preview-score">({score} pts)</span>
      </span>
    </div>
  );
}

// ---------- board ----------

function Board({ bugs }: { bugs: Bug[] }) {
  const reduce = useReducedMotion();
  const columns = useMemo(() => {
    const byStatus: Record<Status, Bug[]> = {
      new: [],
      triaged: [],
      'in-progress': [],
      closed: [],
    };
    for (const b of bugs) byStatus[b.status].push(b);
    for (const s of STATUSES) byStatus[s].sort(priorityCompare);
    return byStatus;
  }, [bugs]);

  return (
    <div className="bt__board" aria-label="Bug board by status">
      {STATUSES.map((status) => (
        <section key={status} className="bt__col glass" aria-label={STATUS_LABEL[status]}>
          <header className="bt__col-head">
            <h4>{STATUS_LABEL[status]}</h4>
            <span className="bt__count">{columns[status].length}</span>
          </header>
          <ul className="bt__cards">
            {columns[status].map((bug) => (
              <li key={bug.id}>
                <BugCard bug={bug} animate={!reduce} />
              </li>
            ))}
            {columns[status].length === 0 && <li className="bt__empty">No bugs</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BugCard({ bug, animate }: { bug: Bug; animate: boolean }) {
  const sev = severityOf(bug).severity;
  return (
    <article className={`bt__card bt__sev--${sev}${animate ? ' bt__card--anim' : ''}`}>
      <div className="bt__card-top">
        <span className="bt__id mono">{bug.id}</span>
        <span className={`bt__chip bt__chip--${sev}`}>{SEVERITY_LABEL[sev]}</span>
      </div>
      <p className="bt__card-title">{bug.title}</p>
      <div className="bt__card-meta">
        <span>{bug.component ?? 'unassigned component'}</span>
        <span>{bug.assignee ?? 'unassigned'}</span>
      </div>
    </article>
  );
}
