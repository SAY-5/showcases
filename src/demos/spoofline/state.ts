// External store around the spoofline run data. data.json is a chunk of its own:
// it is fetched once, on first subscription, so the eager demo registry only carries
// the component, and every subscriber re-renders when the data arrives or fails.
import { useSyncExternalStore } from 'react';
import type { DemoData } from './types';

export interface RunStatus {
  data: DemoData | null;
  failed: boolean;
}

let status: RunStatus = { data: null, failed: false };
let started = false;
const listeners = new Set<() => void>();

function emit(next: RunStatus): void {
  status = next;
  for (const fn of listeners) fn();
}

function load(): void {
  if (started) return;
  started = true;
  import('./data.json?raw')
    .then((mod) => emit({ data: JSON.parse(mod.default) as DemoData, failed: false }))
    .catch(() => emit({ data: null, failed: true }));
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  load();
  return () => listeners.delete(fn);
}

function getStatus(): RunStatus {
  return status;
}

export function useRunData(): RunStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}
