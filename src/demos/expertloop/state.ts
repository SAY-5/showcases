// External store around one lab. The lab is built on first access rather than
// at import, so the other routes of the site do not pay for its compiles and
// dry run. The demo script only advances while a component holds playback
// open; every mutation bumps a version.
import { useSyncExternalStore } from 'react';
import { Lab } from './lab';

let lab: Lab | null = null;

export const store = {
  get lab(): Lab {
    if (lab === null) lab = new Lab();
    return lab;
  },
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

export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function resetStore(): void {
  lab = new Lab();
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
