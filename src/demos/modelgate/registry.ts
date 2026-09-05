// Model registry with atomic, zero-drop version swaps. Port of
// modelgate/serving/registry.py.
//
// A version is built from its weights and warmed with a dummy forward pass
// before it can be selected. The swap itself is a single reference
// assignment. Every request captures its own reference to the primary at the
// start, so a request in flight during a swap finishes on the model it
// started with.
import { FEATURE_DIM } from './features';
import { VERSIONS } from './manifest';
import type { MetricSet } from './metrics';
import { EtaNet } from './net';
import { RAW_WEIGHTS } from './weights';

export interface LoadedModel {
  readonly version: string;
  readonly net: EtaNet;
  readonly testMae: number;
  readonly loadedAt: number;
}

export interface SwapRecord {
  kind: 'promote' | 'rollback';
  from: string | null;
  to: string;
  at: number;
}

export class ModelRegistry {
  private readonly metrics: MetricSet;
  private readonly now: () => number;
  private readonly loaded = new Map<string, LoadedModel>();
  private _primary: LoadedModel | null = null;
  private _previous: LoadedModel | null = null;
  private _shadow: LoadedModel | null = null;
  readonly swapHistory: SwapRecord[] = [];

  constructor(metrics: MetricSet, now: () => number) {
    this.metrics = metrics;
    this.now = now;
  }

  availableVersions(): string[] {
    return Object.keys(VERSIONS).sort();
  }

  isKnown(version: string): boolean {
    return version in VERSIONS;
  }

  isLoaded(version: string): boolean {
    return this.loaded.has(version);
  }

  // Build and warm a version. Idempotent.
  load(version: string): LoadedModel {
    const cached = this.loaded.get(version);
    if (cached) return cached;
    const net = new EtaNet(RAW_WEIGHTS[version]);
    const model: LoadedModel = { version, net, testMae: VERSIONS[version].testMae, loadedAt: this.now() };
    // Warm-up: the first forward pass pays for any lazy work, so take it here.
    net.forward(new Float32Array(FEATURE_DIM));
    this.loaded.set(version, model);
    this.metrics.modelsLoaded.set({}, this.loaded.size);
    return model;
  }

  get primary(): LoadedModel | null {
    return this._primary;
  }

  get shadow(): LoadedModel | null {
    return this._shadow;
  }

  get previous(): LoadedModel | null {
    return this._previous;
  }

  // Make `version` the primary. Loads and warms first, then swaps atomically.
  promote(version: string): SwapRecord | null {
    const candidate = this.load(version);
    const old = this._primary;
    if (old !== null && old.version === candidate.version) return null;
    this._previous = old;
    this._primary = candidate; // single reference assignment: the swap itself
    if (this._shadow !== null && this._shadow.version === candidate.version) this._shadow = null;
    this.refreshRoleGauges();
    this.metrics.versionSwaps.inc({ kind: 'promote' });
    const record: SwapRecord = { kind: 'promote', from: old ? old.version : null, to: candidate.version, at: this.now() };
    this.swapHistory.push(record);
    return record;
  }

  rollback(): SwapRecord | null {
    if (this._previous === null) return null;
    const old = this._primary;
    const next = this._previous;
    this._previous = old;
    this._primary = next;
    this.refreshRoleGauges();
    this.metrics.versionSwaps.inc({ kind: 'rollback' });
    const record: SwapRecord = { kind: 'rollback', from: old ? old.version : null, to: next.version, at: this.now() };
    this.swapHistory.push(record);
    return record;
  }

  setShadow(version: string | null): void {
    this._shadow = version === null ? null : this.load(version);
    this.refreshRoleGauges();
  }

  private refreshRoleGauges(): void {
    for (const version of this.availableVersions()) {
      this.metrics.modelVersionInfo.set({ version, role: 'primary' }, this._primary?.version === version ? 1 : 0);
      this.metrics.modelVersionInfo.set({ version, role: 'shadow' }, this._shadow?.version === version ? 1 : 0);
    }
  }
}
