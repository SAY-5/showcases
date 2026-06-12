import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './gradeview.css';
import { SKILLS, WEEKS } from './gradeview/data';
import {
  attemptsInRange,
  changePoint,
  classBands,
  CHANGE_THRESHOLD,
} from './gradeview/compute';
import { CHART, bandEdges, bandPath, innerH, linePath, xAt, yAt } from './gradeview/chart';
import { setSkill, useViewState } from './gradeview/state';

// Real numbers from the project: the class-trend query over a seeded
// 576000-attempt-row dataset (300 learners, 20 weeks) has a median time of
// 94.57 ms across seven runs on a GitHub Actions ubuntu-latest runner with
// Postgres 16, and a bench-regress CI job fails on more than 30 percent drift.
const ROWS = 576_000;
const QUERY_MS = 94.57;
const DRIFT_GATE = 30;
const ease = [0.22, 1, 0.36, 1] as const;

export default function GradeviewDemo() {
  const reduce = useReducedMotion();
  const view = useViewState();
  const skill = SKILLS.find((s) => s.key === view.skill) ?? SKILLS[0];

  const bands = useMemo(() => classBands(skill.key), [skill.key]);
  const drop = useMemo(() => changePoint(skill.key), [skill.key]);
  const attempts = useMemo(() => attemptsInRange(skill.key, view.range), [skill.key, view.range]);

  const median = bands.map((b) => b.p50);
  const outer = bandEdges(bands, 'outer');
  const inner = bandEdges(bands, 'inner');
  const flagged = drop.delta >= CHANGE_THRESHOLD;

  return (
    <div className="demo gv" aria-label="gradeview learning analytics dashboard">
      <span className="demo__tag">Interactive dashboard</span>
      <h3 className="demo__title">Class trend across a {WEEKS}-week term</h3>
      <p className="demo__lede">
        Pick a skill to draw the class median with p10 to p90 and p25 to p75
        percentile bands, computed across the cohort week by week. The note flags
        the week this skill&apos;s class mastery dropped the most. Aggregation
        runs in Postgres over {ROWS.toLocaleString()} attempt rows.
      </p>

      <div className="gv__skilltabs" role="tablist" aria-label="skill">
        {SKILLS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === skill.key}
            className={`gv__skilltab ${s.key === skill.key ? 'gv__skilltab--on' : ''}`}
            onClick={() => setSkill(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="gv__chartwrap">
        <svg
          className="gv__svg"
          viewBox={`0 0 ${CHART.w} ${CHART.h}`}
          role="group"
          aria-label={`${skill.label} class mastery over ${WEEKS} weeks`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={CHART.pad.l} x2={CHART.w - CHART.pad.r} y1={yAt(v)} y2={yAt(v)} className="gv__grid" />
              <text x={CHART.pad.l - 6} y={yAt(v) + 3} textAnchor="end" className="gv__axis-label">
                {Math.round(v * 100)}
              </text>
            </g>
          ))}

          <rect
            x={xAt(view.range[0])}
            y={CHART.pad.t}
            width={Math.max(0, xAt(view.range[1]) - xAt(view.range[0]))}
            height={innerH}
            className="gv__brush-band"
          />

          <motion.path
            key={`outer-${skill.key}`}
            d={bandPath(outer.upper, outer.lower)}
            className="gv__band gv__band--outer"
            initial={{ opacity: reduce ? 0.28 : 0 }}
            animate={{ opacity: 0.28 }}
            transition={{ duration: reduce ? 0 : 0.5, ease }}
          />
          <motion.path
            key={`inner-${skill.key}`}
            d={bandPath(inner.upper, inner.lower)}
            className="gv__band gv__band--inner"
            initial={{ opacity: reduce ? 0.5 : 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.05, ease }}
          />
          <motion.path
            key={`line-${skill.key}`}
            d={linePath(median)}
            className="gv__line"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : 0.7, ease }}
          />

          {flagged && (
            <g>
              <line
                x1={xAt(drop.week)}
                x2={xAt(drop.week)}
                y1={CHART.pad.t}
                y2={CHART.h - CHART.pad.b}
                className="gv__change-line"
              />
              <circle cx={xAt(drop.week)} cy={yAt(median[drop.week])} r={4} className="gv__change-dot" />
            </g>
          )}

          {[0, 5, 10, 15, 19].map((w) => (
            <text key={w} x={xAt(w)} y={CHART.h - CHART.pad.b + 16} textAnchor="middle" className="gv__axis-label">
              w{w + 1}
            </text>
          ))}
        </svg>
        <div className="gv__legend">
          <span className="gv__legend-item gv__legend-item--line">class median (p50)</span>
          <span className="gv__legend-item gv__legend-item--inner">p25 to p75</span>
          <span className="gv__legend-item gv__legend-item--outer">p10 to p90</span>
        </div>
      </div>

      <div className={`gv__note ${flagged ? 'gv__note--hot' : ''}`}>
        <div className="gv__note-head">change point</div>
        {flagged ? (
          <p className="gv__note-text">
            Largest single-week drop in {skill.label} class mastery is week {drop.week + 1}, down{' '}
            {Math.round(drop.delta * 100)} points from the week before.
          </p>
        ) : (
          <p className="gv__note-text">
            No single-week regression in {skill.label}. The class median climbs
            steadily, so the change-point flag stays quiet for this skill.
          </p>
        )}
      </div>

      <div className="gv__metrics">
        <div className="gv__metric">
          <span className="gv__metric-val">
            {QUERY_MS}
            <span className="gv__metric-x">ms</span>
          </span>
          <span className="gv__metric-unit">class-trend query median, 7 runs</span>
        </div>
        <div className="gv__metric">
          <span className="gv__metric-val">{attempts.toLocaleString()}</span>
          <span className="gv__metric-unit">
            attempts in weeks {view.range[0] + 1} to {view.range[1] + 1}
          </span>
        </div>
        <div className="gv__metric">
          <span className="gv__metric-val">{DRIFT_GATE}%</span>
          <span className="gv__metric-unit">CI drift gate vs committed baseline</span>
        </div>
      </div>
    </div>
  );
}
