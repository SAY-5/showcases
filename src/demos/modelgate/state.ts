// External store around one Service plus its load generator. Mutations bump
// a version so subscribers re-render; the sim clock only advances while a
// component holds it open.
import { useSyncExternalStore } from 'react';
import { LoadGen } from './loadgen';
import { Service } from './service';

export const service = new Service(7);
service.boot('v1');
export const loadgen = new LoadGen(service, 200, 1);

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

export function useServiceVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function startClock(stepS = 0.1, periodMs = 100): () => void {
  const id = window.setInterval(() => {
    loadgen.tick(stepS);
    touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
