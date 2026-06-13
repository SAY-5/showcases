import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './health-monitor.css';
import { useStore } from './health-monitor/state';
import { setThreshold, snapshot } from './health-monitor/store';
import { sparklinePath } from './health-monitor/engine';
import type {
  ServiceHealth,
  Status,
  Thresholds,
} from './health-monitor/types';

// In-browser HealthMonitor observability dashboard. The fleet, its seeded
// latency series, and every derived signal run client-side over the engine: a
// per-service mulberry32 PRNG advances each latency window deterministically on
// each tick, and status, uptime, p95, sparklines, and alerts are derived from
// the windows alone. The tick, thresholds, and incident log persist in
// localStorage, so the dashboard survives a reload. No eval, no Math.random in
// render, no wall-clock reads: a given tick count always yields the same fleet.

const STATUS_LABEL: Record<Status, string> = {
  up: 'operational',
  degraded: 'degraded',
  down: 'down',
};

function statusOrder(s: Status): number {
  return s === 'down' ? 0 : s === 'degraded' ? 1 : 2;
}

function Sparkline({ health }: { health: ServiceHealth }) {
  return (
    <svg
      className="hm__spark"
      viewBox="0 0 120 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${health.name} latency trend, p95 ${health.p95Ms} milliseconds`}
    >
      <path
        d={health.sparkline}
        fill="none"
        className={`hm__spark-path hm__spark-path--${health.status}`}
      />
    </svg>
  );
}

function ServiceCard({
  health,
  selected,
  onSelect,
}: {
  health: ServiceHealth;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`hm__card hm__card--${health.status}${
        selected ? ' hm__card--selected' : ''
      }`}
      onClick={() => onSelect(health.id)}
      aria-pressed={selected}
    >
      <div className="hm__card-head">
        <span
          className={`hm__dot hm__dot--${health.status}`}
          aria-hidden="true"
        />
        <span className="hm__card-name">{health.name}</span>
        <span className={`hm__badge hm__badge--${health.status}`}>
          {STATUS_LABEL[health.status]}
        </span>
      </div>
      <div className="hm__card-meta">
        <span className="hm__card-region">{health.region}</span>
        <span className="hm__card-kind">{health.kind}</span>
      </div>
      <Sparkline health={health} />
      <dl className="hm__card-stats">
        <div>
          <dt>latency</dt>
          <dd>{health.latencyMs}ms</dd>
        </div>
        <div>
          <dt>errors</dt>
          <dd>{health.errorPct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>uptime</dt>
          <dd>{health.uptimePct.toFixed(1)}%</dd>
        </div>
      </dl>
    </button>
  );
}

// A larger filled latency chart for the detail view, drawn from the same
// sample window the cards use, so the detail tracks the fleet exactly.
function DetailChart({ health }: { health: ServiceHealth }) {
  const W = 320;
  const H = 96;
  const line = sparklinePath(health.samples, W, H);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  return (
    <svg
      className="hm__chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${health.name} latency over the last ${health.samples.length} samples`}
    >
      <path d={area} className={`hm__chart-area hm__chart-area--${health.status}`} />
      <path
        d={line}
        fill="none"
        className={`hm__chart-line hm__chart-line--${health.status}`}
      />
    </svg>
  );
}

// Editable thresholds for the selected service. Editing a line re-derives the
// whole fleet on the next render, so a status can flip immediately.
const THRESHOLD_FIELDS: {
  field: keyof Thresholds;
  label: string;
  unit: string;
  step: number;
}[] = [
  { field: 'latencyWarnMs', label: 'latency warn', unit: 'ms', step: 25 },
  { field: 'latencyDownMs', label: 'latency down', unit: 'ms', step: 25 },
  { field: 'errorWarnPct', label: 'error warn', unit: '%', step: 1 },
  { field: 'errorDownPct', label: 'error down', unit: '%', step: 1 },
];

