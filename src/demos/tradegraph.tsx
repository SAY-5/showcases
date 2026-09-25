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
  ownershipSteps,
  periods,
  type ExposureLine,
  type LineageNode,
} from './tradegraph/graph';
import { renderExposure } from './tradegraph/sparql';
import { useGraph } from './tradegraph/state';

// In-browser tradegraph: a port of the repository's query layer over a cut of
// its committed sample. Exposure is one aggregate query (exposure.rq). The
// fund's ultimate parent is found with a bounded subsidiaryOf path and a FILTER
// NOT EXISTS on the root, every fund in that family is a holder, the issuer and
// its subsidiaries within the depth budget are the issuing entities, and the
// positions of one reporting period (the latest on or before as_of) are grouped
// by holder, issuing entity and instrument. A line that is both affiliate and
// subsidiary counts once, on the affiliate leg, so the three legs add up to the
// total. Depth honours the API caps: exposure at most 4, lineage at most 5.
//
// Every count and total on the page is computed here over the cut. The
// reference totals, lineage counts, data quality line and cost guard line are
// the README's make demo block, parsed by extract-slice.mjs and labelled with
// the commit and store of that run. The SPARQL is the API's own template, byte
// for byte, filled with the API's clause builders. No latency is quoted: the
// README times an API against a store and this page times function calls.

const PRESETS = [
  { label: 'T. Rowe Price to Apple', fund: '0001113169', issuer: '0000320193' },
  { label: 'BlackRock to Meta', fund: '0002012383', issuer: '0001326801' },
  { label: 'Invesco to Apple', fund: '0000914208', issuer: '0000320193' },
  { label: 'TPG to Nu Holdings', fund: '0001880661', issuer: '0001691493' },
];

const ease = [0.22, 1, 0.36, 1] as const;
const USD = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('en-US');
const DATE = /(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?)/g;

function money(value: number): string {
  return `$${USD.format(Math.round(value))}`;
}

function signed(value: number): string {
  return `${value < 0 ? '-' : '+'}${money(Math.abs(value))}`;
}

