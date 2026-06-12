import { motion, useReducedMotion } from 'framer-motion';

const streaks = [
  { top: '22%', duration: 13, delay: 0, magenta: false },
  { top: '41%', duration: 17, delay: 2.5, magenta: true },
  { top: '58%', duration: 15, delay: 1.2, magenta: false },
  { top: '74%', duration: 19, delay: 3.4, magenta: true },
];

/**
 * Motion backdrop for the hero: a faint film-sprocket grid, drifting neon
 * light streaks, and two breathing glow orbs. Falls back to a static field
 * when the visitor prefers reduced motion.
 */
export function HeroBackdrop() {
  const reduce = useReducedMotion();

  return (
    <>
      <div className="idx-hero__bg" />

      <svg
        className="idx-hero__grid"
        aria-hidden="true"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="idx-sprockets"
            width="34"
            height="34"
            patternUnits="userSpaceOnUse"
          >
            <rect
              x="11"
              y="11"
              width="12"
              height="12"
              rx="2"
              fill="none"
              stroke="var(--line)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#idx-sprockets)" />
      </svg>

      <div className="idx-hero__streaks" aria-hidden="true">
        {streaks.map((s, i) => (
          <motion.span
            key={i}
            className={`idx-streak${s.magenta ? ' idx-streak--magenta' : ''}`}
            style={{ top: s.top }}
            initial={reduce ? false : { x: '-12%', opacity: 0 }}
            animate={
              reduce
                ? undefined
                : { x: ['-12%', '12%'], opacity: [0, 0.34, 0] }
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
        className="idx-glow idx-glow--cyan"
        aria-hidden="true"
        animate={
          reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.22, 0.32, 0.22] }
        }
        transition={
          reduce ? undefined : { duration: 11, repeat: Infinity, ease: 'easeInOut' }
        }
      />
      <motion.div
        className="idx-glow idx-glow--magenta"
        aria-hidden="true"
        animate={
          reduce ? undefined : { scale: [1, 1.16, 1], opacity: [0.18, 0.28, 0.18] }
        }
        transition={
          reduce
            ? undefined
            : { duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }
        }
      />
    </>
  );
}
