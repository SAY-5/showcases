// GovGate: a working compliance assessment that runs entirely in the browser.
// Walk a policy framework of weighted controls, mark each one met, partial, not
// met, or not applicable with a note, and the app scores a weighted compliance
// percent, gates it against a configurable threshold, breaks the result down by
// category, and produces a prioritized remediation list. The framework and the
// assessment live in localStorage; a pure, eval-free engine computes every
// number.

import '../styles/demo.css';
import './govgate.css';

import { useGovStore } from './govgate/state';
import { setControlNote, setControlStatus } from './govgate/store';
import { groupByCategory, STATUS_LABEL, STATUS_ORDER, SEVERITY_LABEL } from './govgate/format';
import { resultFor } from './govgate/engine';

export default function GovgateDemo() {
  const { framework, assessment } = useGovStore();
  const groups = groupByCategory(framework.controls);

  return (
    <div className="demo gg" aria-label="GovGate compliance assessment">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Assess a tool against a compliance framework</h3>
      <p className="demo__lede">
        Mark each control met, partial, not met, or not applicable and add a
        note. The engine scores a weighted compliance percent, gates it against
        your threshold, breaks it down by category, and lists the gaps to fix
        first. Everything persists in your browser.
      </p>

      <section className="gg__controls" aria-label="Controls">
        {groups.map((group) => (
          <fieldset key={group.category} className="gg__group glass">
            <legend className="gg__group-legend">{group.category}</legend>
            <ul className="gg__list">
              {group.controls.map((control) => {
                const result = resultFor(assessment, control.id);
                return (
                  <li key={control.id} className="gg__control">
                    <div className="gg__control-head">
                      <span className="gg__control-title">{control.title}</span>
                      <span className={`gg__sev gg__sev--${control.severity}`}>
                        {SEVERITY_LABEL[control.severity]}
                      </span>
                      <span className="gg__weight" aria-label={`weight ${control.weight}`}>
                        w{control.weight}
                      </span>
                    </div>
                    <p className="gg__requirement">{control.requirement}</p>

                    <div className="gg__answer">
                      <div
                        className="gg__statusset"
                        role="radiogroup"
                        aria-label={`Status for ${control.title}`}
                      >
                        {STATUS_ORDER.map((status) => (
                          <button
                            key={status}
                            type="button"
                            role="radio"
                            aria-checked={result.status === status}
                            className={`gg__status gg__status--${status} ${
                              result.status === status ? 'is-on' : ''
                            }`}
                            onClick={() => setControlStatus(control.id, status)}
                          >
                            {STATUS_LABEL[status]}
                          </button>
                        ))}
                      </div>
                      <label className="gg__note-label">
                        <span className="gg__note-cap">Note</span>
                        <input
                          type="text"
                          className="gg__note"
                          value={result.note}
                          placeholder="Evidence or gap detail"
                          onChange={(e) =>
                            setControlNote(control.id, e.target.value)
                          }
                          aria-label={`Note for ${control.title}`}
                        />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </section>
    </div>
  );
}