function ThresholdEditor({ thresholds }: { thresholds: Thresholds }) {
  return (
    <fieldset className="hm__thresholds">
      <legend>Alert thresholds</legend>
      {THRESHOLD_FIELDS.map(({ field, label, unit, step }) => (
        <label key={field} className="hm__thresh-row">
          <span className="hm__thresh-label">
            {label} <span className="hm__thresh-unit">{unit}</span>
          </span>
          <input
            type="number"
            min={0}
            step={step}
            value={thresholds[field]}
            onChange={(e) => setThreshold(field, Number(e.target.value))}
            className="hm__thresh-input"
          />
        </label>
      ))}
    </fieldset>
  );
}

function ServiceDetail({
  health,
  thresholds,
}: {
  health: ServiceHealth;
  thresholds: Thresholds;
}) {
  const recent = [...health.samples].slice(-8).reverse();
  return (
    <aside className="hm__detail glass" aria-label={`${health.name} detail`}>
      <header className="hm__detail-head">
        <span className={`hm__dot hm__dot--${health.status}`} aria-hidden="true" />
        <h4 className="hm__detail-name">{health.name}</h4>
        <span className={`hm__badge hm__badge--${health.status}`}>
          {STATUS_LABEL[health.status]}
        </span>
      </header>
      <p className="hm__detail-meta">
        {health.region} · {health.kind}
        {health.breach ? ` · breaching ${health.breach}` : ''}
      </p>

      <DetailChart health={health} />

      <dl className="hm__detail-stats">
        <div>
          <dt>p95 latency</dt>
          <dd>{health.p95Ms}ms</dd>
        </div>
        <div>
          <dt>last latency</dt>
          <dd>{health.latencyMs}ms</dd>
        </div>
        <div>
          <dt>error rate</dt>
          <dd>{health.errorPct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>uptime</dt>
          <dd>{health.uptimePct.toFixed(1)}%</dd>
        </div>
      </dl>

      <div className="hm__samples" aria-label="recent samples">
        <span className="hm__section-title">Recent samples</span>
        <ul className="hm__sample-list">
          {recent.map((s, i) => (
            <li
              key={i}
              className={`hm__sample${s.error ? ' hm__sample--err' : ''}`}
            >
              <span className="hm__sample-lat">{s.latencyMs}ms</span>
              <span className="hm__sample-flag">{s.error ? 'error' : 'ok'}</span>
            </li>
          ))}
        </ul>
      </div>

      <ThresholdEditor thresholds={thresholds} />
    </aside>
  );
}

export default function HealthMonitorDemo() {
  useReducedMotion();
  const state = useStore();
  const snap = snapshot(state);
  const [selectedId, setSelectedId] = useState<string>(
    snap.healths[0]?.id ?? '',
  );

  const ordered = [...snap.healths].sort(
    (a, b) => statusOrder(a.status) - statusOrder(b.status),
  );
  const selected =
    snap.healths.find((h) => h.id === selectedId) ?? snap.healths[0];

  return (
    <div className="demo" aria-label="health-monitor observability dashboard">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Fleet health at a glance</h3>
      <p className="demo__lede">
        Six services report a seeded latency and error series. Status, uptime,
        p95, and alerts are derived from the rolling windows against tunable
        thresholds. Advance the clock to watch the fleet drift and alerts fire.
      </p>

      <div className="hm__stage">
        <section className="hm__fleet" aria-label="service fleet">
          <h4 className="hm__section-title">Services</h4>
          <div className="hm__grid" role="list">
            {ordered.map((h) => (
              <div role="listitem" key={h.id}>
                <ServiceCard
                  health={h}
                  selected={h.id === selectedId}
                  onSelect={setSelectedId}
                />
              </div>
            ))}
          </div>
        </section>

        {selected && (
          <ServiceDetail health={selected} thresholds={state.thresholds} />
        )}
      </div>
    </div>
  );
}
