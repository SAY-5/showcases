import './task-processor.css';
import { useSim } from './task-processor/store';
import type { Job, JobStatus } from './task-processor/types';

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
