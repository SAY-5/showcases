// External store around one World instance. The simulation clock only moves
// when a component holds the clock open, and every mutation bumps a version
// so subscribers re-render.
import { useSyncExternalStore } from 'react';
import { World } from './world';

export const SEED = 42;
export const world = new World(SEED);

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

export function useWorldVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

// Advance the world on a fixed step. Returns a stop function.
export function startClock(speed: number, stepS = 0.1, periodMs = 100): () => void {
  const id = window.setInterval(() => {
    world.tick(stepS * speed);
    touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
