import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { projects } from '../data/projects';
import './IndexPage.css';

const ease = [0.22, 1, 0.36, 1] as const;

export function IndexPage() {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState('');

  const categories = useMemo(() => {
    const set = new Set(projects.map((p) => p.category));
    return Array.from(set).sort();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.title, p.tagline, p.category, p.stack.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

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
        <div className="idx-hero__bg" aria-hidden="true" />
        <div className="idx-hero__inner">
          <motion.span className="idx-hero__eyebrow mono" {...rise(0.05)}>
            {projects.length} interactive demos
          </motion.span>
          <motion.h1 className="idx-hero__title" {...rise(0.12)}>
            Project Showcases
          </motion.h1>
          <motion.p className="idx-hero__tagline" {...rise(0.2)}>
            Every project gets a standalone page with a live, in-browser demo.
            Pick one to open its full showcase.
          </motion.p>
          <motion.div className="idx-search" {...rise(0.3)}>
            <input
              className="idx-search__input"
              type="search"
              placeholder="Search by name, stack, or category"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search projects"
            />
            <span className="idx-search__count mono">
              {filtered.length} of {projects.length}
            </span>
          </motion.div>
          <p className="idx-cats mono">{categories.length} categories</p>
        </div>
      </header>

      <main className="idx-main">
        <ul className="idx-grid">
          {filtered.map((p, i) => (
            <motion.li
              key={p.name}
              className="idx-card"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: Math.min(i, 8) * 0.03, ease }}
            >
              <Link className="idx-card__link" to={`/${p.name}`}>
                <span className="idx-card__cat mono">{p.category}</span>
                <span className="idx-card__title">{p.title}</span>
                <span className="idx-card__tagline">{p.tagline}</span>
                <span className="idx-card__stack mono">
                  {p.stack.slice(0, 4).join(' / ')}
                </span>
                <span className="idx-card__cta mono">Open showcase</span>
              </Link>
            </motion.li>
          ))}
        </ul>
        {filtered.length === 0 && (
          <p className="idx-empty mono">No projects match that search.</p>
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
