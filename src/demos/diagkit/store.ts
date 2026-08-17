// Minimal external store for the diagkit console: which scenario is selected
// and the precomputed bundle for each scenario. Bundles are built once per
// scenario and memoized, so switching back and forth is instant and identical.

import { collectBundle } from './engine';
import type { Bundle, ScenarioId } from './types';

export type State = {
  scenario: ScenarioId;
};

let state: State = { scenario: 'payments-outage' };
const listeners = new Set<() => void>();

const bundles = new Map<ScenarioId, Bundle>();

export function bundleFor(scenario: ScenarioId): Bundle {
  let b = bundles.get(scenario);
  if (!b) {
    b = collectBundle(scenario);
    bundles.set(scenario, b);
  }
  return b;
}

function emit(): void {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): State {
  return state;
}

export function setScenario(scenario: ScenarioId): void {
  if (state.scenario === scenario) return;
  state = { ...state, scenario };
  emit();
}
