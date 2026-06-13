import { useMemo, useState } from 'react';
import './sigma-terminal.css';
import { universe } from './sigma-terminal/data';
import { sparklinePath } from './sigma-terminal/engine';
import { useStore } from './sigma-terminal/state';
import {
  addTicker,
  quoteFor,
  removeTicker,
  resetAll,
  selectTicker,
  seriesFor,
  stepAll,
} from './sigma-terminal/store';
import type { Bar } from './sigma-terminal/types';

// A compact inline sparkline drawn from an instrument's close prices. The line
// is coloured by net direction over the window so a glance reads the trend.
function Sparkline({
  series,
  width,
  height,
  up,
}: {
  series: Bar[];
  width: number;
  height: number;
  up: boolean;
}) {
  const d = sparklinePath(series, width, height);
  if (!d) return <span className="st__spark-empty" aria-hidden="true" />;
  return (
    <svg
      className="st__spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={up ? 'var(--ok)' : 'var(--magenta)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
        <h3 className="st__panel-title">Watchlist</h3>
        <div className="st__addrow">
          <div className="st__field">
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
          </div>
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

        {state.watchlist.length === 0 ? (
          <p className="st__empty">
            Watchlist is empty. Add an instrument above to begin.
          </p>
        ) : (
          <table className="st__table">
            <caption className="st__caption">
              Watchlist quotes and trend
            </caption>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col" className="st__num">
                  Last
                </th>
                <th scope="col" className="st__num">
                  Change
                </th>
                <th scope="col">Trend</th>
                <th scope="col">
                  <span className="st__sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.watchlist.map((ticker) => {
                const series = seriesFor(ticker);
                const q = quoteFor(ticker);
                const up = q.change >= 0;
                const selected = ticker === state.selected;
                return (
                  <tr
                    key={ticker}
                    className={selected ? 'is-selected' : undefined}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <th scope="row">
                      <button
                        type="button"
                        className="st__symbtn"
                        onClick={() => selectTicker(ticker)}
                      >
                        {ticker}
                      </button>
                    </th>
                    <td className="st__num st__last">{q.last.toFixed(2)}</td>
                    <td className="st__num">
                      <span className={`st__chg ${up ? 'is-up' : 'is-down'}`}>
                        {up ? '+' : ''}
                        {q.change.toFixed(2)} ({up ? '+' : ''}
                        {q.changePct.toFixed(2)}%)
                      </span>
                    </td>
                    <td>
                      <Sparkline
                        series={series}
                        width={96}
                        height={28}
                        up={up}
                      />
                    </td>
                    <td className="st__rowactions">
                      <button
                        type="button"
                        className="st__remove"
                        aria-label={`Remove ${ticker} from watchlist`}
                        onClick={() => removeTicker(ticker)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
