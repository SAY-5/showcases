// External store around the tradegraph slice. The slice is a chunk of its own:
// it is fetched once, on first subscription, and every subscriber re-renders
// when the store is built or the load fails.
import { useSyncExternalStore } from 'react';
import { Store, type SliceData } from './graph';

export interface GraphStatus {
  store: Store | null;
  failed: boolean;
}

let status: GraphStatus = { store: null, failed: false };
let started = false;
const listeners = new Set<() => void>();

function emit(next: GraphStatus): void {
  status = next;
  for (const fn of listeners) fn();
}

function load(): void {
  if (started) return;
  started = true;
  import('./slice.json?raw')
    .then((mod) => emit({ store: new Store(JSON.parse(mod.default) as SliceData), failed: false }))
    .catch(() => emit({ store: null, failed: true }));
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  load();
  return () => listeners.delete(fn);
}

function getStatus(): GraphStatus {
  return status;
}

export function useGraph(): GraphStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}
