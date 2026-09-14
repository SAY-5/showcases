// External store around the bridge simulation. The bench clock and the burst
// generator only advance while the demo holds the clock open; every mutation
// bumps a version.
import { useSyncExternalStore } from 'react';
import { BridgeSim } from './sim';

let current = new BridgeSim();
let version = 0;
const listeners = new Set<() => void>();

export function bridge(): BridgeSim {
  return current;
}

export function touch(): void {
  version += 1;
  for (const fn of listeners) fn();
}

export function resetBridge(): void {
  current = new BridgeSim();
  touch();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getVersion(): number {
  return version;
}

export function useBridgeVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

// The bench clock runs at 200 virtual ms per 100 ms; the burst takes `speed`
// generator steps per period.
export function startClock(speed: number, periodMs = 100): () => void {
  const id = window.setInterval(() => {
    const before = current.version;
    current.tick(periodMs * 2, speed);
    if (current.version !== before) touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
