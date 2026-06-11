import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './demo.css';

// A request moves through the tool-calling loop. Confidence is the provider's
// signal times tool-call completeness. At or above the threshold the request
// resolves automatically; below it, it escalates to a human. The threshold is
// a slider so you can watch the same request flip lanes.

type Step = { tool: string; ok: boolean };

const STEPS: Step[] = [
  { tool: 'lookup_order', ok: true },
  { tool: 'check_inventory', ok: true },
  { tool: 'apply_refund', ok: false },
  { tool: 'notify_customer', ok: true },
];

const DEFAULT_THRESHOLD = 0.7;

export default function Demo() {
  const reduce = useReducedMotion();
  const [signal, setSignal] = useState(0.9);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  const completeness =
    STEPS.filter((s) => s.ok).length / STEPS.length;
  const confidence = signal * completeness;
  const resolves = confidence >= threshold;

  const angle = -90 + confidence * 180; // dial sweep across a half circle

  return (
    <div className="ad">
      <div className="ad-loop">
        <span className="ad-loop__label mono">tool-calling loop</span>
        <ol className="ad-steps">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.tool}
              className={`ad-step mono${s.ok ? ' is-ok' : ' is-err'}`}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : i * 0.12 }}
            >
              <span className="ad-step__tool">{s.tool}</span>
              <span className="ad-step__tag">{s.ok ? 'ok' : 'error'}</span>
            </motion.li>
          ))}
        </ol>
      </div>

      <div className="ad-dial">
        <svg viewBox="0 0 120 70" className="ad-dial__svg" aria-hidden="true">
          <path d="M10 60 A 50 50 0 0 1 110 60" className="ad-dial__track" />
          <path
            d="M10 60 A 50 50 0 0 1 110 60"
            className="ad-dial__fill"
            style={{ strokeDasharray: 157, strokeDashoffset: 157 * (1 - confidence) }}
          />
          <motion.line
            x1="60"
            y1="60"
            x2="60"
            y2="18"
            className="ad-dial__needle"
            style={{ originX: '60px', originY: '60px' }}
            animate={{ rotate: angle }}
            transition={{ duration: reduce ? 0 : 0.4 }}
          />
          <circle cx="60" cy="60" r="3.5" className="ad-dial__hub" />
        </svg>
        <div className="ad-dial__value mono">{confidence.toFixed(2)}</div>
        <div className="ad-dial__math mono">
          signal {signal.toFixed(2)} x completeness {completeness.toFixed(2)}
        </div>
      </div>

      <div className="ad-controls">
        <label className="ad-field">
          <span className="ad-field__label mono">
            provider signal {signal.toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={signal}
            onChange={(e) => setSignal(Number(e.target.value))}
          />
        </label>
        <label className="ad-field">
          <span className="ad-field__label mono">
            threshold {threshold.toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="ad-lanes">
        <div className={`ad-lane${resolves ? ' is-active' : ''}`}>
          <span className="ad-lane__name mono">resolved</span>
          {resolves && (
            <motion.span
              className="ad-token mono"
              layoutId={reduce ? undefined : 'token'}
            >
              request #4817
            </motion.span>
          )}
        </div>
        <div className={`ad-lane${!resolves ? ' is-active' : ''}`}>
          <span className="ad-lane__name mono">human escalation</span>
          {!resolves && (
            <motion.span
              className="ad-token mono"
              layoutId={reduce ? undefined : 'token'}
            >
              request #4817
            </motion.span>
          )}
        </div>
      </div>
    </div>
  );
}
