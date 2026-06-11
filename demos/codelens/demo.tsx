import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './demo.css';

// A clickable symbol graph. Selecting a node draws a jump-to-definition edge
// to its declaring file and fans out reference edges across files, while a
// side-by-side timer contrasts the N+1 baseline with the indexed query.

type Sym = {
  id: string;
  label: string;
  defFile: string;
  refs: string[];
  x: number;
  y: number;
};

const FILES = [
  'parser.go',
  'index.go',
  'graph.go',
  'server.go',
  'refs.go',
  'cache.go',
];

const SYMBOLS: Sym[] = [
  { id: 'Index', label: 'Index', defFile: 'index.go', refs: ['server.go', 'graph.go', 'refs.go'], x: 50, y: 26 },
  { id: 'parseFile', label: 'parseFile', defFile: 'parser.go', refs: ['index.go', 'graph.go'], x: 20, y: 60 },
  { id: 'Reference', label: 'Reference', defFile: 'refs.go', refs: ['index.go', 'server.go', 'cache.go'], x: 80, y: 60 },
  { id: 'Resolve', label: 'Resolve', defFile: 'graph.go', refs: ['server.go', 'refs.go'], x: 50, y: 82 },
];

// Real numbers from the project: p95 915.3 ms (N+1) vs 17.6 ms (indexed).
const SLOW_MS = 915.3;
const FAST_MS = 17.6;

const filePos: Record<string, { x: number; y: number }> = {};
FILES.forEach((f, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  filePos[f] = { x: 18 + col * 32, y: 18 + row * 64 };
});

export default function Demo() {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string>('Index');
  const sym = useMemo(
    () => SYMBOLS.find((s) => s.id === selected) ?? SYMBOLS[0],
    [selected]
  );

  const refCount = sym.refs.length;
  const dur = reduce ? 0 : 0.5;

  return (
    <div className="cl">
      <div className="cl-graph" role="group" aria-label="Symbol reference graph">
        <svg className="cl-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line
            className="cl-edge cl-edge--def"
            x1={sym.x}
            y1={sym.y}
            x2={filePos[sym.defFile].x}
            y2={filePos[sym.defFile].y}
          />
          {sym.refs.map((f) => (
            <motion.line
              key={f}
              className="cl-edge cl-edge--ref"
              x1={sym.x}
              y1={sym.y}
              x2={filePos[f].x}
              y2={filePos[f].y}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: dur }}
            />
          ))}
        </svg>

        {FILES.map((f) => {
          const active = f === sym.defFile || sym.refs.includes(f);
          const isDef = f === sym.defFile;
          return (
            <span
              key={f}
              className={`cl-file mono${active ? ' is-active' : ''}${isDef ? ' is-def' : ''}`}
              style={{ left: `${filePos[f].x}%`, top: `${filePos[f].y}%` }}
            >
              {f}
            </span>
          );
        })}

        {SYMBOLS.map((s) => (
          <button
            key={s.id}
            className={`cl-node mono${s.id === selected ? ' is-selected' : ''}`}
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
            onClick={() => setSelected(s.id)}
            aria-pressed={s.id === selected}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="cl-side">
        <div className="cl-readout">
          <span className="cl-readout__label mono">selected</span>
          <span className="cl-readout__val mono">{sym.label}</span>
        </div>
        <div className="cl-readout">
          <span className="cl-readout__label mono">defined in</span>
          <span className="cl-readout__val mono">{sym.defFile}</span>
        </div>
        <div className="cl-readout">
          <span className="cl-readout__label mono">references</span>
          <span className="cl-readout__val mono">
            {refCount} files
          </span>
        </div>

        <div className="cl-timer">
          <div className="cl-bar-row">
            <span className="cl-bar-label mono">N+1 baseline</span>
            <div className="cl-bar">
              <motion.div
                className="cl-bar__fill cl-bar__fill--slow"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: reduce ? 0 : 1.2 }}
              />
            </div>
            <span className="cl-bar-val mono">{SLOW_MS} ms</span>
          </div>
          <div className="cl-bar-row">
            <span className="cl-bar-label mono">indexed query</span>
            <div className="cl-bar">
              <motion.div
                className="cl-bar__fill cl-bar__fill--fast"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(FAST_MS / SLOW_MS) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.5 }}
              />
            </div>
            <span className="cl-bar-val mono">{FAST_MS} ms</span>
          </div>
          <p className="cl-timer__note mono">
            {Math.round(SLOW_MS / FAST_MS)}x faster on the covering index
          </p>
        </div>
      </div>
    </div>
  );
}
