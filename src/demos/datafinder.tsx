import '../styles/demo.css';
import './datafinder.css';
import { money } from './datafinder/data';
import {
  currentResult,
  setMaxPrice,
  setMinPrice,
  setMinRating,
  setPage,
  setSort,
  setText,
  toggleCategory,
  toggleTag,
} from './datafinder/store';
import {
  SORT_LABELS,
  SORT_MODES,
  type FacetCount,
} from './datafinder/types';
import { useStore } from './datafinder/state';

// One facet row: a checkbox labelled with its value and the live count of
// records that selecting it would yield, given the other active filters. A
// value with a zero count is disabled so the user cannot reach an empty set.
function FacetRow({
  facet,
  onToggle,
}: {
  facet: FacetCount;
  onToggle: (value: string) => void;
}) {
  return (
    <li className="dfx__facet">
      <label
        className={`dfx__facet-label${facet.count === 0 && !facet.selected ? ' dfx__facet-label--empty' : ''}`}
      >
        <input
          type="checkbox"
          className="dfx__facet-box"
          checked={facet.selected}
          disabled={facet.count === 0 && !facet.selected}
          onChange={() => onToggle(facet.value)}
        />
        <span className="dfx__facet-value">{facet.value}</span>
        <span className="dfx__facet-count" aria-label={`${facet.count} records`}>
          {facet.count}
        </span>
      </label>
    </li>
  );
}

// DataFinder is a fully in-browser faceted catalog explorer. The user types a
// query, the engine filters and scores the seeded catalog, and the results
// grid renders a page of hits with sort and pagination. Facets, the detail
// panel, and saved views layer on in later steps. All state lives in the
// external store; this component only reads a snapshot and dispatches actions.

export default function DatafinderDemo() {
  const { query } = useStore();
  const result = currentResult();

  return (
    <div className="demo" aria-label="datafinder faceted catalog explorer">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Find it by facet</h3>
      <p className="demo__lede">
        Search the catalog by text, then narrow by category, tag, price, and
        rating. Results sort and paginate live, and a useful filter set can be
        saved as a named view and recalled later. Everything runs in the
        browser over a static seed with no server and no eval.
      </p>

      <div className="dfx">
        <aside className="dfx__sidebar glass" aria-label="filters">
          <fieldset className="dfx__group">
            <legend className="dfx__group-title">Category</legend>
            <ul className="dfx__facets">
              {result.categoryFacets.map((f) => (
                <FacetRow key={f.value} facet={f} onToggle={toggleCategory} />
              ))}
            </ul>
          </fieldset>

          <fieldset className="dfx__group">
            <legend className="dfx__group-title">Tags</legend>
            <ul className="dfx__facets">
              {result.tagFacets.map((f) => (
                <FacetRow key={f.value} facet={f} onToggle={toggleTag} />
              ))}
            </ul>
          </fieldset>

          <fieldset className="dfx__group">
            <legend className="dfx__group-title">
              Price: {money(query.minPrice)} to {money(query.maxPrice)}
            </legend>
            <label className="dfx__range">
              <span className="dfx__range-label">Min price</span>
              <input
                type="range"
                className="dfx__range-input"
                min={result.priceBounds.min}
                max={result.priceBounds.max}
                step={1}
                value={query.minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                aria-label="Minimum price"
              />
            </label>
            <label className="dfx__range">
              <span className="dfx__range-label">Max price</span>
              <input
                type="range"
                className="dfx__range-input"
                min={result.priceBounds.min}
                max={result.priceBounds.max}
                step={1}
                value={query.maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                aria-label="Maximum price"
              />
            </label>
          </fieldset>

          <fieldset className="dfx__group">
            <legend className="dfx__group-title">
              Minimum rating: {query.minRating.toFixed(1)}
            </legend>
            <label className="dfx__range">
              <span className="dfx__visually-hidden">Minimum rating</span>
              <input
                type="range"
                className="dfx__range-input"
                min={0}
                max={5}
                step={0.5}
                value={query.minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                aria-label="Minimum rating"
              />
            </label>
          </fieldset>
        </aside>

        <section className="dfx__main" aria-label="search results">
          <div className="dfx__searchbar">
            <label className="dfx__search-field">
              <span className="dfx__visually-hidden">Search the catalog</span>
              <input
                type="search"
                className="dfx__search-input"
                placeholder="Search by name or tag, e.g. usb-c monitor"
                value={query.text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Search the catalog"
              />
            </label>
            <label className="dfx__sort">
              <span className="dfx__sort-label">Sort</span>
              <select
                className="dfx__sort-select"
                value={query.sort}
                onChange={(e) =>
                  setSort(e.target.value as (typeof SORT_MODES)[number])
                }
                aria-label="Sort results"
              >
                {SORT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {SORT_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="dfx__count" role="status" aria-live="polite">
            {result.total === 0
              ? 'No matching records'
              : `${result.total} record${result.total === 1 ? '' : 's'} found`}
          </p>

          {result.total === 0 ? (
            <p className="dfx__empty">
              Nothing matches this query. Try removing a filter or clearing the
              search text.
            </p>
          ) : (
            <ul className="dfx__results" aria-label="result list">
              {result.hits.map((hit) => (
                <li key={hit.record.id} className="dfx__card glass">
                  <div className="dfx__card-head">
                    <h4 className="dfx__card-name">{hit.record.name}</h4>
                    <span className="dfx__card-price">
                      {money(hit.record.price)}
                    </span>
                  </div>
                  <p className="dfx__card-blurb">{hit.record.blurb}</p>
                  <div className="dfx__card-meta">
                    <span className="dfx__chip dfx__chip--cat">
                      {hit.record.category}
                    </span>
                    <span
                      className="dfx__card-rating"
                      aria-label={`rating ${hit.record.rating} out of 5`}
                    >
                      <span aria-hidden="true">★</span>{' '}
                      {hit.record.rating.toFixed(1)}
                    </span>
                    <span className="dfx__card-year">{hit.record.year}</span>
                  </div>
                  <div className="dfx__card-tags">
                    {hit.record.tags.map((t) => (
                      <span key={t} className="dfx__chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {result.pageCount > 1 && (
            <nav className="dfx__pager" aria-label="result pages">
              <button
                type="button"
                className="dfx__page-btn"
                onClick={() => setPage(result.page - 1)}
                disabled={result.page === 0}
              >
                Previous
              </button>
              <span className="dfx__page-status">
                Page {result.page + 1} of {result.pageCount}
              </span>
              <button
                type="button"
                className="dfx__page-btn"
                onClick={() => setPage(result.page + 1)}
                disabled={result.page >= result.pageCount - 1}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
