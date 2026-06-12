import type { ComponentType } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ProjectData } from './types';
import './Showcase.css';

const ease = [0.22, 1, 0.36, 1] as const;

const streaks = [
  { top: '28%', duration: 14, delay: 0, magenta: false },
  { top: '52%', duration: 18, delay: 2.1, magenta: true },
  { top: '71%', duration: 16, delay: 1.4, magenta: false },
];

type ShowcaseProps = {
  data: ProjectData;
  Demo: ComponentType;
  homeHref?: string;
};

export function Showcase({ data, Demo, homeHref = '/' }: ShowcaseProps) {
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
        <div className="sc-hero__streaks" aria-hidden="true">
          {streaks.map((s, i) => (
            <motion.span
              key={i}
              className={`sc-streak${s.magenta ? ' sc-streak--magenta' : ''}`}
              style={{ top: s.top }}
              initial={reduce ? false : { x: '-12%', opacity: 0 }}
              animate={
                reduce ? undefined : { x: ['-12%', '12%'], opacity: [0, 0.32, 0] }
              }
              transition={
                reduce
                  ? undefined
                  : {
                      duration: s.duration,
                      delay: s.delay,
                      repeat: Infinity,
                      ease: 'linear',
                    }
              }
            />
          ))}
        </div>
        <motion.div
          className="sc-hero__glow"
          aria-hidden="true"
          animate={
            reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.22, 0.32, 0.22] }
          }
          transition={
            reduce ? undefined : { duration: 12, repeat: Infinity, ease: 'easeInOut' }
          }
        />

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
          <div className="sc-frame glass">
            <div className="sc-frame__edge" aria-hidden="true" />
            <div className="sc-frame__head">
              <span className="sc-kicker mono">Interactive demo</span>
              <p className="sc-frame__concept">{data.demoConcept}</p>
            </div>
            <div className="sc-frame__stage">
              <Demo />
            </div>
          </div>
        </motion.section>

        <motion.section id="how" className="sc-section sc-how" {...onScroll()}>
          <div className="sc-section__head">
            <span className="sc-kicker mono">How it works</span>
            <p className="sc-how__summary">{data.summary}</p>
          </div>
          <ul className="sc-highlights">
            {data.highlights.map((h, i) => (
              <motion.li className="sc-highlight glass" key={i} {...onScroll(i * 0.04)}>
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
        <a className="sc-footer__home mono" href={homeHref}>
          Back to all projects
        </a>
      </footer>
    </div>
  );
}
