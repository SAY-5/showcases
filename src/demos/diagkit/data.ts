// Seeded incident generation for the diagkit console. The collector in the
// real project simulates a four-service topology from a seeded PRNG; this file
// does the same in the browser so a given scenario always produces the same
// logs, the same signatures, and the same ranking.

import type { LogLine, ScenarioId, ServiceId, ServiceMetrics } from './types';

export const SEED = 42;

export const SERVICES: ServiceId[] = ['gateway', 'orders', 'payments', 'db'];

// mulberry32: tiny deterministic PRNG, good enough for synthetic telemetry.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexId(rand: () => number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += Math.floor(rand() * 16).toString(16);
  }
  return s;
}

type LineSpec = {
  service: ServiceId;
  level: 'info' | 'error';
  count: number;
  make: (rand: () => number) => string;
};

// Info chatter shared by both scenarios: the healthy background every incident
// window still contains.
function infoSpecs(): LineSpec[] {
  return [
    {
      service: 'gateway',
      level: 'info',
      count: 90,
      make: (r) =>
        `GET /api/orders 200 ${8 + Math.floor(r() * 40)}ms req=${hexId(r, 8)}`,
    },
    {
      service: 'orders',
      level: 'info',
      count: 82,
      make: (r) =>
        `order ${hexId(r, 6)} validated in ${3 + Math.floor(r() * 22)}ms`,
    },
    {
      service: 'payments',
      level: 'info',
      count: 70,
      make: (r) =>
        `charge ${hexId(r, 6)} authorized amount=${5 + Math.floor(r() * 240)}`,
    },
    {
      service: 'db',
      level: 'info',
      count: 70,
      make: (r) =>
        `query orders_by_user took ${1 + Math.floor(r() * 9)}ms rows=${
          1 + Math.floor(r() * 40)
        }`,
    },
  ];
}

// The injected fault decides which service owns the dense error signature and
// how the failure propagates upstream.
function errorSpecs(scenario: ScenarioId): LineSpec[] {
  if (scenario === 'payments-outage') {
    return [
      {
        service: 'payments',
        level: 'error',
        count: 181,
        make: (r) =>
          `charge ${hexId(r, 6)} failed: connection refused to acquirer:8443`,
      },
      {
        service: 'orders',
        level: 'error',
        count: 60,
        make: (r) => `create order ${hexId(r, 6)} failed: payments unavailable`,
      },
      {
        service: 'gateway',
        level: 'error',
        count: 60,
        make: (r) => `POST /api/checkout 502 upstream error req=${hexId(r, 8)}`,
      },
      {
        service: 'db',
        level: 'error',
        count: 4,
        make: () => `lock wait timeout on table payments_ledger`,
      },
    ];
  }
  return [
    {
      service: 'db',
      level: 'error',
      count: 160,
      make: (r) =>
        `query orders_by_user took ${900 + Math.floor(r() * 2400)}ms exceeded slow threshold`,
    },
    {
      service: 'orders',
      level: 'error',
      count: 50,
      make: (r) => `order ${hexId(r, 6)} timed out waiting on db`,
    },
    {
      service: 'gateway',
      level: 'error',
      count: 45,
      make: (r) => `POST /api/checkout 504 gateway timeout req=${hexId(r, 8)}`,
    },
    {
      service: 'payments',
      level: 'error',
      count: 3,
      make: (r) => `charge ${hexId(r, 6)} aborted: caller gave up`,
    },
  ];
}

// Per-service p95, peak error rate, and the share of failing entry requests
// whose trace passes through the service, per scenario.
export function scenarioMetrics(
  scenario: ScenarioId,
): Record<ServiceId, ServiceMetrics> {
  const rows: ServiceMetrics[] =
    scenario === 'payments-outage'
      ? [
          {
            service: 'gateway',
            baselineP95Ms: 62,
            incidentP95Ms: 81,
            spike: 1.3,
            errorRatePeak: 0.22,
            entryErrorShare: 1,
          },
          {
            service: 'orders',
            baselineP95Ms: 38,
            incidentP95Ms: 61,
            spike: 1.6,
            errorRatePeak: 0.31,
            entryErrorShare: 1,
          },
          {
            service: 'payments',
            baselineP95Ms: 44,
            incidentP95Ms: 185,
            spike: 4.2,
            errorRatePeak: 0.74,
            entryErrorShare: 1,
          },
          {
            service: 'db',
            baselineP95Ms: 6,
            incidentP95Ms: 7,
            spike: 1.1,
            errorRatePeak: 0.02,
            entryErrorShare: 0.04,
          },
        ]
      : [
          {
            service: 'gateway',
            baselineP95Ms: 62,
            incidentP95Ms: 130,
            spike: 2.1,
            errorRatePeak: 0.19,
            entryErrorShare: 1,
          },
          {
            service: 'orders',
            baselineP95Ms: 38,
            incidentP95Ms: 110,
            spike: 2.9,
            errorRatePeak: 0.28,
            entryErrorShare: 1,
          },
          {
            service: 'payments',
            baselineP95Ms: 44,
            incidentP95Ms: 46,
            spike: 1.0,
            errorRatePeak: 0.02,
            entryErrorShare: 0.05,
          },
          {
            service: 'db',
            baselineP95Ms: 6,
            incidentP95Ms: 41,
            spike: 6.8,
            errorRatePeak: 0.41,
            entryErrorShare: 1,
          },
        ];
  return Object.fromEntries(rows.map((m) => [m.service, m])) as Record<
    ServiceId,
    ServiceMetrics
  >;
}

// Generate the incident window's log lines: info chatter plus the scenario's
// error lines, interleaved by a seeded shuffle so the stream reads naturally
// but is identical on every run.
export function generateLogs(scenario: ScenarioId): LogLine[] {
  const rand = mulberry32(SEED + (scenario === 'payments-outage' ? 0 : 1000));
  const lines: Omit<LogLine, 'id' | 'template'>[] = [];

  for (const spec of [...infoSpecs(), ...errorSpecs(scenario)]) {
    for (let i = 0; i < spec.count; i++) {
      lines.push({ service: spec.service, level: spec.level, raw: spec.make(rand) });
    }
  }

  // Fisher-Yates with the same PRNG stream keeps the interleaving stable.
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  return lines.map((l, id) => ({ ...l, id, template: '' }));
}