function count(value: number): string {
  return NUM.format(value);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

function short(commit: string): string {
  return commit.slice(0, 7);
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

/** QueryGuard.depth's message; ApiExceptionHandler returns it as the detail of a 422 problem detail. */
function refusalDetail(what: string, requested: number, max: number): string {
  return `${what} depth ${requested} is above the configured maximum of ${max}`;
}

/** Dates and timestamps kept on one line, so a narrow column never splits 2024-06-30. */
function Dates({ text }: { text: string }) {
  return (
    <>
      {text.split(DATE).map((part, i) => (i % 2 === 1 ? <span key={i} className="tg__nowrap">{part}</span> : part))}
    </>
  );
}

interface Refusal {
  what: 'exposure' | 'lineage';
  requested: number;
  max: number;
}

function Steps({
  label,
  cap,
  value,
  onChange,
  onRefuse,
}: {
  label: string;
  cap: number;
  value: number;
  onChange: (value: number) => void;
  onRefuse: (value: number) => void;
}) {
  return (
    <div className="tg__depth">
      <span className="tg__label">{label}, at most {cap}</span>
      <div className="tg__steps" role="group" aria-label={label}>
        {Array.from({ length: cap }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            className={`tg__step-btn${value === d ? ' tg__step-btn--on' : ''}`}
            aria-pressed={value === d}
            onClick={() => onChange(d)}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className="tg__step-btn tg__step-btn--refused"
          aria-pressed={false}
          aria-label={`${label} ${cap + 1}, refused by the API`}
          onClick={() => onRefuse(cap + 1)}
        >
          {cap + 1}
        </button>
      </div>
    </div>
  );
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
  const [asOf, setAsOf] = useState<string | null>(null);
  const [refused, setRefused] = useState<Refusal | null>(null);
  const [lineIndex, setLineIndex] = useState<number | null>(null);
  const [sparqlView, setSparqlView] = useState<'rendered' | 'template'>('rendered');

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
    () => (store ? exposure(store, fund, issuer, { includeAffiliates, includeSubsidiaries, depth, asOf }) : null),
    [store, fund, issuer, includeAffiliates, includeSubsidiaries, depth, asOf],
  );
  const weighted = useMemo(
    () => (store
      ? exposure(store, fund, issuer, { includeAffiliates, includeSubsidiaries, depth, asOf, weighted: true })
      : null),
    [store, fund, issuer, includeAffiliates, includeSubsidiaries, depth, asOf],
  );
  const allPeriods = useMemo(() => (store ? periods(store) : []), [store]);
  const otherPeriod = answer ? allPeriods.find((p) => p !== answer.asOf) ?? null : null;
  const other = useMemo(
    () => (store && otherPeriod
      ? exposure(store, fund, issuer, { includeAffiliates, includeSubsidiaries, depth, asOf: otherPeriod })
      : null),
    [store, fund, issuer, includeAffiliates, includeSubsidiaries, depth, otherPeriod],
  );
  const tree = useMemo(() => (store ? lineage(store, issuer, lineageDepth) : null), [store, issuer, lineageDepth]);
  const sparql = useMemo(
    () => (store && answer
      ? renderExposure(
        { prefixes: store.source.queries.files.prefixes.text, exposure: store.source.queries.files.exposure.text },
        fund, issuer, includeAffiliates, includeSubsidiaries, depth, answer.asOf,
      )
      : ''),
    [store, answer, fund, issuer, includeAffiliates, includeSubsidiaries, depth],
  );

  const choose = (nextFund: string, nextIssuer: string) => {
    setFund(nextFund);
    setIssuer(nextIssuer);
    setLineIndex(null);
  };
  const reset = () => {
    choose(PRESETS[0].fund, PRESETS[0].issuer);
    setIncludeAffiliates(true);
    setIncludeSubsidiaries(true);
    setDepth(EXPOSURE_MAX_DEPTH);
    setLineageDepth(MAX_DEPTH);
    setAsOf(null);
    setRefused(null);
    setSparqlView('rendered');
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

  const source = store.source;
  const reference = source.readme.pairs.find((p) => p.fund === fund && p.issuer === issuer) ?? null;
  const latest = allPeriods[0] ?? null;
  const comparable = defaults && answer.asOf === latest;
  const matches = reference !== null && comparable && Math.round(answer.totalValue) === reference.total;
  const readmeLineage = lineageDepth === MAX_DEPTH ? source.readme.lineage.find((l) => l.entity === issuer) ?? null : null;
  const readmeList = source.readme.pairs.map((p) => money(p.total)).reduce((text, item, i, list) => (
    i === 0 ? item : `${text}${i === list.length - 1 ? ' and ' : ', '}${item}`
  ), '');
  const focused = lineIndex !== null && answer.byInstrument[lineIndex] ? answer.byInstrument[lineIndex] : longestLine(answer);
  const shown = focused ? answer.byInstrument.indexOf(focused) : -1;
  const steps = focused ? ownershipSteps(store, focused.lineagePath) : [];
  const weight = steps.reduce((product, step) => product * step.fraction, 1);
  const hot = new Set(answer.byInstrument.map((l) => l.issuerEntity.id));
  const reach = includeSubsidiaries ? answer.maxDepth : 0;
  const legs = [
    { label: 'direct', key: 'direct', value: answer.directValue },
    { label: 'through subsidiaries', key: 'subsidiaries', value: answer.viaSubsidiariesValue },
    { label: 'through affiliates', key: 'affiliates', value: answer.viaAffiliatesValue },
  ];
  const [early, late] = other && otherPeriod && answer.asOf !== null && answer.asOf < otherPeriod
    ? [answer, other]
    : [other, answer];

  return (
    <div className="demo" aria-label="tradegraph exposure query">
      <span className="demo__tag">Ownership graph</span>
      <h3 className="demo__title">tradegraph</h3>
      <p className="demo__lede">
        Exposure of a fund family to an issuer, answered by one aggregate query over holdings, subsidiary
        lists and family links. The query climbs to the fund&apos;s ultimate parent, takes every fund in that
        family as a holder, takes the issuer and its subsidiaries as issuing entities, and groups the
        positions of one reporting period. The four pairs of the README&apos;s make demo block reproduce to
        the dollar: {readmeList}, the last reaching Nu Holdings only through Nu Finance Corp. Issuer and fund
        manager identities in the sample are real (SEC company_tickers.json); holdings, subsidiaries and
        values are synthetic and deterministic, from etl/sample, and are not market data.
      </p>
      <p className="tg__source">
        {`Counted in this page: ${count(store.entities.size)} entities and ${count(store.positions.length)} positions `}
        {`over both reporting periods, cut by extract-slice.mjs from the repository's browser slice, itself `}
        {`${count(source.manifest.counts.entities)} of ${count(source.manifest.full.entities)} entities and `}
        {`${count(source.manifest.counts.positions)} of ${count(source.manifest.full.positions)} positions in the full sample `}
        {`(${source.manifest.file} at commit ${short(source.commit)}). Reference totals are the README's make demo block, `}
        {`captured at commit ${source.readme.capturedAt} on ${source.readme.store} and written from ${source.demoSummary.file} `}
        {`(${source.demoSummary.provenance.host}, `}
        <Dates text={source.demoSummary.provenance.measuredAt} />
        ).
      </p>

      <section className="tg__panel" aria-label="Query">
        <div className="tg__panel-head">
          Query
          <span className="tg__panel-count">
            {`${count(store.entities.size)} entities, ${count(store.positions.length)} positions, as of `}
            <span className="tg__nowrap">{answer.asOf ?? 'no period'}</span>
            {', computed here'}
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
            <span className="tg__label">as of, reporting period</span>
            <div className="tg__steps" role="group" aria-label="reporting period">
              {allPeriods.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`tg__step-btn${answer.asOf === p ? ' tg__step-btn--on' : ''}`}
                  aria-pressed={answer.asOf === p}
                  onClick={() => {
                    setAsOf(p);
                    setLineIndex(null);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Steps
            label="exposure depth"
            cap={EXPOSURE_MAX_DEPTH}
            value={depth}
            onChange={(d) => {
              setDepth(d);
              setRefused(null);
              setLineIndex(null);
            }}
            onRefuse={(d) => setRefused({ what: 'exposure', requested: d, max: EXPOSURE_MAX_DEPTH })}
          />
          <Steps
            label="lineage depth"
            cap={MAX_DEPTH}
            value={lineageDepth}
            onChange={(d) => {
              setLineageDepth(d);
              setRefused(null);
            }}
            onRefuse={(d) => setRefused({ what: 'lineage', requested: d, max: MAX_DEPTH })}
          />
        </div>
        {refused && (
          <p className="tg__refusal" role="status" data-testid="tg-refusal">
            {`The API answers 422 with the detail "${refusalDetail(refused.what, refused.requested, refused.max)}" `}
            {`(QueryGuard.depth, returned by ApiExceptionHandler as an RFC 9457 problem detail). `}
            {`This page keeps ${refused.what} depth at ${refused.max}.`}
          </p>
        )}
      </section>

      <div className="tg__grid">
        <section className="tg__panel" aria-label="Exposure">
          <div className="tg__panel-head">
            Exposure
            <span className="tg__panel-count" data-testid="tg-facts">
              {`${plural(answer.positions, 'position')}, ${plural(answer.byInstrument.length, 'line')}, ${plural(answer.byHolder.length, 'holder')}`}
            </span>
          </div>
          <div className="tg__total" aria-live="polite" data-testid="tg-total">{money(answer.totalValue)}</div>
          <div className={`tg__ref${matches ? ' tg__ref--match' : ''}`} data-testid="tg-ref">
            {reference
              ? comparable
                ? `README block at ${source.readme.capturedAt} on ${source.readme.store}: ${money(reference.total)}, ${matches ? 'matches' : 'differs'}`
                : `README block at ${source.readme.capturedAt}: ${money(reference.total)} as of ${latest} with both toggles on at depth ${EXPOSURE_MAX_DEPTH}`
              : 'pair outside the README block'}
          </div>
          {early && late && (
            <div className="tg__quarters" data-testid="tg-quarters">
              <span className="tg__nowrap">{early.asOf}</span> {money(early.totalValue)}, <span className="tg__nowrap">{late.asOf}</span> {money(late.totalValue)},
              {' '}change {signed(late.totalValue - early.totalValue)}, computed here
            </div>
          )}
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
            <dd>{plural(answer.longestPath, 'hop')}</dd>
          </dl>
        </section>

        <section className="tg__panel" aria-label="Lineage path">
          <div className="tg__panel-head">
            {lineIndex === null ? 'Longest path' : 'Selected path'}
            <span className="tg__panel-count">{focused ? plural(focused.pathLength, 'hop') : 'no path'}</span>
          </div>
          {focused ? (
            <>
              <div className="tg__path" key={`${fund} ${issuer} ${includeAffiliates} ${includeSubsidiaries} ${depth} ${asOf} ${lineIndex}`}>
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
              <p className="tg__own" data-testid="tg-ownership">
                {steps.length === 0
                  ? 'ownership weight 1.00: no lineage hop on this path'
                  : `ownership weight ${weight.toFixed(2)}: ${steps
                    .map((s) => `${s.name} ${s.fraction.toFixed(2)}${s.disclosed ? ' disclosed' : ' assumed'}`)
                    .join(', ')}`}
              </p>
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
                      {instrumentLabel(line)} issued by {line.issuerEntity.name}, {plural(line.pathLength, 'hop')},{' '}
                      {line.direct ? 'direct' : line.viaAffiliate ? 'through an affiliate' : 'through a subsidiary'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="tg__panel tg__panel--below" aria-label="SPARQL the API renders">
        <div className="tg__panel-head">
          SPARQL the API renders
          <span className="tg__panel-count">
            {`${source.queries.files.exposure.file} at commit ${short(source.commit)}, sha256 ${source.queries.files.exposure.sha256.slice(0, 12)}`}
          </span>
        </div>
        <div className="tg__steps" role="group" aria-label="query text">
          <button
            type="button"
            className={`tg__step-btn${sparqlView === 'rendered' ? ' tg__step-btn--on' : ''}`}
            aria-pressed={sparqlView === 'rendered'}
            onClick={() => setSparqlView('rendered')}
          >
            rendered for this answer
          </button>
          <button
            type="button"
            className={`tg__step-btn${sparqlView === 'template' ? ' tg__step-btn--on' : ''}`}
            aria-pressed={sparqlView === 'template'}
            onClick={() => setSparqlView('template')}
          >
            template, byte for byte
          </button>
        </div>
        <pre className="tg__sparql" data-testid="tg-sparql" data-view={sparqlView}>
          {sparqlView === 'rendered' ? sparql : source.queries.files.exposure.text}
        </pre>
        <p className="tg__fine">
          {`${source.queries.directory}/${source.queries.files.exposure.file} is the template QueryTemplates.render fills, `}
          {`with ${source.queries.files.prefixes.file} prepended; the rendered text substitutes the fund, the issuer, the depth and `}
          {`the reporting period the way ExposureService.holderClause, issuerClause and SparqlValues do `}
          {`(a port of the repository's web/src/graph/sparql.ts). In the repository, etl/ (Python) writes entities.nt, `}
          {`positions.nt and ontology.nt and loads them over the Graph Store Protocol into Apache Jena Fuseki or Stardog, `}
          {`and api/ (Spring Boot) sends this query over the SPARQL 1.1 Protocol. This page does not evaluate SPARQL: `}
          {`graph.ts walks the same hops in TypeScript over the cut.`}
        </p>
      </section>

      <section className="tg__panel tg__panel--below" aria-label="Issuer lineage">
        <div className="tg__panel-head">
          Issuer lineage
          <span className="tg__panel-count" data-testid="tg-lineage-meta">
            {`${plural(tree.descendantCount, 'subsidiary', 'subsidiaries')} within ${tree.maxDepth} levels, deepest ${tree.deepestLevel}, computed here`}
            {readmeLineage
              ? `; README block at ${source.readme.capturedAt}: ${readmeLineage.descendants} descendants, deepest level ${readmeLineage.deepestLevel}, ${
                readmeLineage.descendants === tree.descendantCount && readmeLineage.deepestLevel === tree.deepestLevel ? 'matches' : 'differs'
              }`
              : ''}
          </span>
        </div>
        <ul className="tg__tree">
          <Branch node={tree.descendants} hot={hot} reach={reach} />
        </ul>
      </section>

      <div className="demo__controls">
        <button type="button" className="demo__btn demo__btn--ghost" onClick={reset}>
          Reset
        </button>
        <span className="demo__hint">
          <Dates
            text={`README block at ${source.readme.capturedAt} on ${source.readme.store}: data quality ${source.readme.quality}; cost guard ${source.readme.costGuard}`}
          />
        </span>
      </div>
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
