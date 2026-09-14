// External store around one chaos session. The virtual clock only advances
// while the demo holds it open; every mutation bumps a version.
import { useSyncExternalStore } from 'react';
import { ChaosSession } from './sim';

let current = new ChaosSession();
let version = 0;
const listeners = new Set<() => void>();

export function session(): ChaosSession {
  return current;
}

export function touch(): void {
  version += 1;
  for (const fn of listeners) fn();
}

export function resetSession(start: boolean): void {
  current = new ChaosSession();
  if (start) current.start();
  touch();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getVersion(): number {
  return version;
}

export function useSessionVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function startClock(speed: number, periodMs = 100): () => void {
  const id = window.setInterval(() => {
    const before = current.version;
    current.advance(periodMs * speed);
    if (current.version !== before) touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
