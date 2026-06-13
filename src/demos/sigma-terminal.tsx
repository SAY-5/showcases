import { useMemo, useState } from 'react';
import './sigma-terminal.css';
import { universe } from './sigma-terminal/data';
import { useStore } from './sigma-terminal/state';
import {
  addTicker,
  quoteFor,
  removeTicker,
  resetAll,
  selectTicker,
  stepAll,
} from './sigma-terminal/store';

// In-browser Sigma Terminal. The watchlist, price alerts, and per-instrument
// tick counts live in a small external store backed by localStorage, while the
// price series for each instrument is rebuilt deterministically from its seed
// through the engine, so the same instrument always charts the same way. There
// is no network and no eval: advancing the series appends one deterministic bar
// and re-evaluates alerts by plain numeric comparison. A captured clock value
// keeps render pure while still timestamping triggered alerts.

export default function SigmaTerminalDemo() {
  const state = useStore();

  // Tickers in the universe not yet on the watchlist, for the add control.
  const addable = useMemo(
    () => universe.filter((i) => !state.watchlist.includes(i.ticker)),
    [state.watchlist],
  );
  const [addPick, setAddPick] = useState('');

  function onStep() {
    stepAll(Date.now());
  }

  return (
    <div className="st">
      <header className="st__head">
        <div>
          <h2 className="st__title">Sigma Terminal</h2>
          <p className="st__sub">
            Seeded in-browser markets watchlist. Deterministic series, no
            network.
          </p>
        </div>
        <div className="st__actions">
          <button type="button" className="st__btn" onClick={onStep}>
            Advance series
          </button>
          <button
            type="button"
            className="st__btn st__btn--ghost"
            onClick={resetAll}
          >
            Reset
          </button>
        </div>
      </header>

      <section className="st__watch glass" aria-label="Watchlist">
        <div className="st__addrow">
          <label className="st__label" htmlFor="st-add">
            Add instrument
          </label>
          <select
            id="st-add"
            className="st__select"
            value={addPick}
            onChange={(e) => setAddPick(e.target.value)}
          >
            <option value="">Choose a ticker</option>
            {addable.map((i) => (
              <option key={i.ticker} value={i.ticker}>
                {i.ticker} - {i.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="st__btn"
            disabled={!addPick}
            onClick={() => {
              if (addPick) {
                addTicker(addPick);
                setAddPick('');
              }
            }}
          >
            Add
          </button>
        </div>

        <ul className="st__list">
          {state.watchlist.map((ticker) => {
            const q = quoteFor(ticker);
            const up = q.change >= 0;
            const selected = ticker === state.selected;
            return (
              <li
                key={ticker}
                className={`st__row${selected ? ' is-selected' : ''}`}
              >
                <button
                  type="button"
                  className="st__rowmain"
                  onClick={() => selectTicker(ticker)}
                >
                  <span className="st__sym">{ticker}</span>
                  <span className="st__last">{q.last.toFixed(2)}</span>
                  <span className={`st__chg ${up ? 'is-up' : 'is-down'}`}>
                    {up ? '+' : ''}
                    {q.change.toFixed(2)} ({up ? '+' : ''}
                    {q.changePct.toFixed(2)}%)
                  </span>
                </button>
                <button
                  type="button"
                  className="st__remove"
                  aria-label={`Remove ${ticker} from watchlist`}
                  onClick={() => removeTicker(ticker)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
