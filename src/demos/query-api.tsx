import { useState } from 'react';
import '../styles/demo.css';
import './query-api.css';
import { ROUTES } from './query-api/mockapi';
import { useStore } from './query-api/state';
import {
  addRow,
  editRow,
  loadExample,
  removeRow,
  send,
  setBody,
  setMethod,
  setPath,
  type State,
} from './query-api/store';
import type { KeyValue, Method } from './query-api/types';

// In-browser REST request console. The user composes a request (method, path,
// query params, headers, JSON body), sends it against a mock backend that runs
// entirely client-side, and sees a realistic JSON response with status and
// timing. Requests can be saved to a named collection and replayed, and every
// send is recorded in a local history. Nothing leaves the browser: there is no
// real fetch and no eval anywhere in the router.

const METHODS: Method[] = ['GET', 'POST'];

export default function QueryApiDemo() {
  const state = useStore();
  // Snapshot the wall clock into state at mount so render stays pure; each send
  // refreshes it through an event handler, never during render.
  const [clock, setClock] = useState(() => Date.now());

  function onSend() {
    const now = Date.now();
    setClock(now);
    send(now);
  }

  return (
    <div className="qa">
      <header className="qa-head">
        <div>
          <p className="qa-eyebrow">REST console</p>
          <h1 className="qa-title">query-api</h1>
        </div>
        <p className="qa-lede">
          Compose a request, send it against the in-browser mock backend, and read
          back a real JSON response with status and timing. No request ever leaves
          the page.
        </p>
      </header>

      <div className="qa-grid">
        <Builder state={state} onSend={onSend} clock={clock} />
      </div>
    </div>
  );
}

// ---------- request builder ----------

function Builder({
  state,
  onSend,
  clock,
}: {
  state: State;
  onSend: () => void;
  clock: number;
}) {
  const { draft } = state;
  return (
    <section className="glass qa-panel" aria-labelledby="qa-builder-h">
      <div className="qa-panel-head">
        <h2 id="qa-builder-h" className="qa-panel-title">
          Request
        </h2>
        <span className="qa-clock" aria-hidden="true">
          session {new Date(clock).toLocaleTimeString()}
        </span>
      </div>

      <div className="qa-line">
        <label className="qa-field qa-method">
          <span className="qa-label">Method</span>
          <select
            value={draft.method}
            onChange={(e) => setMethod(e.target.value as Method)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="qa-field qa-path">
          <span className="qa-label">Path</span>
          <input
            type="text"
            value={draft.path}
            spellCheck={false}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/users"
          />
        </label>
        <button type="button" className="qa-send" onClick={onSend}>
          Send
        </button>
      </div>

      <div className="qa-examples" role="group" aria-label="Example requests">
        {ROUTES.map((r, i) => (
          <button
            key={r.path + r.method}
            type="button"
            className="qa-chip"
            onClick={() => loadExample(i)}
          >
            <span className={`qa-verb ${r.method.toLowerCase()}`}>{r.method}</span>
            {r.label}
          </button>
        ))}
      </div>

      <Rows field="query" title="Query params" rows={draft.query} />
      <Rows field="headers" title="Headers" rows={draft.headers} />

      {draft.method === 'POST' && (
        <label className="qa-field qa-body">
          <span className="qa-label">JSON body</span>
          <textarea
            value={draft.body}
            spellCheck={false}
            rows={8}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'{\n  "name": "...",\n  "email": "...@..."\n}'}
            aria-describedby={state.bodyError ? 'qa-body-err' : undefined}
          />
        </label>
      )}
    </section>
  );
}

function Rows({
  field,
  title,
  rows,
}: {
  field: 'query' | 'headers';
  title: string;
  rows: KeyValue[];
}) {
  return (
    <fieldset className="qa-rows">
      <legend className="qa-label">{title}</legend>
      {rows.map((r) => (
        <div className="qa-row" key={r.id}>
          <input
            type="checkbox"
            checked={r.enabled}
            onChange={(e) => editRow(field, r.id, { enabled: e.target.checked })}
            aria-label={`Enable ${title} row`}
          />
          <input
            type="text"
            className="qa-k"
            value={r.key}
            spellCheck={false}
            placeholder="key"
            aria-label={`${title} key`}
            onChange={(e) => editRow(field, r.id, { key: e.target.value })}
          />
          <input
            type="text"
            className="qa-v"
            value={r.value}
            spellCheck={false}
            placeholder="value"
            aria-label={`${title} value`}
            onChange={(e) => editRow(field, r.id, { value: e.target.value })}
          />
          <button
            type="button"
            className="qa-x"
            aria-label={`Remove ${title} row`}
            onClick={() => removeRow(field, r.id)}
          >
            &times;
          </button>
        </div>
      ))}
      <button type="button" className="qa-add" onClick={() => addRow(field)}>
        + Add {title.toLowerCase()}
      </button>
    </fieldset>
  );
}
