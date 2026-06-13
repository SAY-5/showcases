// configmesh: an in-browser multi-environment configuration manager. Define
// typed config keys, set base defaults, override per environment, diff two
// environments, and surface validation errors. The resolution/validation/diff
// logic is the pure engine in ./configmesh/engine.ts; this file is the UI shell
// and persists through the external store in ./configmesh/store.ts. No eval, no
// network, deterministic given the stored document.

import { useState } from 'react';
import '../styles/demo.css';
import './configmesh.css';
import { useConfigDoc } from './configmesh/state';
import {
  addKey,
  clearBase,
  deleteKey,
  resetAll,
  setBase,
  updateKey,
} from './configmesh/store';
import { coerceValue } from './configmesh/engine';
import type { ConfigType, ConfigValue } from './configmesh/types';

const TYPES: ConfigType[] = ['string', 'number', 'bool'];

function KeysPanel() {
  const doc = useConfigDoc();
  const [name, setName] = useState('');
  const [type, setType] = useState<ConfigType>('string');
  const [required, setRequired] = useState(false);
  const [error, setError] = useState('');

  // Draft text for the base-default editors, keyed by key name. Edits are
  // committed on blur/enter so typing a partial number does not thrash storage.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function submitKey() {
    const ok = addKey(name, type, required);
    if (!ok) {
      setError('Name must be a unique identifier (letters, digits, dot, dash).');
      return;
    }
    setName('');
    setType('string');
    setRequired(false);
    setError('');
  }

  function commitBase(keyName: string, keyType: ConfigType, raw: string) {
    if (raw.trim() === '') {
      clearBase(keyName);
      setDrafts((d) => {
        const next = { ...d };
        delete next[keyName];
        return next;
      });
      return;
    }
    const value = coerceValue(raw, keyType);
    if (value === null) return; // reject malformed; leave prior value intact
    setBase(keyName, value);
    setDrafts((d) => {
      const next = { ...d };
      delete next[keyName];
      return next;
    });
  }

  function draftFor(keyName: string, current: ConfigValue | undefined): string {
    if (keyName in drafts) return drafts[keyName];
    return current === undefined ? '' : String(current);
  }

  return (
    <section className="cm-panel glass" aria-labelledby="cm-keys-h">
      <div className="cm-panel__head">
        <h4 id="cm-keys-h" className="cm-panel__title">
          Keys and base defaults
        </h4>
        <span className="cm-panel__meta">{doc.keys.length} keys</span>
      </div>

      <form
        className="cm-keyform"
        onSubmit={(e) => {
          e.preventDefault();
          submitKey();
        }}
      >
        <label className="cm-field">
          <span className="cm-field__label">Key name</span>
          <input
            className="cm-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="feature.new_nav"
            aria-invalid={error !== ''}
          />
        </label>
        <label className="cm-field">
          <span className="cm-field__label">Type</span>
          <select
            className="cm-input"
            value={type}
            onChange={(e) => setType(e.target.value as ConfigType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="cm-check">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>required</span>
        </label>
        <button type="submit" className="demo__btn">
          Add key
        </button>
      </form>
      {error && (
        <p className="cm-error" role="alert">
          {error}
        </p>
      )}

      <div className="cm-table-wrap">
        <table className="cm-table">
          <caption className="cm-sr-only">
            Config keys with their type, required flag, and base default
          </caption>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Type</th>
              <th scope="col">Required</th>
              <th scope="col">Base default</th>
              <th scope="col">
                <span className="cm-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {doc.keys.map((key) => {
              const baseVal = doc.base[key.name];
              return (
                <tr key={key.name}>
                  <th scope="row" className="cm-key-name mono">
                    {key.name}
                  </th>
                  <td>
                    <select
                      className="cm-input cm-input--sm"
                      value={key.type}
                      aria-label={`type for ${key.name}`}
                      onChange={(e) =>
                        updateKey(key.name, {
                          type: e.target.value as ConfigType,
                        })
                      }
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="cm-check cm-check--bare">
                      <input
                        type="checkbox"
                        checked={key.required}
                        aria-label={`required for ${key.name}`}
                        onChange={(e) =>
                          updateKey(key.name, { required: e.target.checked })
                        }
                      />
                    </label>
                  </td>
                  <td>
                    {key.type === 'bool' ? (
                      <select
                        className="cm-input cm-input--sm"
                        aria-label={`base default for ${key.name}`}
                        value={baseVal === undefined ? '' : String(baseVal)}
                        onChange={(e) =>
                          e.target.value === ''
                            ? clearBase(key.name)
                            : setBase(key.name, e.target.value === 'true')
                        }
                      >
                        <option value="">(unset)</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        className="cm-input cm-input--sm"
                        aria-label={`base default for ${key.name}`}
                        inputMode={key.type === 'number' ? 'decimal' : 'text'}
                        value={draftFor(key.name, baseVal)}
                        placeholder="(unset)"
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [key.name]: e.target.value }))
                        }
                        onBlur={(e) =>
                          commitBase(key.name, key.type, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitBase(
                              key.name,
                              key.type,
                              (e.target as HTMLInputElement).value,
                            );
                          }
                        }}
                      />
                    )}
                  </td>
                  <td className="cm-row-actions">
                    <button
                      type="button"
                      className="cm-icon-btn"
                      aria-label={`delete ${key.name}`}
                      onClick={() => deleteKey(key.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ConfigmeshDemo() {
  const doc = useConfigDoc();

  return (
    <div className="demo cm" aria-label="configmesh configuration manager">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Multi-environment configuration manager</h3>
      <p className="demo__lede">
        Define typed config keys with base defaults, override them per
        environment, diff two environments, and catch missing required keys and
        type errors. Everything resolves in the browser and persists locally.
      </p>

      <KeysPanel />

      <div className="demo__controls">
        <button
          type="button"
          className="demo__btn demo__btn--ghost"
          onClick={resetAll}
        >
          Reset to seed
        </button>
        <span className="demo__hint">
          {doc.environments.length} environments,{' '}
          {Object.keys(doc.base).length} base defaults set
        </span>
      </div>
    </div>
  );
}
