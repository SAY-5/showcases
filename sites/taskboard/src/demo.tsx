import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import './demo.css';

// Two clients move the same card to different columns at once. The board's
// optimistic version lets one save win; the loser re-reads, rebases, and the
// monotonic seq is the tie-break for the final column. A live activity feed
// records each step.

type ColId = 'todo' | 'doing' | 'done';
const COLUMNS: { id: ColId; name: string }[] = [
  { id: 'todo', name: 'To do' },
  { id: 'doing', name: 'In progress' },
  { id: 'done', name: 'Done' },
];

type Activity = { id: number; who: string; text: string };

export default function Demo() {
  const reduce = useReducedMotion();
  const [column, setColumn] = useState<ColId>('todo');
  const [version, setVersion] = useState(7);
  const [seq, setSeq] = useState(41);
  const [feed, setFeed] = useState<Activity[]>([
    { id: 0, who: 'Mara', text: 'opened the board' },
  ]);
  const [busy, setBusy] = useState(false);

  const push = (who: string, text: string) =>
    setFeed((f) => [{ id: Date.now() + Math.random(), who, text }, ...f].slice(0, 5));

  const conflict = () => {
    if (busy) return;
    setBusy(true);
    // Mara -> In progress, Ada -> Done, both off version 7.
    // Mara's save lands first and wins the @Version check; Ada re-reads and
    // rebases, and the higher seq is the tie-break, so Done is final.
    push('Mara', 'moves card to In progress (version 7)');
    push('Ada', 'moves card to Done (version 7)');

    const t1 = setTimeout(() => {
      setColumn('doing');
      setVersion(8);
      setSeq((s) => s + 1);
      push('server', 'Mara wins: version 7 to 8, card in In progress');
    }, reduce ? 0 : 700);

    const t2 = setTimeout(() => {
      push('Ada', 're-reads version 8 and rebases');
      setColumn('done');
      setVersion(9);
      setSeq((s) => s + 1);
      push('server', 'seq tie-break: card settles in Done');
      setBusy(false);
    }, reduce ? 0 : 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  };

  return (
    <div className="tb">
      <div className="tb-board">
        {COLUMNS.map((col) => (
          <div className="tb-col" key={col.id}>
            <div className="tb-col__head mono">
              <span>{col.name}</span>
              {col.id === 'doing' && <span className="tb-cursor tb-cursor--mara">Mara</span>}
              {col.id === 'done' && <span className="tb-cursor tb-cursor--ada">Ada</span>}
            </div>
            <div className="tb-col__body">
              <AnimatePresence>
                {column === col.id && (
                  <motion.div
                    className="tb-card"
                    layoutId={reduce ? undefined : 'card'}
                    initial={reduce ? false : { scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="tb-card__title">Wire up STOMP presence</span>
                    <span className="tb-card__meta mono">
                      v{version} / seq {seq}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      <div className="tb-side">
        <button className="tb-run mono" onClick={conflict} disabled={busy}>
          {busy ? 'resolving...' : 'Run concurrent move'}
        </button>
        <div className="tb-feed">
          <span className="tb-feed__label mono">activity</span>
          <ul>
            <AnimatePresence initial={false}>
              {feed.map((a) => (
                <motion.li
                  key={a.id}
                  className="mono"
                  initial={reduce ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="tb-feed__who">{a.who}</span> {a.text}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </div>
  );
}
