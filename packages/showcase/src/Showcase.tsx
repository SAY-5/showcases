import type { ComponentType } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ProjectData } from './types';
import './Showcase.css';

const ease = [0.22, 1, 0.36, 1] as const;

type ShowcaseProps = {
  data: ProjectData;
  Demo: ComponentType;
};

export function Showcase({ data, Demo }: ShowcaseProps) {
  const reduce = useReducedMotion();
  const repoUrl = `https://github.com/SAY-5/${data.name}`;

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18, filter: 'blur(8px)' },
          animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
          transition: { duration: 0.7, delay, ease },
        };

  const onScroll = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-80px' },
          transition: { duration: 0.6, delay, ease },
        };

  return (
    <div className="sc">
      <header className="sc-hero">
        <div className="sc-hero__bg" aria-hidden="true" />
        <div className="sc-hero__inner">
          <motion.span className="sc-hero__eyebrow mono" {...rise(0.05)}>
            {data.category}
          </motion.span>
          <motion.h1 className="sc-hero__title" {...rise(0.12)}>
            {data.title}
          </motion.h1>
          <motion.p className="sc-hero__tagline" {...rise(0.22)}>
            {data.tagline}
          </motion.p>
          <motion.div className="sc-hero__actions" {...rise(0.34)}>
            <a className="sc-btn sc-btn--primary" href="#demo">
              See the demo
            </a>
            <a
              className="sc-btn sc-btn--ghost"
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
            </a>
          </motion.div>
        </div>
      </header>

      <main>
        <motion.section id="demo" className="sc-section sc-demo" {...onScroll()}>
          <div className="sc-section__head">
            <span className="sc-kicker mono">Interactive demo</span>
            <p className="sc-demo__concept">{data.demoConcept}</p>
          </div>
          <div className="sc-demo__frame">
            <Demo />
          </div>
        </motion.section>

        <motion.section id="how" className="sc-section sc-how" {...onScroll()}>
          <div className="sc-section__head">
            <span className="sc-kicker mono">How it works</span>
            <p className="sc-how__summary">{data.summary}</p>
          </div>
          <ul className="sc-highlights">
            {data.highlights.map((h, i) => (
              <motion.li className="sc-highlight" key={i} {...onScroll(i * 0.04)}>
                <span className="sc-highlight__num mono">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="sc-highlight__text">{h}</span>
              </motion.li>
            ))}
          </ul>
          <div className="sc-stack">
            {data.stack.map((s) => (
              <span className="sc-chip mono" key={s}>
                {s}
              </span>
            ))}
          </div>
        </motion.section>
      </main>

      <footer className="sc-footer">
        <div className="sc-footer__inner">
          <div>
            <p className="sc-footer__title">{data.title}</p>
            <p className="sc-footer__cat mono">{data.category}</p>
          </div>
          <a
            className="sc-btn sc-btn--ghost"
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
        </div>
        <p className="sc-footer__note">
          A single-page demo built from the project itself. Everything on this
          page runs in the browser.
        </p>
      </footer>
    </div>
  );
}
