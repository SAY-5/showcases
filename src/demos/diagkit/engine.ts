// The diagkit pipeline, in the browser: normalize each log message into a
// template, cluster identical templates into signatures, and rank services
// with an explainable score. Pure functions of the scenario, no clock, no IO.

import { generateLogs, scenarioMetrics, SEED, SERVICES } from './data';
import type {
  Bundle,
  Factor,
  LogLine,
  RankedService,
  ScenarioId,
  Signature,
} from './types';

// Log-signature fingerprinting: strip the variable tokens (hex ids, numbers)
// so recurring failures collapse onto one template. This mirrors the Go
// fingerprinter's normalization rules.
export function normalize(raw: string): string {
  return raw
    .replace(/\b[0-9a-f]{6,}\b/g, '<id>')
    .replace(/\b\d+(\.\d+)?(ms|s)\b/g, '<dur>')
    .replace(/\b\d+\b/g, '<n>');
}

export function clusterSignatures(logs: LogLine[]): Signature[] {
  const byKey = new Map<string, Signature>();
  for (const line of logs) {
    const key = `${line.service}|${line.level}|${line.template}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.samples.length < 3) existing.samples.push(line.raw);
    } else {
      byKey.set(key, {
        id: key,
        service: line.service,
        level: line.level,
        template: line.template,
        count: 1,
        samples: [line.raw],
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

const FACTOR_WEIGHTS = {
  signatures: 0.35,
  latency: 0.25,
  errors: 0.2,
  traces: 0.2,
} as const;

// Rank services by a weighted sum of four factors, each normalized against
// the incident-wide max so the strongest service reads 1.000. Every factor
// carries a human-readable detail line, which is what makes the answer
// explainable rather than a bare number.
export function rankServices(
  scenario: ScenarioId,
  signatures: Signature[],
): RankedService[] {
  const metrics = scenarioMetrics(scenario);
  const errorSigs = signatures.filter((s) => s.level === 'error');
  const totalErrorLines = errorSigs.reduce((n, s) => n + s.count, 0) || 1;

  const perService = SERVICES.map((service) => {
    const owned = errorSigs.filter((s) => s.service === service);
    const ownedLines = owned.reduce((n, s) => n + s.count, 0);
    const m = metrics[service];
    return {
      service,
      sigCount: owned.length,
      sigDensity: ownedLines / totalErrorLines,
      ownedLines,
      spikeExcess: Math.max(0, m.spike - 1),
      errorRate: m.errorRatePeak,
      traceShare: m.entryErrorShare,
      metrics: m,
    };
  });

  const max = {
    sigDensity: Math.max(...perService.map((p) => p.sigDensity), 1e-9),
    spikeExcess: Math.max(...perService.map((p) => p.spikeExcess), 1e-9),
    errorRate: Math.max(...perService.map((p) => p.errorRate), 1e-9),
    traceShare: Math.max(...perService.map((p) => p.traceShare), 1e-9),
  };

  const ranked: RankedService[] = perService.map((p) => {
    const factors: Factor[] = [
      {
        key: 'signatures',
        label: 'signature density',
        norm: p.sigDensity / max.sigDensity,
        detail: `${p.sigCount} error signature(s) covering ${p.ownedLines} log lines`,
      },
      {
        key: 'latency',
        label: 'latency spike',
        norm: p.spikeExcess / max.spikeExcess,
        detail: `p95 ${p.metrics.incidentP95Ms}ms vs ${p.metrics.baselineP95Ms}ms baseline (${p.metrics.spike.toFixed(1)}x)`,
      },
      {
        key: 'errors',
        label: 'error rate',
        norm: p.errorRate / max.errorRate,
        detail: `error rate peaked at ${Math.round(p.errorRate * 100)}%`,
      },
      {
        key: 'traces',
        label: 'entry-error traces',
        norm: p.traceShare / max.traceShare,
        detail: `${Math.round(p.traceShare * 100)}% of entry errors trace through it`,
      },
    ];
    const score = factors.reduce(
      (sum, f) => sum + f.norm * FACTOR_WEIGHTS[f.key],
      0,
    );
    return { service: p.service, score, factors };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

export function buildVerdict(ranking: RankedService[]): string {
  const top = ranking[0];
  const strongest = [...top.factors].sort((a, b) => b.norm - a.norm);
  return `Likely root cause: ${top.service}. ${strongest[0].detail}, ${strongest[1].detail}.`;
}

// Collect and analyze in one shot. Deterministic: the same scenario always
// yields the same bundle.
export function collectBundle(scenario: ScenarioId): Bundle {
  const logs = generateLogs(scenario).map((l) => ({
    ...l,
    template: normalize(l.raw),
  }));
  const signatures = clusterSignatures(logs);
  const errorSignatures = signatures.filter((s) => s.level === 'error');
  const ranking = rankServices(scenario, signatures);
  return {
    scenario,
    seed: SEED,
    services: SERVICES,
    logs,
    errorSignatures,
    metrics: scenarioMetrics(scenario),
    ranking,
    verdict: buildVerdict(ranking),
  };
}
