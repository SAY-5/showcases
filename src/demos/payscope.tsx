import { useState } from 'react';
import '../styles/demo.css';
import './payscope.css';
import {
  useStore,
  addMeter,
  removeMeter,
  addPlan,
  removePlan,
} from './payscope/store';
import type { PlanMeter } from './payscope/types';

type Tab = 'setup' | 'usage' | 'invoices';

export default function PayscopeDemo() {
  const [tab, setTab] = useState<Tab>('setup');

  return (
    <div className="demo" aria-label="PayScope usage metering and invoicing demo">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Usage metering and invoicing</h3>
      <p className="demo__lede">
        Define meters to track consumption, create plans with included quotas
        and overage rates, record usage events, then generate detailed invoices
        with line-item overage calculations. All data persists in localStorage.
      </p>

      <nav className="ps__tabs" aria-label="sections">
        {(['setup', 'usage', 'invoices'] as const).map((t) => (
          <button
            key={t}
            className={`ps__tab ${tab === t ? 'ps__tab--on' : ''}`}
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'setup' && <SetupPanel />}
      {tab === 'usage' && <UsagePlaceholder />}
      {tab === 'invoices' && <InvoicePlaceholder />}
    </div>
  );
}

function UsagePlaceholder() {
  return <div className="ps__empty">Usage recording (next step)</div>;
}

function InvoicePlaceholder() {
  return <div className="ps__empty">Invoice generation (next step)</div>;
}

function SetupPanel() {
  const store = useStore();
  return (
    <section className="ps__stage" aria-label="setup">
      <MeterForm />
      <MeterList meters={store.meters} />
      <PlanForm meters={store.meters} />
      <PlanList plans={store.plans} meters={store.meters} />
    </section>
  );
}

function MeterForm() {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [rate, setRate] = useState('');

  function handleAdd() {
    const n = name.trim();
    const u = unit.trim();
    const r = parseFloat(rate);
    if (!n || !u || isNaN(r) || r < 0) return;
    addMeter(n, u, r);
    setName('');
    setUnit('');
    setRate('');
  }

  return (
    <fieldset className="ps__fieldset glass">
      <legend className="ps__legend">New meter</legend>
      <div className="ps__form-row">
        <label className="ps__field">
          <span className="ps__field-label">Name</span>
          <input
            className="ps__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="API calls"
          />
        </label>
        <label className="ps__field">
          <span className="ps__field-label">Unit</span>
          <input
            className="ps__input"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="requests"
          />
        </label>
        <label className="ps__field">
          <span className="ps__field-label">Rate per unit ($)</span>
          <input
            className="ps__input"
            type="number"
            min="0"
            step="0.001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0.002"
          />
        </label>
      </div>
      <button className="demo__btn" onClick={handleAdd} disabled={!name.trim()}>
        Add meter
      </button>
    </fieldset>
  );
}

function MeterList({ meters }: { meters: ReturnType<typeof useStore>['meters'] }) {
  if (meters.length === 0) {
    return <p className="ps__empty">No meters defined yet.</p>;
  }
  return (
    <div className="ps__list" role="list" aria-label="defined meters">
      {meters.map((m) => (
        <div key={m.id} className="ps__list-item" role="listitem">
          <div className="ps__list-main">
            <span className="ps__list-name">{m.name}</span>
            <span className="ps__list-meta">
              {m.unit} at ${m.ratePerUnit}/unit
            </span>
          </div>
          <button
            className="ps__remove"
            onClick={() => removeMeter(m.id)}
            aria-label={`remove ${m.name}`}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function PlanForm({ meters }: { meters: ReturnType<typeof useStore>['meters'] }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<
    Record<string, { included: string; overage: string }>
  >({});

  function toggleMeter(meterId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[meterId]) {
        delete next[meterId];
      } else {
        next[meterId] = { included: '0', overage: '0' };
      }
      return next;
    });
  }

  function updateSelected(meterId: string, field: 'included' | 'overage', value: string) {
    setSelected((prev) => ({
      ...prev,
      [meterId]: { ...prev[meterId], [field]: value },
    }));
  }

  function handleAdd() {
    const n = name.trim();
    if (!n) return;
    const planMeters: PlanMeter[] = [];
    for (const [meterId, cfg] of Object.entries(selected)) {
      const included = parseFloat(cfg.included);
      const overage = parseFloat(cfg.overage);
      if (isNaN(included) || isNaN(overage)) continue;
      planMeters.push({
        meterId,
        includedQuota: Math.max(0, included),
        overageRate: Math.max(0, overage),
      });
    }
    if (planMeters.length === 0) return;
    addPlan(n, planMeters);
    setName('');
    setSelected({});
  }

  return (
    <fieldset className="ps__fieldset glass">
      <legend className="ps__legend">New plan</legend>
      <label className="ps__field">
        <span className="ps__field-label">Plan name</span>
        <input
          className="ps__input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Starter"
        />
      </label>

      {meters.length === 0 && (
        <p className="ps__empty">Add meters first to attach them to a plan.</p>
      )}

      {meters.length > 0 && (
        <div className="ps__meter-picks" role="group" aria-label="attach meters">
          {meters.map((m) => {
            const active = !!selected[m.id];
            return (
              <div key={m.id} className={`ps__meter-pick ${active ? 'ps__meter-pick--on' : ''}`}>
                <button
                  className="ps__meter-pick-toggle"
                  onClick={() => toggleMeter(m.id)}
                  aria-pressed={active}
                >
                  {m.name} ({m.unit})
                </button>
                {active && (
                  <div className="ps__meter-pick-fields">
                    <label className="ps__field ps__field--sm">
                      <span className="ps__field-label">Included</span>
                      <input
                        className="ps__input ps__input--sm"
                        type="number"
                        min="0"
                        value={selected[m.id].included}
                        onChange={(e) => updateSelected(m.id, 'included', e.target.value)}
                      />
                    </label>
                    <label className="ps__field ps__field--sm">
                      <span className="ps__field-label">Overage rate ($)</span>
                      <input
                        className="ps__input ps__input--sm"
                        type="number"
                        min="0"
                        step="0.001"
                        value={selected[m.id].overage}
                        onChange={(e) => updateSelected(m.id, 'overage', e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button className="demo__btn" onClick={handleAdd} disabled={!name.trim()}>
        Create plan
      </button>
    </fieldset>
  );
}

function PlanList({
  plans,
  meters,
}: {
  plans: ReturnType<typeof useStore>['plans'];
  meters: ReturnType<typeof useStore>['meters'];
}) {
  const meterMap = new Map(meters.map((m) => [m.id, m]));
  if (plans.length === 0) {
    return <p className="ps__empty">No plans defined yet.</p>;
  }
  return (
    <div className="ps__list" role="list" aria-label="defined plans">
      {plans.map((p) => (
        <div key={p.id} className="ps__list-item ps__list-item--plan" role="listitem">
          <div className="ps__list-main">
            <span className="ps__list-name">{p.name}</span>
            <span className="ps__list-meta">
              {p.meters.length} meter{p.meters.length === 1 ? '' : 's'}
            </span>
            <div className="ps__plan-meters">
              {p.meters.map((pm) => {
                const m = meterMap.get(pm.meterId);
                return (
                  <span key={pm.meterId} className="ps__plan-meter-chip">
                    {m?.name ?? pm.meterId}: {pm.includedQuota} free, ${pm.overageRate}/overage
                  </span>
                );
              })}
            </div>
          </div>
          <button
            className="ps__remove"
            onClick={() => removePlan(p.id)}
            aria-label={`remove plan ${p.name}`}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
