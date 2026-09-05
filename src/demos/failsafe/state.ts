// External store around one ChaosRun. The virtual clock only advances while
// a component holds it open; every mutation bumps a version.
import { useSyncExternalStore } from 'react';
import { ChaosRun } from './chaos';

export const run = new ChaosRun();

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

export function startClock(speed: number, periodMs = 100): () => void {
  const id = window.setInterval(() => {
    run.step((periodMs / 1000) * speed);
    touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
