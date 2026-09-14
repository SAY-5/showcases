import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './tradegraph.css';
import {
  EXPOSURE_MAX_DEPTH,
  MAX_DEPTH,
  descendantIds,
  exposure,
  lineage,
  longestLine,
  type ExposureLine,
  type LineageNode,
} from './tradegraph/graph';
import { useGraph } from './tradegraph/state';

// In-browser tradegraph: a port of the repository's query layer over a cut of
// its committed sample. Exposure is one aggregate query. The fund's ultimate
// parent is found with a bounded subsidiaryOf path and a FILTER NOT EXISTS on
// the root, every fund in that family is a holder, the issuer and its
// subsidiaries within the depth budget are the issuing entities, and the
// positions of the latest reporting period are grouped by holder, issuing
// entity and instrument. A line that is both affiliate and subsidiary counts
// once, on the affiliate leg, so the three legs add up to the total. Depth
// honours the API caps: exposure at most 4, lineage at most 5.

const PRESETS = [
  { label: 'T. Rowe Price to Apple', fund: '0001113169', issuer: '0000320193', readme: 2_475_300_433 },
  { label: 'BlackRock to Meta', fund: '0002012383', issuer: '0001326801', readme: 1_980_265_856 },
  { label: 'Invesco to Apple', fund: '0000914208', issuer: '0000320193', readme: 1_523_775_489 },
  { label: 'TPG to Nu Holdings', fund: '0001880661', issuer: '0001691493', readme: 4_792_566 },
];

const ease = [0.22, 1, 0.36, 1] as const;
const USD = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function money(value: number): string {
  return `$${USD.format(Math.round(value))}`;
}

function instrumentLabel(line: ExposureLine): string {
  const { instrumentClass, ticker } = line.instrument;
  return ticker ? `${instrumentClass} ${ticker}` : instrumentClass;
}

function hopLabel(line: ExposureLine, hop: string): string {
  if (hop === 'parent') return 'is a subsidiary of';
  if (hop === 'subsidiary') return 'whose subsidiary';
  return `holds ${instrumentLabel(line)}, issued by`;
}

