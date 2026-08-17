// External store for the snapvault pipeline: how far the pipeline has been
// driven (snapshot v1, the edit, snapshot v2) and which nodes are down. The
// snapshots themselves are derived deterministically in the engine; the store
// only tracks the user's progress through the flow.

import { editDataset, makeDataset, placeChunks, takeSnapshot } from './engine';
import type { Placement, Snapshot, VFile } from './types';

export type Step = 'start' | 'v1' | 'edited' | 'v2';

export type State = {
  step: Step;
  downNodes: number[];
};

let state: State = { step: 'start', downNodes: [] };
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): State {
  return state;
}

// ---------- derived pipeline artifacts (computed once, all deterministic) ----------

export const datasetV1: VFile[] = makeDataset();
export const datasetV2: VFile[] = editDataset(datasetV1);

const storeContents = new Set<string>();
export const snapshotV1: Snapshot = takeSnapshot('v1', datasetV1, storeContents);
export const snapshotV2: Snapshot = takeSnapshot('v2', datasetV2, storeContents);

export const placementV1: Placement = placeChunks(snapshotV1.uniqueHashes);
export const placementV2: Placement = placeChunks(snapshotV2.uniqueHashes);

export function currentDataset(s: State = state): VFile[] {
  return s.step === 'start' || s.step === 'v1' ? datasetV1 : datasetV2;
}

export function currentSnapshot(s: State = state): Snapshot | null {
  if (s.step === 'start') return null;
  return s.step === 'v1' ? snapshotV1 : snapshotV2;
}

export function currentPlacement(s: State = state): Placement | null {
  if (s.step === 'start') return null;
  return s.step === 'v1' ? placementV1 : placementV2;
}

// ---------- actions ----------

export function takeV1(): void {
  if (state.step !== 'start') return;
  set({ step: 'v1' });
}

export function editFile(): void {
  if (state.step !== 'v1') return;
  set({ step: 'edited' });
}

export function takeV2(): void {
  if (state.step !== 'edited') return;
  set({ step: 'v2' });
}

export function toggleNode(id: number): void {
  const downNodes = state.downNodes.includes(id)
    ? state.downNodes.filter((n) => n !== id)
    : [...state.downNodes, id];
  set({ downNodes });
}

export function recoverAll(): void {
  set({ downNodes: [] });
}

export function resetAll(): void {
  state = { step: 'start', downNodes: [] };
  emit();
}
