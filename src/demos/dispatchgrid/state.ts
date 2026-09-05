// External store around one Engine and one RolloutSim. Every tick routes the
// engine's traffic through the Deployments so a rollout is exercised by the
// same pings, ride requests and matches the load produces.
import { useSyncExternalStore } from 'react';
import { Engine } from './engine';
import { RolloutSim } from './rollout';

export const engine = new Engine(7);
export const rollout = new RolloutSim(11, [
  { name: 'rider-request-service', replicas: 2 },
  { name: 'driver-location-service', replicas: 2 },
  { name: 'matching-service', replicas: 2 },
]);

let version = 0;
const listeners = new Set<() => void>();
let lastPings = engine.pingsOk;
let lastSubmitted = engine.submitted;
let lastMatched = 0;

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

export function useEngineVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function step(dtMs: number): void {
  engine.tick(dtMs);
  rollout.tick(dtMs);
  const snap = engine.stats.snapshot();
  const [rider, driver, matching] = rollout.deployments;
  for (let i = engine.pingsOk - lastPings; i > 0; i--) rollout.route(driver);
  for (let i = engine.submitted - lastSubmitted; i > 0; i--) rollout.route(rider);
  for (let i = snap.matched - lastMatched; i > 0; i--) rollout.route(matching);
  lastPings = engine.pingsOk;
  lastSubmitted = engine.submitted;
  lastMatched = snap.matched;
}

export function startClock(speed: number, periodMs = 100): () => void {
  const id = window.setInterval(() => {
    step(periodMs * speed);
    touch();
  }, periodMs);
  return () => window.clearInterval(id);
}
