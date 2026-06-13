import '../styles/demo.css';
import './releaseguard.css';
import { useStore } from './releaseguard/state';
import { evaluateReadiness } from './releaseguard/engine';
import {
  setGateBoolean,
  setGateCurrent,
  setGateRequired,
  setGateThreshold,
} from './releaseguard/store';
import type { Gate } from './releaseguard/types';

// ReleaseGuard: an in-browser release-readiness gate. A set of gates (threshold
// or boolean) each carry a current value and a required condition. The pure
// engine evaluates every gate, vetoes the release if any required gate fails,
// and reports a weighted readiness score. The user tunes gate values and the
// GO / NO-GO banner updates live. All state is deterministic and persisted in
// localStorage; nothing here uses eval.

function unitSuffix(g: Gate): string {
  return g.kind === 'threshold' && g.unit === 'percent' ? '%' : '';
}

// Editor row for a single gate. Threshold gates expose two sliders (current
// and required); boolean gates expose a single toggle. Every gate exposes a
// required checkbox. Editing flows through the store actions, which persist and
// trigger a re-evaluation through the subscription.
function GateEditor({ gate }: { gate: Gate }) {
  return (
    <div className="rg2__edit glass">
      <div className="rg2__edit-head">
        <span className="rg2__edit-name">{gate.label}</span>
        <label className="rg2__bool">
          <input
            type="checkbox"
            checked={gate.required}
            onChange={(e) => setGateRequired(gate.id, e.target.checked)}
          />
          required
        </label>
      </div>

      {gate.kind === 'threshold' ? (
        <div className="rg2__fields">
          <div className="rg2__field">
            <span className="rg2__field-label" id={`${gate.id}-cur`}>
              current
              <span className="rg2__field-val">
                {gate.current}
                {unitSuffix(gate)}
              </span>
            </span>
            <input
              className="rg2__range"
              type="range"
              min={gate.min}
              max={gate.max}
              step={gate.step}
              value={gate.current}
              aria-labelledby={`${gate.id}-cur`}
              onChange={(e) =>
                setGateCurrent(gate.id, Number(e.target.value))
              }
            />
          </div>
          <div className="rg2__field">
            <span className="rg2__field-label" id={`${gate.id}-thr`}>
              required {gate.compare === 'atLeast' ? '≥' : '≤'}
              <span className="rg2__field-val">
                {gate.threshold}
                {unitSuffix(gate)}
              </span>
            </span>
            <input
              className="rg2__range"
              type="range"
              min={gate.min}
              max={gate.max}
              step={gate.step}
              value={gate.threshold}
              aria-labelledby={`${gate.id}-thr`}
              onChange={(e) =>
                setGateThreshold(gate.id, Number(e.target.value))
              }
            />
          </div>
        </div>
      ) : (
        <label className="rg2__bool">
          <input
            type="checkbox"
            checked={gate.current}
            onChange={(e) => setGateBoolean(gate.id, e.target.checked)}
          />
          {gate.current ? 'condition met' : 'condition not met'}
        </label>
      )}
    </div>
  );
}

export default function ReleaseguardDemo() {
  const { gates } = useStore();
  const readiness = evaluateReadiness(gates);
  const go = readiness.decision === 'GO';

  return (
    <div className="demo" aria-label="releaseguard release readiness gate">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Is this release ready to ship?</h3>
      <p className="demo__lede">
        Each gate has a current value and a required condition. Any required
        gate that fails forces a NO-GO; the readiness score is the weighted
        share of passing gates. Tune the values below and the decision updates
        live.
      </p>

      <section
        className="rg2"
        aria-label="release gate checklist and decision"
      >
        <div
          className={`rg2__banner glass${go ? ' rg2__banner--go' : ' rg2__banner--nogo'}`}
          role="status"
          aria-live="polite"
        >
          <div className="rg2__decision">
            <span className="rg2__decision-label">Release decision</span>
            <strong className="rg2__decision-value">
              {readiness.decision}
            </strong>
          </div>
          <div className="rg2__score" aria-label="readiness score">
            <span className="rg2__score-num">{readiness.score}</span>
            <span className="rg2__score-unit">/ 100 ready</span>
            <span className="rg2__score-sub">
              {readiness.passCount} of {readiness.total} gates pass
            </span>
          </div>
        </div>

        <ul className="rg2__list" aria-label="gates">
          {readiness.results.map((r) => (
            <li
              key={r.id}
              className={`rg2__row glass${r.pass ? '' : ' rg2__row--fail'}`}
            >
              <div className="rg2__row-main">
                <span className="rg2__row-label">
                  {r.label}
                  {r.required && (
                    <span className="rg2__req" title="required gate">
                      required
                    </span>
                  )}
                </span>
                <span className="rg2__row-vals">
                  <span className="rg2__cur">{r.currentText}</span>
                  <span className="rg2__sep">vs</span>
                  <span className="rg2__req-val">{r.requiredText}</span>
                </span>
              </div>
              <span
                className={`rg2__chip${r.pass ? ' rg2__chip--pass' : ' rg2__chip--fail'}`}
              >
                {r.pass ? 'pass' : 'fail'}
              </span>
            </li>
          ))}
        </ul>

        <div className="rg2__subhead">
          <h4 className="rg2__subtitle">Tune the gates</h4>
          <span className="rg2__subhint">
            a failing required gate forces NO-GO
          </span>
        </div>
        <div className="rg2__editor" aria-label="gate editor">
          {gates.map((g) => (
            <GateEditor key={g.id} gate={g} />
          ))}
        </div>
      </section>
    </div>
  );
}
