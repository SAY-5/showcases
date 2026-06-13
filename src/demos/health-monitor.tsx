import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './health-monitor.css';
import { useStore } from './health-monitor/state';
import { snapshot } from './health-monitor/store';
import type { ServiceHealth, Status } from './health-monitor/types';

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

  return (
    <div className="demo" aria-label="health-monitor observability dashboard">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Fleet health at a glance</h3>
      <p className="demo__lede">
        Six services report a seeded latency and error series. Status, uptime,
        p95, and alerts are derived from the rolling windows against tunable
        thresholds. Advance the clock to watch the fleet drift and alerts fire.
      </p>

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
    </div>
  );
}
