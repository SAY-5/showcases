// External store around one lab. The demo script only advances while a
// component holds playback open; every mutation bumps a version.
import { useSyncExternalStore } from 'react';
import { Lab } from './lab';

export const store = { lab: new Lab() };

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
  store.lab = new Lab();
  touch();
}

/** Perform one script action per period until the summary is in. */
export function startPlayback(periodMs = 420): () => void {
  const id = window.setInterval(() => {
    const done = store.lab.stepScript();
    touch();
    if (done) window.clearInterval(id);
  }, periodMs);
  return () => window.clearInterval(id);
}
