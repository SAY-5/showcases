import './task-processor.css';
import {
  LIMITS,
  setConcurrency,
  setFailRate,
  setMaxRetries,
  useSim,
} from './task-processor/store';
import type { Job, JobStatus, SimState, Worker } from './task-processor/types';

// Columns the queue board renders, left to right along a job's lifecycle.
const COLUMNS: { status: JobStatus; label: string }[] = [
  { status: 'queued', label: 'Queued' },
  { status: 'running', label: 'Running' },
  { status: 'done', label: 'Done' },
  { status: 'dead', label: 'Dead letter' },
];

function jobsByStatus(jobs: Job[], status: JobStatus): Job[] {
  return jobs
    .filter((j) => j.status === status)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function WorkerCard({ worker }: { worker: Worker }) {
  return (
    <li className={`tp-worker ${worker.busy ? 'tp-worker--busy' : 'tp-worker--idle'}`}>
      <span className="tp-worker__id">worker {worker.id}</span>
      <span className="tp-worker__state">
        {worker.busy ? (
          <>
            <span className="tp-worker__dot" aria-hidden="true" />
            running {worker.currentJob}
          </>
        ) : (
          'idle'
        )}
      </span>
    </li>
  );
}

function Controls({ sim }: { sim: SimState }) {
  const { config } = sim;
  return (
    <div className="tp__controls glass" aria-label="simulation configuration">
      <label className="tp__field">
        <span className="tp__field-label">
          Concurrency <b>{config.concurrency}</b>
        </span>
        <input
          type="range"
          min={LIMITS.concurrency.min}
          max={LIMITS.concurrency.max}
          step={1}
          value={config.concurrency}
          onChange={(e) => setConcurrency(Number(e.target.value))}
          aria-label="worker concurrency"
        />
      </label>
      <label className="tp__field">
        <span className="tp__field-label">
          Max retries <b>{config.maxRetries}</b>
        </span>
        <input
          type="range"
          min={LIMITS.maxRetries.min}
          max={LIMITS.maxRetries.max}
          step={1}
          value={config.maxRetries}
          onChange={(e) => setMaxRetries(Number(e.target.value))}
          aria-label="max retries before dead-letter"
        />
      </label>
      <label className="tp__field">
        <span className="tp__field-label">
          Fail rate <b>{Math.round(config.failRate * 100)}%</b>
        </span>
        <input
          type="range"
          min={LIMITS.failRate.min}
          max={LIMITS.failRate.max}
          step={0.05}
          value={config.failRate}
          onChange={(e) => setFailRate(Number(e.target.value))}
          aria-label="per-attempt failure rate"
        />
      </label>
    </div>
  );
}

function JobChip({ job }: { job: Job }) {
  return (
    <li className={`tp-chip tp-chip--${job.status}`}>
      <span className="tp-chip__id">{job.id}</span>
      <span className="tp-chip__meta">
        {job.attempts > 0 ? `${job.attempts} att` : 'new'}
        {job.workerId !== null ? ` · w${job.workerId}` : ''}
      </span>
    </li>
  );
}

export default function TaskProcessorDemo() {
  const sim = useSim();
  const queueDepth = sim.jobs.filter((j) => j.status === 'queued').length;

  return (
    <section className="tp" aria-label="task-processor queue and worker simulator">
      <header className="tp__head">
        <span className="tp__tag">Interactive simulator</span>
        <h3 className="tp__title">Job queue and worker pool</h3>
        <p className="tp__lede">
          A queue of jobs drained by a pool of concurrent workers. Each tick,
          workers pull queued jobs up to the concurrency limit, running jobs
          resolve, and failures retry until they exhaust their budget and fall to
          the dead-letter queue. Deterministic for a fixed seed.
        </p>
      </header>

      <div className="tp__depth glass" role="status" aria-live="polite">
        <span className="tp__depth-label">Queue depth</span>
        <span className="tp__depth-val">{queueDepth}</span>
        <span className="tp__depth-sub">tick {sim.tick}</span>
      </div>

      <Controls sim={sim} />

      <div className="tp__workers glass" aria-label="worker pool">
        <div className="tp__workers-head">
          <span className="tp__col-name">Worker pool</span>
          <span className="tp__col-count">{sim.workers.length}</span>
        </div>
        <ul className="tp__workers-list">
          {sim.workers.map((w) => (
            <WorkerCard key={w.id} worker={w} />
          ))}
        </ul>
      </div>

      <div className="tp__board" role="list" aria-label="jobs by status">
        {COLUMNS.map((col) => {
          const jobs = jobsByStatus(sim.jobs, col.status);
          return (
            <div
              key={col.status}
              className={`tp__col glass tp__col--${col.status}`}
              role="listitem"
            >
              <div className="tp__col-head">
                <span className="tp__col-name">{col.label}</span>
                <span className="tp__col-count">{jobs.length}</span>
              </div>
              <ul className="tp__col-list" aria-label={`${col.label} jobs`}>
                {jobs.map((job) => (
                  <JobChip key={job.id} job={job} />
                ))}
                {jobs.length === 0 && <li className="tp__col-empty">empty</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
