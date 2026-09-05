// Port of matching-service MatchStats: totals, a trailing 60 second match
// rate, and latency percentiles over a fixed size reservoir of recent matches.
export const RESERVOIR = 8192;
export const WINDOW_MS = 60_000;

export interface StatsSnapshot {
  matched: number;
  unmatched: number;
  dropped: number;
  matchesPerMinute: number;
  matchesPerMinuteOverall: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export class MatchStats {
  private readonly clock: () => number;
  private matched = 0;
  private unmatched = 0;
  private dropped = 0;
  private firstMatchAt = 0;
  private recent: number[] = [];
  private recentHead = 0;
  private readonly latencies: number[] = [];
  private cursor = 0;
  private latencyCount = 0;

  constructor(clock: () => number) {
    this.clock = clock;
  }

  recordMatch(latencyMs: number): void {
    const now = this.clock();
    this.matched++;
    if (this.firstMatchAt === 0) this.firstMatchAt = now;
    this.recent.push(now);
    this.trim(now);
    this.latencies[this.cursor % RESERVOIR] = latencyMs;
    this.cursor++;
    this.latencyCount++;
  }

  recordUnmatched(): void {
    this.unmatched++;
  }

  recordDropped(): void {
    this.dropped++;
  }

  private trim(now: number): void {
    while (this.recentHead < this.recent.length && now - this.recent[this.recentHead] > WINDOW_MS) this.recentHead++;
    if (this.recentHead > 1024) {
      this.recent = this.recent.slice(this.recentHead);
      this.recentHead = 0;
    }
  }

  snapshot(): StatsSnapshot {
    const now = this.clock();
    this.trim(now);
    const first = this.firstMatchAt;
    const minutes = first === 0 ? 0 : Math.max(now - first, 1) / 60_000;
    const n = Math.min(this.latencyCount, RESERVOIR);
    const sample = this.latencies.slice(0, n).sort((a, b) => a - b);
    return {
      matched: this.matched,
      unmatched: this.unmatched,
      dropped: this.dropped,
      matchesPerMinute: this.recent.length - this.recentHead,
      matchesPerMinuteOverall: minutes === 0 ? 0 : Math.round(this.matched / minutes),
      p50LatencyMs: percentile(sample, 0.5),
      p95LatencyMs: percentile(sample, 0.95),
      p99LatencyMs: percentile(sample, 0.99),
    };
  }
}
