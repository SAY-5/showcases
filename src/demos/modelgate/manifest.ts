// Mirror of artifacts/manifest.json: the numbers the real training run
// produced, plus the headline figures from the committed make demo run.
export interface VersionEntry {
  file: string;
  arch: { hidden: number; depth: number };
  training: { epochs: number; lr: number };
  testMae: number;
}

export const VERSIONS: Record<string, VersionEntry> = {
  v1: {
    file: 'eta_v1.pt',
    arch: { hidden: 64, depth: 2 },
    training: { epochs: 10, lr: 0.003 },
    testMae: 3.1051,
  },
  v2: {
    file: 'eta_v2.pt',
    arch: { hidden: 96, depth: 3 },
    training: { epochs: 25, lr: 0.002 },
    testMae: 1.888,
  },
};

export const BASELINES = { meanPredictorMae: 8.6508, distanceLinearMae: 3.5654 };

export const REAL_DEMO = {
  targetRps: 200,
  durationS: 20,
  totalRequests: 4000,
  successes: 4000,
  dropped: 0,
  latencyMs: { p50: 1.78, p95: 4.18, p99: 11.8, max: 63.91 },
  shadowEnabledAtS: 5.001,
  swapRequestedAtS: 10.0,
  swapCompletedAtS: 10.006,
  shadowReport: { n: 1000, meanAbs: 2.2859, p95Abs: 6.3505, beyond2min: 0.401 },
};
