// Shadow-run bookkeeping: port of modelgate/serving/shadow.py.
export interface ShadowRecord {
  requestId: string;
  primaryVersion: string;
  shadowVersion: string;
  primaryEta: number;
  shadowEta: number;
  at: number;
}

// Nearest-rank percentile, same as the Python helper.
export function percentile(values: number[], pct: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const k = Math.max(0, Math.min(ordered.length - 1, Math.ceil((pct / 100) * ordered.length) - 1));
  return ordered[k];
}

export interface ShadowReport {
  count: number;
  window: number;
  thresholdMinutes: number;
  absDelta: { mean: number; p50: number; p95: number; max: number };
  shareBeyondThreshold: number;
  biasMinutes: number;
  last: ShadowRecord | null;
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

export class ShadowTracker {
  readonly thresholdMinutes: number;
  readonly maxRecords: number;
  private records: ShadowRecord[] = [];
  private head = 0;
  private total = 0;

  constructor(thresholdMinutes: number, maxRecords: number) {
    this.thresholdMinutes = thresholdMinutes;
    this.maxRecords = maxRecords;
  }

  record(rec: ShadowRecord): void {
    if (this.records.length < this.maxRecords) {
      this.records.push(rec);
    } else {
      this.records[this.head] = rec;
      this.head = (this.head + 1) % this.maxRecords;
    }
    this.total += 1;
  }

  reset(): void {
    this.records = [];
    this.head = 0;
    this.total = 0;
  }

  window(): ShadowRecord[] {
    if (this.records.length < this.maxRecords) return [...this.records];
    return [...this.records.slice(this.head), ...this.records.slice(0, this.head)];
  }

  // Histogram of |delta| for the readout, bucket edges in minutes.
  histogram(edges: readonly number[]): number[] {
    const counts = new Array<number>(edges.length + 1).fill(0);
    for (const r of this.records) {
      const d = Math.abs(r.shadowEta - r.primaryEta);
      let i = 0;
      while (i < edges.length && d > edges[i]) i += 1;
      counts[i] += 1;
    }
    return counts;
  }

  report(): ShadowReport {
    const records = this.window();
    const n = records.length;
    const abs = records.map((r) => Math.abs(r.shadowEta - r.primaryEta));
    const beyond = abs.filter((d) => d > this.thresholdMinutes).length;
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    return {
      count: this.total,
      window: n,
      thresholdMinutes: this.thresholdMinutes,
      absDelta: {
        mean: n ? round4(sum(abs) / n) : 0,
        p50: round4(percentile(abs, 50)),
        p95: round4(percentile(abs, 95)),
        max: n ? round4(Math.max(...abs)) : 0,
      },
      shareBeyondThreshold: n ? round4(beyond / n) : 0,
      biasMinutes: n ? round4(sum(records.map((r) => r.shadowEta - r.primaryEta)) / n) : 0,
      last: records[n - 1] ?? null,
    };
  }
}
