import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './snapvault.css';
import { useStore } from './snapvault/state';
import {
  currentDataset,
  currentPlacement,
  currentSnapshot,
  editFile,
  recoverAll,
  resetAll,
  snapshotV1,
  snapshotV2,
  takeV1,
  takeV2,
  toggleNode,
} from './snapvault/store';
import {
  chunksOnNode,
  NODES,
  PARALLEL,
  planRestore,
  REPLICAS,
} from './snapvault/engine';
import type { RestorePlan } from './snapvault/types';

// In-browser snapvault pipeline. Chunking, content addressing, dedup,
// replica placement, and the parallel verified restore all run client-side
// over a synthesized dataset, mirroring the C++ storage engine and the Go
// distribution layer. Drive it end to end: snapshot, edit, snapshot again,
// fail a node, restore, and read the byte-for-byte verdict.

type RunState = 'idle' | 'running' | 'done';

const WAVE_MS = 300;
const ease = [0.22, 1, 0.36, 1] as const;

export default function SnapvaultDemo() {
  const state = useStore();
  const reduce = useReducedMotion();

  const dataset = currentDataset(state);
  const snapshot = currentSnapshot(state);
  const placement = currentPlacement(state);

  const [run, setRun] = useState<RunState>('idle');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [shown, setShown] = useState(0);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  useEffect(() => clearTimers, []);

  function at(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, reduce ? 0 : ms));
  }

  function resetRun() {
    clearTimers();
    setRun('idle');
    setPlan(null);
    setShown(0);
  }

  function fullReset() {
    resetRun();
    resetAll();
  }

  function runRestore() {
    if (!snapshot || !placement || run === 'running') return;
    clearTimers();
    const p = planRestore(dataset, snapshot, placement, state.downNodes);
    setPlan(p);
    setShown(0);
    setRun('running');

    const waves = Math.ceil(p.items.length / PARALLEL);
    for (let w = 1; w <= waves; w++) {
      const upto = Math.min(w * PARALLEL, p.items.length);
      at(w * WAVE_MS, () => setShown(upto));
    }
    at((waves + 1) * WAVE_MS, () => setRun('done'));
  }

  const busy = run === 'running';
  const upNodes = NODES - state.downNodes.length;
  const dedupPct = (s: { deduped: number; chunkRefs: number }) =>
    Math.round((s.deduped / s.chunkRefs) * 100);

  const verified = plan
    ? plan.items.slice(0, shown).filter((i) => i.verified).length
    : 0;
  const missingShown = plan
    ? plan.items.slice(0, shown).filter((i) => i.fetchedFrom === null).length
    : 0;

  return (
    <div className="demo" aria-label="snapvault backup pipeline">
      <span className="demo__tag">Backup pipeline</span>
      <h3 className="demo__title">snapvault</h3>
      <p className="demo__lede">
        Take a snapshot and watch the files shatter into content-addressed
        chunks that dedup on arrival. Edit one file and the incremental
        snapshot stores a single new chunk. Then fail a node and run the
        parallel restore: every chunk is re-hashed against its address on
        arrival, and the verdict is byte-for-byte or a clean failure.
      </p>

      <p className="svt__sr" role="status" aria-live="polite">
        {run === 'done' && plan
          ? plan.intact
            ? 'Restore complete. The restored tree matches the original byte-for-byte.'
            : `Restore failed clean: ${plan.missing.length} chunk(s) had every replica down.`
          : ''}
      </p>

      <div className="svt__grid">
        <section className="svt__panel" aria-label="Dataset and snapshots">
          <div className="svt__panel-head">
            Dataset
            <span className="svt__panel-count">
              {dataset.length} files
            </span>
          </div>

          <ul className="svt__files">
            {dataset.map((f) => (
              <li key={f.path} className="svt__file">
                <span className="svt__file-path">{f.path}</span>
                {state.step !== 'start' && state.step !== 'v1' &&
                  f.path === 'docs/notes.md' && (
                    <span className="svt__file-edited">edited</span>
                  )}
                <span className="svt__file-blocks">
                  {f.blocks.length} chunks
                </span>
              </li>
            ))}
          </ul>

          <div className="svt__snaps">
            {(state.step !== 'start'
              ? [snapshotV1.stats]
              : []
            )
              .concat(state.step === 'v2' ? [snapshotV2.stats] : [])
              .map((s) => (
                <motion.div
                  key={s.name}
                  className="svt__snap"
                  initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.35, ease }}
                >
                  <span className="svt__snap-name">snapshot {s.name}</span>
                  <span className="svt__snap-line">
                    {s.chunkRefs} chunk refs, <b>{s.newChunks} new</b>,{' '}
                    {s.deduped} deduped ({dedupPct(s)}%)
                  </span>
                </motion.div>
              ))}
          </div>

          <div className="demo__controls">
            <button
              className="demo__btn"
              disabled={state.step !== 'start' || busy}
              onClick={() => {
                resetRun();
                takeV1();
              }}
            >
              Snapshot v1
            </button>
            <button
              className="demo__btn demo__btn--ghost"
              disabled={state.step !== 'v1' || busy}
              onClick={() => {
                resetRun();
                editFile();
              }}
            >
              Edit one file
            </button>
            <button
              className="demo__btn"
              disabled={state.step !== 'edited' || busy}
              onClick={() => {
                resetRun();
                takeV2();
              }}
            >
              Snapshot v2
            </button>
          </div>
        </section>

        <section className="svt__panel" aria-label="Storage cluster">
          <div className="svt__panel-head">
            Cluster
            <span className="svt__panel-count">
              replication {REPLICAS}x, {upNodes}/{NODES} nodes up
            </span>
          </div>

          <div className="svt__nodes">
            {Array.from({ length: NODES }, (_, id) => {
              const down = state.downNodes.includes(id);
              const count = placement
                ? chunksOnNode(placement, id).length
                : 0;
              return (
                <button
                  key={id}
                  className={`svt__node ${down ? 'svt__node--down' : ''}`}
                  disabled={busy || !placement}
                  onClick={() => {
                    resetRun();
                    toggleNode(id);
                  }}
                  aria-pressed={down}
                  aria-label={`node ${id}, ${down ? 'down' : 'up'}, ${count} chunks. Toggle.`}
                >
                  <span className="svt__node-name">node {id}</span>
                  <span className="svt__node-state">
                    {down ? 'DOWN' : 'up'}
                  </span>
                  <span className="svt__node-count">
                    {placement ? `${count} chunks` : 'empty'}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="svt__note">
            {placement
              ? `Placement is derived from each chunk's content hash: the address picks the home node and ${REPLICAS - 1} more replicas follow around the ring. Click nodes to fail them; down ${REPLICAS} neighbors and some chunk loses every replica.`
              : 'Take a snapshot first: distribution follows the snapshot.'}
          </p>

          <div className="demo__controls">
            <button
              className="demo__btn demo__btn--ghost"
              disabled={busy || state.downNodes.length === 0}
              onClick={() => {
                resetRun();
                recoverAll();
              }}
            >
              Recover all nodes
            </button>
            <button
              className="demo__btn demo__btn--ghost"
              disabled={busy || state.step === 'start'}
              onClick={fullReset}
            >
              Reset pipeline
            </button>
          </div>
        </section>
      </div>

      <section className="svt__panel svt__panel--restore" aria-label="Parallel restore">
        <div className="svt__panel-head">
          Parallel verified restore
          <span className="svt__panel-count">
            {plan
              ? `${verified} verified${missingShown > 0 ? `, ${missingShown} missing` : ''} / ${plan.items.length} chunks, parallelism ${PARALLEL}`
              : snapshot
                ? `${snapshot.uniqueHashes.length} chunks to restore`
                : 'awaiting a snapshot'}
          </span>
        </div>

        {!snapshot && (
          <p className="svt__note">
            Snapshot the dataset, then restore it here. Chunks are fetched
            concurrently from whichever replicas are up and re-hashed against
            their content address on arrival.
          </p>
        )}

        {plan && (
          <div className="svt__chunks">
            {plan.items.slice(0, shown).map((item) => (
              <motion.span
                key={item.hash}
                className={`svt__chunk ${
                  item.fetchedFrom === null
                    ? 'svt__chunk--missing'
                    : 'svt__chunk--ok'
                }`}
                initial={{ opacity: 0, scale: reduce ? 1 : 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduce ? 0 : 0.22, ease }}
                title={
                  item.fetchedFrom === null
                    ? `${item.hash}: replicas ${item.replicas.join(', ')} all down`
                    : `${item.hash}: fetched from node ${item.fetchedFrom}, hash verified`
                }
              >
                <span className="svt__chunk-hash">{item.hash.slice(0, 6)}</span>
                <span className="svt__chunk-from">
                  {item.fetchedFrom === null
                    ? 'no replica'
                    : `n${item.fetchedFrom} ok`}
                </span>
              </motion.span>
            ))}
          </div>
        )}

        <div className="demo__controls">
          <button
            className="demo__btn"
            disabled={!snapshot || busy}
            onClick={runRestore}
          >
            {busy
              ? 'Restoring...'
              : `Restore ${snapshot ? snapshot.stats.name : ''}`}
          </button>
        </div>

        <AnimatePresence>
          {run === 'done' && plan && (
            <motion.div
              className={`svt__verdict ${
                plan.intact ? '' : 'svt__verdict--fail'
              }`}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease }}
            >
              {plan.intact ? (
                <>
                  <span className="svt__verdict-head">
                    {state.downNodes.length > 0
                      ? 'Node failure survived and integrity verified'
                      : 'Integrity verified'}
                  </span>
                  <span className="svt__verdict-text">
                    All {plan.items.length} chunks were fetched from surviving
                    replicas, re-hashed against their content addresses, and
                    the restored tree matches the original byte-for-byte.
                  </span>
                </>
              ) : (
                <>
                  <span className="svt__verdict-head">
                    Restore failed clean
                  </span>
                  <span className="svt__verdict-text">
                    {plan.missing.length} chunk(s) have every one of their{' '}
                    {REPLICAS} replicas down (first: {plan.missing[0].hash}).
                    Nothing partial was written; recover a node and retry.
                  </span>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
