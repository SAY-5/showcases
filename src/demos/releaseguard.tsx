import '../styles/demo.css';
import './releaseguard.css';
import { useStore } from './releaseguard/state';
import { evaluateReadiness } from './releaseguard/engine';

// ReleaseGuard: an in-browser release-readiness gate. A set of gates (threshold
// or boolean) each carry a current value and a required condition. The pure
// engine evaluates every gate, vetoes the release if any required gate fails,
// and reports a weighted readiness score. The user tunes gate values and the
// GO / NO-GO banner updates live. All state is deterministic and persisted in
// localStorage; nothing here uses eval.

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
        share of passing gates.
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
      </section>
    </div>
  );
}
