// External store around one workbench and one full run. The workbench clock
// and the run only advance while a component holds the clock open; every
// mutation bumps a version.
import { useSyncExternalStore } from 'react';
import { Bench } from './bench';
import { RunDriver } from './driver';

export const store = { bench: new Bench(), driver: new RunDriver() };

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

export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function resetStore(): void {
  store.bench = new Bench();
  store.driver = new RunDriver();
  touch();
}

/** Advance lease time and drain a slice of the run every period. */
export function startClock(periodMs = 100, slice = 24): () => void {
  const id = window.setInterval(() => {
    store.bench.tick(periodMs);
    if (store.driver.isRunning()) store.driver.step(slice);
    touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
