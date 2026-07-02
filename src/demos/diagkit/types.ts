// Shared types for the in-browser diagkit incident console.

export type ScenarioId = 'payments-outage' | 'db-slowdown';

export type ServiceId = 'gateway' | 'orders' | 'payments' | 'db';

export type LogLevel = 'info' | 'error';

export type LogLine = {
  id: number;
  service: ServiceId;
  level: LogLevel;
  raw: string;
  template: string;
};

// A cluster of log lines that normalize to the same template.
export type Signature = {
  id: string;
  service: ServiceId;
  level: LogLevel;
  template: string;
  count: number;
  samples: string[];
};

export type ServiceMetrics = {
  service: ServiceId;
  baselineP95Ms: number;
  incidentP95Ms: number;
  spike: number; // incident p95 / baseline p95
  errorRatePeak: number; // 0..1
  entryErrorShare: number; // share of failing entry requests tracing through it
};

// One scored factor in the explainable ranking.
export type Factor = {
  key: 'signatures' | 'latency' | 'errors' | 'traces';
  label: string;
  norm: number; // 0..1 after normalizing against the incident-wide max
  detail: string;
};

export type RankedService = {
  service: ServiceId;
  score: number; // 0..1
  factors: Factor[];
};

// Everything the collector hands the analyzer, plus the analyzer's answer.
export type Bundle = {
  scenario: ScenarioId;
  seed: number;
  services: ServiceId[];
  logs: LogLine[];
  errorSignatures: Signature[];
  metrics: Record<ServiceId, ServiceMetrics>;
  ranking: RankedService[];
  verdict: string;
};
