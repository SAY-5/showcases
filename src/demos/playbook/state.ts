// External store around one LoopRun. The clock grades one scenario per beat
// while the loop runs and holds a few beats on each finished round; every
// mutation bumps a version.
import { useSyncExternalStore } from 'react';
import { formatPromotion, gate, LoopRun } from './arc';

const ROUND_PAUSE_BEATS = 7;

export interface Decision {
  seq: number;
  version: number;
  promoted: boolean;
  text: string;
}

export const store = {
  loop: new LoopRun(),
  running: false,
  hold: 0,
  decisions: [] as Decision[],
};

let version = 0;
const listeners = new Set<() => void>();

export function touch(): void {
  version += 1;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getVersion(): number {
  return version;
}

export function useLoopVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function start(): void {
  if (store.running) return;
  if (store.loop.done || store.loop.rounds.length || store.loop.outcomes.length) {
    store.loop = new LoopRun();
    store.decisions = [];
  }
  store.hold = 0;
  store.running = true;
  touch();
}

export function finish(): void {
  store.loop.runToEnd();
  store.running = false;
  touch();
}

export function reset(): void {
  store.loop = new LoopRun();
  store.running = false;
  store.hold = 0;
  store.decisions = [];
  touch();
}

// playbook promote --version N
export function promote(v: number): void {
  const round = store.loop.rounds.find((r) => r.spec.version === v);
  if (!round) return;
  const blockers = gate(round.report);
  store.decisions = [{ seq: (store.decisions[0]?.seq ?? 0) + 1, version: v, promoted: !blockers.length, text: formatPromotion(round.report, blockers, 'reviewer') }, ...store.decisions].slice(0, 4);
  touch();
}

function beat(): void {
  if (!store.running) return;
  if (store.hold > 0) {
    store.hold -= 1;
    return;
  }
  for (const e of store.loop.step()) {
    if (e.kind === 'round') store.hold = ROUND_PAUSE_BEATS;
    if (e.kind === 'stop') store.running = false;
  }
}

export function startClock(speed: number, periodMs = 150): () => void {
  const id = window.setInterval(() => {
    if (!store.running) return;
    for (let i = 0; i < speed; i++) beat();
    touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
