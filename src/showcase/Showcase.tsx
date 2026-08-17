import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { ProjectData } from './types';
import Arrow from './Arrow';
import GitHubIcon from './GitHubIcon';
import { portfolioWriteup, repoUrl } from './links';
import { useDocumentTitle } from './useDocumentTitle';
import './Showcase.css';

const ease = [0.22, 1, 0.36, 1] as const;

type Neighbour = Pick<ProjectData, 'name' | 'title'>;

type ShowcaseProps = {
  data: ProjectData;
  Demo: ComponentType;
  /** 1-based catalog position in the dataset. */
  number: number;
  prev?: Neighbour | null;
  next?: Neighbour | null;
  homeHref?: string;
};

const pad = (n: number) => String(n).padStart(3, '0');

export function Showcase({
  data,
  Demo,
  number,
  prev = null,
  next = null,
  homeHref = '/',
}: ShowcaseProps) {
  const reduce = useReducedMotion();
  useDocumentTitle(data.title);

  const github = repoUrl(data.name);
  const writeup = portfolioWriteup(data.name);

  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
  };

  return (
    <article className="detail">
      <div className="wrap">
        <Link to={homeHref} className="detail__back">
          <Arrow dir="left" size={13} /> Index
        </Link>

        <motion.header
          className="detail__head"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        >
          <motion.p className="detail__meta" variants={item}>
            <span className="detail__idx mono num">{pad(number)}</span>
            <span className="detail__dot" aria-hidden="true" />
            <span>{data.language}</span>
            <span className="detail__dot" aria-hidden="true" />
            <span>{data.category}</span>
            {data.isFlagship && (
              <>
                <span className="detail__dot" aria-hidden="true" />
                <span className="detail__flag">Selected</span>
              </>
            )}
          </motion.p>
          <motion.h1 className="detail__title" variants={item}>
            {data.title}
          </motion.h1>
          <motion.p className="detail__tagline" variants={item}>
            {data.tagline}
          </motion.p>
          <motion.div className="detail__links" variants={item}>
            <a className="btn btn--solid" href="#demo">
              Jump to the demo <Arrow className="btn__arrow" />
            </a>
            <a
              className="tlink detail__gh"
              href={github}
              target="_blank"
              rel="noreferrer"
            >
              <GitHubIcon size={13} /> SAY-5/{data.name}
            </a>
          </motion.div>
        </motion.header>

        <section
          id="demo"
          className="detail__demo surface"
          aria-label="Interactive demo"
        >
          <div className="detail__demo-band">
            <Demo />
          </div>
        </section>

        <div className="detail__body">
          <div className="detail__main">
            <section className="detail__section">
              <h2 className="detail__h2">What it is</h2>
              <p className="detail__summary">{data.summary}</p>
            </section>

            <section className="detail__section">
              <h2 className="detail__h2">Notes</h2>
              <ul className="detail__highlights">
                {data.highlights.map((h, i) => (
                  <li key={i} className="detail__highlight">
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="detail__aside surface">
            <div className="detail__panel">
              <h2 className="detail__panel-title">Stack</h2>
              <p className="detail__stack">{data.stack.join(', ')}</p>
            </div>
            <div className="detail__panel">
              <h2 className="detail__panel-title">Links</h2>
              <a
                className="detail__link-row"
                href={github}
                target="_blank"
                rel="noreferrer"
              >
                <GitHubIcon size={13} /> Source on GitHub
              </a>
              <a className="detail__link-row" href={writeup}>
                <Arrow size={13} /> Portfolio write-up
              </a>
            </div>
          </aside>
        </div>

        <nav className="detail__nav" aria-label="Project navigation">
          {prev ? (
            <Link to={`/${prev.name}`} className="detail__nav-link">
              <span className="detail__nav-dir">
                <Arrow dir="left" size={12} /> Previous
              </span>
              <span className="detail__nav-name">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to={`/${next.name}`}
              className="detail__nav-link detail__nav-link--next"
            >
              <span className="detail__nav-dir">
                Next <Arrow dir="right" size={12} />
              </span>
              <span className="detail__nav-name">{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </article>
  );
}
