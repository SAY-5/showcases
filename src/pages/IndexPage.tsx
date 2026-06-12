import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { projects } from '../data/projects';
import { HeroBackdrop } from './HeroBackdrop';
import './IndexPage.css';

const ease = [0.22, 1, 0.36, 1] as const;

export function IndexPage() {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('All');

  const categories = useMemo(() => {
    const set = new Set(projects.map((p) => p.category));
    return ['All', ...Array.from(set).sort()];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (activeCat !== 'All' && p.category !== activeCat) return false;
      if (!q) return true;
      return [p.title, p.tagline, p.category, p.stack.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, activeCat]);

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease },
        };

  return (
    <div className="idx">
      <header className="idx-hero">
        <HeroBackdrop />
        <div className="idx-hero__inner">
          <motion.span className="idx-hero__eyebrow mono glass" {...rise(0.05)}>
            <span className="idx-hero__dot" aria-hidden="true" />
            Interactive engineering demos
          </motion.span>
          <motion.h1 className="idx-hero__title" {...rise(0.12)}>
            <span className="idx-hero__title-line">Project</span>
            <span className="idx-hero__title-line idx-hero__title-accent">
              Showcases
            </span>
          </motion.h1>
          <motion.p className="idx-hero__tagline" {...rise(0.2)}>
            Every project gets a standalone page with a live, in-browser demo.
            Pick one to open its full showcase.
          </motion.p>
          <motion.div className="idx-hero__stats" {...rise(0.28)}>
            <span className="idx-stat">
              <span className="idx-stat__num">{projects.length}</span>
              <span className="idx-stat__label mono">Projects</span>
            </span>
            <span className="idx-stat">
              <span className="idx-stat__num">{categories.length - 1}</span>
              <span className="idx-stat__label mono">Categories</span>
            </span>
            <span className="idx-stat">
              <span className="idx-stat__num">100%</span>
              <span className="idx-stat__label mono">In browser</span>
            </span>
          </motion.div>
        </div>
      </header>

      <section className="idx-toolbar" aria-label="Filter projects">
        <div className="idx-toolbar__inner">
          <div className="idx-search">
            <div className="idx-search__field">
              <span className="idx-search__icon" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="idx-search__input"
                type="search"
                placeholder="Search by name, stack, or category"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search projects"
              />
            </div>
            <span className="idx-search__count mono">
              <strong>{filtered.length}</strong> of {projects.length}
            </span>
          </div>
          <ul className="idx-cats" aria-label="Categories">
            {categories.map((cat) => (
              <li key={cat}>
                <button
                  type="button"
                  className="idx-cat"
                  aria-pressed={activeCat === cat}
                  onClick={() => setActiveCat(cat)}
                >
                  {cat}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="idx-main">
        <ul className="idx-grid">
          {filtered.map((p, i) => (
            <motion.li
              key={p.name}
              className="idx-card"
              initial={reduce ? false : { opacity: 0, y: 18 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: Math.min(i, 7) * 0.04, ease }}
            >
              <Link className="idx-card__link" to={`/${p.name}`}>
                <span className="idx-card__cat mono">{p.category}</span>
                <span className="idx-card__title">{p.title}</span>
                <span className="idx-card__tagline">{p.tagline}</span>
                <span className="idx-card__stack mono">
                  {p.stack.slice(0, 4).join(' / ')}
                </span>
                <span className="idx-card__cta mono">
                  Open showcase
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
        {filtered.length === 0 && (
          <p className="idx-empty mono">No projects match those filters.</p>
        )}
      </main>

      <footer className="idx-footer">
        <p className="idx-footer__note mono">
          Each page runs its demo entirely in the browser.
        </p>
      </footer>
    </div>
  );
}
