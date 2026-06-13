import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './api-platform.css';
import { useGateway } from './api-platform/state';
import {
  addKey,
  addRoute,
  advanceWindow,
  removeKey,
  removeRoute,
  resetAll,
  setKeyActive,
  updateRoute,
} from './api-platform/store';

// In-browser API gateway configurator and request simulator. Define routes
// (path prefix to upstream, auth requirement, per-key rate limit) and API keys,
// then send simulated requests and watch the gateway admit or deny each one
// with the right status: 200 routed, 401 missing or unknown key, 403 inactive
// key, 429 over the per-key rate limit. State persists in localStorage and runs
// through a pure, deterministic engine. Nothing talks to a server, and the
// engine never evaluates strings or reads a real clock for its decision.

export default function ApiPlatformDemo() {
  const reduce = useReducedMotion();
  const { routes, keys, window: clock } = useGateway();

  // ---- new-route form state ----
  const [nrPrefix, setNrPrefix] = useState('');
  const [nrUpstream, setNrUpstream] = useState('');
  const [nrAuth, setNrAuth] = useState(true);
  const [nrLimit, setNrLimit] = useState(5);

  // ---- new-key form state ----
  const [nkLabel, setNkLabel] = useState('');

  function onAddRoute(e: React.FormEvent) {
    e.preventDefault();
    if (!nrPrefix.trim() || !nrUpstream.trim()) return;
    addRoute({
      prefix: nrPrefix,
      upstream: nrUpstream.trim(),
      requiresAuth: nrAuth,
      rateLimit: Math.max(0, Math.floor(nrLimit) || 0),
    });
    setNrPrefix('');
    setNrUpstream('');
    setNrAuth(true);
    setNrLimit(5);
  }

  function onAddKey(e: React.FormEvent) {
    e.preventDefault();
    if (!nkLabel.trim()) return;
    addKey(nkLabel);
    setNkLabel('');
  }

  return (
    <div className="ap" data-reduce={reduce ? 'true' : 'false'}>
      <header className="ap__head">
        <div>
          <h2 className="ap__title">API gateway</h2>
          <p className="ap__sub">
            Configure routes and keys, then send requests and watch admission. Fixed window{' '}
            <span className="mono">#{clock}</span>.
          </p>
        </div>
        <div className="ap__head-actions">
          <button type="button" className="ap__btn" onClick={advanceWindow}>
            Advance window
          </button>
          <button type="button" className="ap__btn ap__btn--ghost" onClick={resetAll}>
            Reset
          </button>
        </div>
      </header>

      <div className="ap__grid">
        {/* ---------- routes ---------- */}
        <section className="ap__panel glass" aria-labelledby="ap-routes-h">
          <h3 id="ap-routes-h" className="ap__panel-title">
            Routes
          </h3>
          <div className="ap__table-wrap" role="region" aria-label="Route table" tabIndex={0}>
            <table className="ap__table">
              <thead>
                <tr>
                  <th scope="col">Prefix</th>
                  <th scope="col">Upstream</th>
                  <th scope="col">Auth</th>
                  <th scope="col">Limit / window</th>
                  <th scope="col">
                    <span className="ap__sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.prefix}</td>
                    <td className="mono ap__dim">{r.upstream}</td>
                    <td>
                      <label className="ap__switch">
                        <input
                          type="checkbox"
                          checked={r.requiresAuth}
                          onChange={(e) => updateRoute(r.id, { requiresAuth: e.target.checked })}
                          aria-label={`Require auth for ${r.prefix}`}
                        />
                        <span>{r.requiresAuth ? 'required' : 'open'}</span>
                      </label>
                    </td>
                    <td>
                      <input
                        className="ap__num"
                        type="number"
                        min={0}
                        value={r.rateLimit}
                        onChange={(e) =>
                          updateRoute(r.id, { rateLimit: Math.max(0, Number(e.target.value) || 0) })
                        }
                        aria-label={`Rate limit for ${r.prefix}, 0 is unlimited`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ap__icon"
                        onClick={() => removeRoute(r.id)}
                        aria-label={`Delete route ${r.prefix}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {routes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ap__empty">
                      No routes. Add one below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form className="ap__form" onSubmit={onAddRoute} aria-label="Add route">
            <div className="ap__field">
              <label htmlFor="nr-prefix">Prefix</label>
              <input
                id="nr-prefix"
                className="ap__input mono"
                placeholder="/v1/orders"
                value={nrPrefix}
                onChange={(e) => setNrPrefix(e.target.value)}
              />
            </div>
            <div className="ap__field">
              <label htmlFor="nr-upstream">Upstream</label>
              <input
                id="nr-upstream"
                className="ap__input mono"
                placeholder="orders-svc"
                value={nrUpstream}
                onChange={(e) => setNrUpstream(e.target.value)}
              />
            </div>
            <div className="ap__field ap__field--narrow">
              <label htmlFor="nr-limit">Limit</label>
              <input
                id="nr-limit"
                className="ap__input ap__num"
                type="number"
                min={0}
                value={nrLimit}
                onChange={(e) => setNrLimit(Number(e.target.value))}
              />
            </div>
            <label className="ap__check">
              <input
                type="checkbox"
                checked={nrAuth}
                onChange={(e) => setNrAuth(e.target.checked)}
              />
              <span>requires auth</span>
            </label>
            <button type="submit" className="ap__btn">
              Add route
            </button>
          </form>
        </section>

        {/* ---------- keys ---------- */}
        <section className="ap__panel glass" aria-labelledby="ap-keys-h">
          <h3 id="ap-keys-h" className="ap__panel-title">
            API keys
          </h3>
          <ul className="ap__keys">
            {keys.map((k) => (
              <li key={k.id} className="ap__key">
                <span className="ap__key-dot" data-active={k.active} aria-hidden="true" />
                <span className="ap__key-label mono">{k.label}</span>
                <span className="ap__key-state" data-active={k.active}>
                  {k.active ? 'active' : 'inactive'}
                </span>
                <button
                  type="button"
                  className="ap__icon"
                  onClick={() => setKeyActive(k.id, !k.active)}
                  aria-label={`${k.active ? 'Deactivate' : 'Activate'} key ${k.label}`}
                >
                  {k.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  className="ap__icon"
                  onClick={() => removeKey(k.id)}
                  aria-label={`Delete key ${k.label}`}
                >
                  Remove
                </button>
              </li>
            ))}
            {keys.length === 0 && <li className="ap__empty">No keys yet.</li>}
          </ul>
          <form className="ap__form" onSubmit={onAddKey} aria-label="Add API key">
            <div className="ap__field ap__field--grow">
              <label htmlFor="nk-label">New key label</label>
              <input
                id="nk-label"
                className="ap__input mono"
                placeholder="mobile-app"
                value={nkLabel}
                onChange={(e) => setNkLabel(e.target.value)}
              />
            </div>
            <button type="submit" className="ap__btn">
              Add key
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
