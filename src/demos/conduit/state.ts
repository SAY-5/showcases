// External store around one ConduitRun. The virtual clock advances only while
// a component holds it open, a quarter second per beat during make demo and
// half a second while the labs run; every mutation bumps a version.
import { useSyncExternalStore } from 'react';
import { ConduitRun } from './engine';

export const store = { run: new ConduitRun() };

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

export function useRunVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function beat(): void {
  store.run.tick(store.run.busy ? 0.25 : 0.5);
}

export function startRun(): void {
  store.run = new ConduitRun();
  store.run.start();
  touch();
}

export function resetRun(): void {
  store.run = new ConduitRun();
  touch();
}

export function startClock(speed: number, periodMs = 100): () => void {
  const id = window.setInterval(() => {
    for (let i = 0; i < speed; i++) beat();
    touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
