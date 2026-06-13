import { useMemo, useState } from 'react';
import '../styles/demo.css';
import './JobApplier.css';
import { useJobStore } from './JobApplier/state';
import { addApplication, setToday } from './JobApplier/store';
import {
  filterAndSort,
  isOnOrBefore,
  type SortKey,
  type StageFilter,
} from './JobApplier/engine';
import {
  STAGE_LABEL,
  STAGES,
  type Application,
  type Stage,
} from './JobApplier/types';

type View = 'board' | 'list';

// Board columns are every stage in pipeline order, so the funnel reads left to
// right and the terminal outcomes sit at the end.
const COLUMN_STAGES: Stage[] = [...STAGES];

const fmtSalary = (s: number | null): string =>
  s === null ? 'Not set' : `$${s.toLocaleString('en-US')}`;

export default function JobApplierDemo() {
  const { applications, today } = useJobStore();
  const [view, setView] = useState<View>('board');
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [sort, setSort] = useState<SortKey>('nextAction');

  const filtered = useMemo(
    () => filterAndSort(applications, { stage: stageFilter, query, sort }),
    [applications, stageFilter, query, sort],
  );

  return (
    <div className="demo" aria-label="JobApplier job application tracker">
      <span className="demo__tag">Interactive app</span>
      <h3 className="demo__title">JobApplier application tracker</h3>
      <p className="demo__lede">
        Track your own job search end to end. Add applications, move them along
        the pipeline from wishlist through applied, screen, interview, and a
        final offer or rejection, and schedule a follow-up on each. The funnel,
        the follow-ups due, and your response rate are all the arithmetic of the
        applications you entered.
      </p>

      <div className="ja__nav" role="tablist" aria-label="JobApplier view">
        {(['board', 'list'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={`ja__navbtn${view === v ? ' ja__navbtn--on' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'board' ? 'Board' : 'List'}
          </button>
        ))}
        <span className="ja__spacer" />
        <label className="ja__today">
          <span className="ja__today-label">Today</span>
          <input
            type="date"
            className="ja__date"
            value={today}
            onChange={(e) => setToday(e.target.value)}
            aria-label="Set the date follow-ups are reckoned against"
          />
        </label>
      </div>

      {view === 'board' ? (
        <Board applications={applications} today={today} />
      ) : (
        <ListView
          rows={filtered}
          today={today}
          query={query}
          stageFilter={stageFilter}
          sort={sort}
          onQuery={setQuery}
          onStageFilter={setStageFilter}
          onSort={setSort}
        />
      )}

      <AddForm />
    </div>
  );
}

// ---------- board ----------

function Board({
  applications,
  today,
}: {
  applications: Application[];
  today: string;
}) {
  return (
    <div className="ja__board" role="list" aria-label="Pipeline board">
      {COLUMN_STAGES.map((stage) => {
        const cards = applications.filter((a) => a.stage === stage);
        return (
          <section
            key={stage}
            className="ja__col glass"
            role="listitem"
            aria-label={`${STAGE_LABEL[stage]} column, ${cards.length} applications`}
          >
            <header className="ja__col-head">
              <span className="ja__col-name">{STAGE_LABEL[stage]}</span>
              <span className="ja__col-count">{cards.length}</span>
            </header>
            <ul className="ja__cards">
              {cards.length === 0 && (
                <li className="ja__empty">Nothing here yet.</li>
              )}
              {cards.map((a) => (
                <li key={a.id}>
                  <Card app={a} today={today} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Card({ app, today }: { app: Application; today: string }) {
  const overdue =
    app.stage !== 'rejected' && isOnOrBefore(app.nextActionDate, today);
  return (
    <article className="ja__card" aria-label={`${app.company}, ${app.role}`}>
      <span className="ja__card-co">{app.company}</span>
      <span className="ja__card-role">{app.role}</span>
      <span className="ja__card-meta">
        <span className="ja__card-salary">{fmtSalary(app.salary)}</span>
        {app.nextActionDate && (
          <span className={`ja__card-next${overdue ? ' ja__card-next--due' : ''}`}>
            {overdue ? 'Due ' : 'Next '}
            {app.nextActionDate}
          </span>
        )}
      </span>
    </article>
  );
}

// ---------- list ----------

function ListView({
  rows,
  today,
  query,
  stageFilter,
  sort,
  onQuery,
  onStageFilter,
  onSort,
}: {
  rows: Application[];
  today: string;
  query: string;
  stageFilter: StageFilter;
  sort: SortKey;
  onQuery: (v: string) => void;
  onStageFilter: (v: StageFilter) => void;
  onSort: (v: SortKey) => void;
}) {
  return (
    <div className="ja__list-wrap">
      <div className="ja__filters">
        <label className="ja__field">
          <span className="ja__field-label">Search</span>
          <input
            type="search"
            className="ja__input"
            placeholder="Company or role"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        <label className="ja__field">
          <span className="ja__field-label">Stage</span>
          <select
            className="ja__select"
            value={stageFilter}
            onChange={(e) => onStageFilter(e.target.value as StageFilter)}
          >
            <option value="all">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="ja__field">
          <span className="ja__field-label">Sort</span>
          <select
            className="ja__select"
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
          >
            <option value="nextAction">Next action</option>
            <option value="company">Company</option>
            <option value="role">Role</option>
            <option value="stage">Stage</option>
            <option value="salary">Salary</option>
          </select>
        </label>
      </div>

      <table className="ja__table">
        <caption className="ja__sr">Tracked applications</caption>
        <thead>
          <tr>
            <th scope="col">Company</th>
            <th scope="col">Role</th>
            <th scope="col">Stage</th>
            <th scope="col">Next action</th>
            <th scope="col">Salary</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="ja__table-empty">
                No applications match.
              </td>
            </tr>
          )}
          {rows.map((a) => {
            const overdue =
              a.stage !== 'rejected' && isOnOrBefore(a.nextActionDate, today);
            return (
              <tr key={a.id}>
                <th scope="row" className="ja__th-row">
                  {a.company}
                </th>
                <td>{a.role}</td>
                <td>
                  <span className={`ja__chip ja__chip--${a.stage}`}>
                    {STAGE_LABEL[a.stage]}
                  </span>
                </td>
                <td className={overdue ? 'ja__td-due' : undefined}>
                  {a.nextActionDate ?? 'None'}
                </td>
                <td>{fmtSalary(a.salary)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- add form ----------

function AddForm() {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (company.trim() === '' && role.trim() === '') return;
    addApplication({
      company,
      role,
      appliedDate: null,
      nextActionDate: null,
      salary: null,
      notes: '',
    });
    setCompany('');
    setRole('');
  }

  return (
    <form className="ja__add" onSubmit={submit} aria-label="Add an application">
      <label className="ja__field">
        <span className="ja__field-label">Company</span>
        <input
          className="ja__input"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
        />
      </label>
      <label className="ja__field">
        <span className="ja__field-label">Role</span>
        <input
          className="ja__input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role"
        />
      </label>
      <button type="submit" className="demo__btn">
        Add to wishlist
      </button>
    </form>
  );
}