export default function TradegraphDemo() {
  const { store, failed } = useGraph();
  const reduce = useReducedMotion();
  const [fund, setFund] = useState(PRESETS[0].fund);
  const [issuer, setIssuer] = useState(PRESETS[0].issuer);
  const [includeAffiliates, setIncludeAffiliates] = useState(true);
  const [includeSubsidiaries, setIncludeSubsidiaries] = useState(true);
  const [depth, setDepth] = useState(EXPOSURE_MAX_DEPTH);
  const [lineageDepth, setLineageDepth] = useState(MAX_DEPTH);
  const [lineIndex, setLineIndex] = useState<number | null>(null);

  const pickers = useMemo(() => {
    if (!store) return { families: [], issuers: [] };
    const tops = [...store.entities.values()].filter((e) => e.parent === null);
    const members = (id: string) => [id, ...descendantIds(store, id, MAX_DEPTH)];
    const issued = (id: string) => members(id)
      .reduce((sum, m) => sum + (store.issuedBy.get(m) ?? []).reduce((s, p) => s + p.value, 0), 0);
    return {
      families: tops
        .filter((e) => e.kinds.includes('Fund') && members(e.id).some((m) => store.heldBy.has(m)))
        .sort((a, b) => a.name.localeCompare(b.name)),
      issuers: tops
        .filter((e) => e.kinds.includes('Issuer') && issued(e.id) > 0)
        .sort((a, b) => (issued(b.id) - issued(a.id)) || a.name.localeCompare(b.name)),
    };
  }, [store]);

  const answer = useMemo(
    () => (store ? exposure(store, fund, issuer, { includeAffiliates, includeSubsidiaries, depth }) : null),
    [store, fund, issuer, includeAffiliates, includeSubsidiaries, depth],
  );
  const weighted = useMemo(
    () => (store ? exposure(store, fund, issuer, { includeAffiliates, includeSubsidiaries, depth, weighted: true }) : null),
    [store, fund, issuer, includeAffiliates, includeSubsidiaries, depth],
  );
  const tree = useMemo(() => (store ? lineage(store, issuer, lineageDepth) : null), [store, issuer, lineageDepth]);

  const choose = (nextFund: string, nextIssuer: string) => {
    setFund(nextFund);
    setIssuer(nextIssuer);
    setLineIndex(null);
  };
  const preset = PRESETS.find((p) => p.fund === fund && p.issuer === issuer);
  const defaults = includeAffiliates && includeSubsidiaries && depth === EXPOSURE_MAX_DEPTH;

  if (!store || !answer || !weighted || !tree) {
    return (
      <div className="demo" aria-label="tradegraph exposure query">
        <span className="demo__tag">Ownership graph</span>
        <h3 className="demo__title">tradegraph</h3>
        <p className="tg__loading" role="status" aria-live="polite">
          {failed ? 'The graph slice did not load.' : 'Loading the graph slice'}
        </p>
      </div>
    );
  }

  const focused = lineIndex !== null && answer.byInstrument[lineIndex] ? answer.byInstrument[lineIndex] : longestLine(answer);
  const shown = focused ? answer.byInstrument.indexOf(focused) : -1;
  const hot = new Set(answer.byInstrument.map((l) => l.issuerEntity.id));
  const reach = includeSubsidiaries ? answer.maxDepth : 0;
  const legs = [
    { label: 'direct', key: 'direct', value: answer.directValue },
    { label: 'through subsidiaries', key: 'subsidiaries', value: answer.viaSubsidiariesValue },
    { label: 'through affiliates', key: 'affiliates', value: answer.viaAffiliatesValue },
  ];

  return (
    <div className="demo" aria-label="tradegraph exposure query">
      <span className="demo__tag">Ownership graph</span>
      <h3 className="demo__title">tradegraph</h3>
      <p className="demo__lede">
        Exposure of a fund family to an issuer, answered by one aggregate query over holdings, subsidiary
        lists and family links. The query climbs to the fund&apos;s ultimate parent, takes every fund in that
        family as a holder, takes the issuer and its subsidiaries as issuing entities, and groups the latest
        quarter&apos;s positions. The four README pairs reproduce to the dollar, including $4,792,566 that
        reaches Nu Holdings only through Nu Finance Corp.
      </p>

      <section className="tg__panel" aria-label="Query">
        <div className="tg__panel-head">
          Query
          <span className="tg__panel-count">
            {store.entities.size} entities, {store.positions.length} positions, as of {answer.asOf ?? 'no period'}
          </span>
        </div>
        <div className="tg__presets" role="group" aria-label="README exposure pairs">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`tg__chip${p === preset ? ' tg__chip--on' : ''}`}
              aria-pressed={p === preset}
              onClick={() => choose(p.fund, p.issuer)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="tg__pickers">
          <label className="tg__field">
            <span className="tg__label">fund family</span>
            <select className="tg__select" value={fund} onChange={(e) => choose(e.target.value, issuer)}>
              {pickers.families.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="tg__field">
            <span className="tg__label">issuer</span>
            <select className="tg__select" value={issuer} onChange={(e) => choose(fund, e.target.value)}>
              {pickers.issuers.map((e) => (
                <option key={e.id} value={e.id}>{e.ticker ? `${e.name} (${e.ticker})` : e.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="tg__options">
          <label className="tg__toggle">
            <input
              type="checkbox"
              checked={includeAffiliates}
              onChange={(e) => {
                setIncludeAffiliates(e.target.checked);
                setLineIndex(null);
              }}
            />
            affiliates in the family
          </label>
          <label className="tg__toggle">
            <input
              type="checkbox"
              checked={includeSubsidiaries}
              onChange={(e) => {
                setIncludeSubsidiaries(e.target.checked);
                setLineIndex(null);
              }}
            />
            issuer subsidiaries
          </label>
          <div className="tg__depth">
            <span className="tg__label">exposure depth, at most {EXPOSURE_MAX_DEPTH}</span>
            <div className="tg__steps" role="group" aria-label="exposure depth">
              {Array.from({ length: EXPOSURE_MAX_DEPTH }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`tg__step-btn${depth === d ? ' tg__step-btn--on' : ''}`}
                  aria-pressed={depth === d}
                  onClick={() => {
                    setDepth(d);
                    setLineIndex(null);
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="tg__depth">
            <span className="tg__label">lineage depth, at most {MAX_DEPTH}</span>
            <div className="tg__steps" role="group" aria-label="lineage depth">
              {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`tg__step-btn${lineageDepth === d ? ' tg__step-btn--on' : ''}`}
                  aria-pressed={lineageDepth === d}
                  onClick={() => setLineageDepth(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="tg__grid">
        <section className="tg__panel" aria-label="Exposure">
          <div className="tg__panel-head">
            Exposure
            <span className="tg__panel-count">
              {answer.positions} positions, {answer.byInstrument.length} lines, {answer.byHolder.length} holders
            </span>
          </div>
          <div className="tg__total" aria-live="polite" data-testid="tg-total">{money(answer.totalValue)}</div>
          <div className={`tg__ref${preset && defaults && Math.round(answer.totalValue) === preset.readme ? ' tg__ref--match' : ''}`}>
            {preset
              ? defaults
                ? `README ${money(preset.readme)}, ${Math.round(answer.totalValue) === preset.readme ? 'matches' : 'differs'}`
                : `README ${money(preset.readme)} with both toggles on at depth ${EXPOSURE_MAX_DEPTH}`
              : 'pair outside the README block'}
          </div>
          <ul className="tg__legs">
            {legs.map((leg) => (
              <li key={leg.key} className="tg__leg">
                <span className="tg__leg-label">{leg.label}</span>
                <span className="tg__leg-val">{money(leg.value)}</span>
                <span className="tg__bar" aria-hidden="true">
                  <span
                    className={`tg__bar-fill tg__bar-fill--${leg.key}`}
                    style={{ width: `${answer.totalValue > 0 ? (leg.value / answer.totalValue) * 100 : 0}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <dl className="tg__kv">
            <dt>ownership weighted</dt>
            <dd className="tg__kv-accent" data-testid="tg-weighted">{money(weighted.totalValue)}</dd>
            <dt>longest path</dt>
            <dd>{answer.longestPath} hops</dd>
          </dl>
        </section>

        <section className="tg__panel" aria-label="Lineage path">
          <div className="tg__panel-head">
            {lineIndex === null ? 'Longest path' : 'Selected path'}
            <span className="tg__panel-count">{focused ? `${focused.pathLength} hops` : 'no path'}</span>
          </div>
          {focused ? (
            <>
              <div className="tg__path" key={`${fund} ${issuer} ${includeAffiliates} ${includeSubsidiaries} ${depth} ${lineIndex}`}>
                {focused.lineagePath.map((step, i) => (
                  <motion.span
                    key={`${step.id}-${i}`}
                    className="tg__hopwrap"
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.1, ease }}
                  >
                    {step.hop !== 'start' && <span className="tg__hop">{hopLabel(focused, step.hop)}</span>}
                    <span className={`tg__node-chip tg__node-chip--${step.hop}`}>{step.name}</span>
                  </motion.span>
                ))}
              </div>
              <p className="tg__sentence" data-testid="tg-sentence">{focused.explanation}</p>
            </>
          ) : (
            <p className="tg__empty">No position connects this family to this issuer under these options.</p>
          )}
          {answer.byInstrument.length > 0 && (
            <ul className="tg__lines">
              {answer.byInstrument.map((line, i) => (
                <li key={`${line.holder.id} ${line.issuerEntity.id} ${line.instrument.cusip}`}>
                  <button
                    type="button"
                    className={`tg__line${i === shown ? ' tg__line--on' : ''}`}
                    aria-pressed={i === shown}
                    onClick={() => setLineIndex(i)}
                  >
                    <span className="tg__line-holder">{line.holder.name}</span>
                    <span className="tg__line-val">{money(line.value)}</span>
                    <span className="tg__line-meta">
                      {instrumentLabel(line)} issued by {line.issuerEntity.name}, {line.pathLength} hops,{' '}
                      {line.direct ? 'direct' : line.viaAffiliate ? 'through an affiliate' : 'through a subsidiary'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="tg__panel tg__panel--lineage" aria-label="Issuer lineage">
        <div className="tg__panel-head">
          Issuer lineage
          <span className="tg__panel-count">
            {tree.descendantCount} subsidiaries within {tree.maxDepth} levels, deepest {tree.deepestLevel}
          </span>
        </div>
        <ul className="tg__tree">
          <Branch node={tree.descendants} hot={hot} reach={reach} />
        </ul>
      </section>
    </div>
  );
}

function Branch({ node, hot, reach }: { node: LineageNode; hot: Set<string>; reach: number }) {
  const holds = hot.has(node.id);
  const out = node.depth > reach && !holds;
  const cls = node.depth === 0 ? ' tg__leaf--root' : holds ? ' tg__leaf--hot' : out ? ' tg__leaf--out' : '';
  return (
    <li>
      <div className={`tg__leaf${cls}`}>
        <span className="tg__leaf-name">{node.name}</span>
        {node.depth > 0 && (
          <span className="tg__leaf-tag">
            level {node.depth}
            {holds ? ', issues held positions' : out ? ', past the exposure depth' : ''}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <Branch key={child.id} node={child} hot={hot} reach={reach} />
          ))}
        </ul>
      )}
    </li>
  );
}
