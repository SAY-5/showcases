// Prometheus-style metrics with labels plus a text exposition renderer, a
// compact port of modelgate/serving/metrics.py.
export type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}

function renderLabels(labels: Labels, extra?: Labels): string {
  const all = { ...labels, ...(extra ?? {}) };
  const keys = Object.keys(all);
  if (!keys.length) return '';
  return `{${keys.map((k) => `${k}="${all[k]}"`).join(',')}}`;
}

interface Cell {
  labels: Labels;
  value: number;
}

export class Counter {
  readonly name: string;
  readonly help: string;
  private readonly cells = new Map<string, Cell>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { labels, value: 0 };
      this.cells.set(key, cell);
    }
    cell.value += by;
  }

  get(labels: Labels = {}): number {
    return this.cells.get(labelKey(labels))?.value ?? 0;
  }

  total(): number {
    let n = 0;
    for (const c of this.cells.values()) n += c.value;
    return n;
  }

  series(): Cell[] {
    return [...this.cells.values()];
  }

  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const s of this.cells.values()) lines.push(`${this.name}${renderLabels(s.labels)} ${s.value}`);
    return lines;
  }
}

export class Gauge {
  readonly name: string;
  readonly help: string;
  private readonly cells = new Map<string, Cell>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  set(labels: Labels, v: number): void {
    const key = labelKey(labels);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { labels, value: 0 };
      this.cells.set(key, cell);
    }
    cell.value = v;
  }

  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const s of this.cells.values()) lines.push(`${this.name}${renderLabels(s.labels)} ${s.value}`);
    return lines;
  }
}

export class Histogram {
  readonly name: string;
  readonly help: string;
  readonly buckets: readonly number[];
  private readonly cells = new Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>();

  constructor(name: string, help: string, buckets: readonly number[]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets;
  }

  observe(labels: Labels, v: number): void {
    const key = labelKey(labels);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { labels, counts: new Array<number>(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.cells.set(key, cell);
    }
    for (let i = 0; i < this.buckets.length; i++) if (v <= this.buckets[i]) cell.counts[i] += 1;
    cell.sum += v;
    cell.count += 1;
  }

  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const c of this.cells.values()) {
      this.buckets.forEach((le, i) => {
        lines.push(`${this.name}_bucket${renderLabels(c.labels, { le: String(le) })} ${c.counts[i]}`);
      });
      lines.push(`${this.name}_bucket${renderLabels(c.labels, { le: '+Inf' })} ${c.count}`);
      lines.push(`${this.name}_sum${renderLabels(c.labels)} ${Math.round(c.sum * 1e4) / 1e4}`);
      lines.push(`${this.name}_count${renderLabels(c.labels)} ${c.count}`);
    }
    return lines;
  }
}

export class MetricSet {
  readonly requests = new Counter('modelgate_requests_total', 'Prediction requests by version and outcome');
  readonly inputRejections = new Counter('modelgate_input_rejections_total', 'Requests rejected by input validation, by reason');
  readonly droppedRequests = new Counter('modelgate_dropped_requests_total', 'Requests that got no successful answer (5xx or no response)');
  readonly versionSwaps = new Counter('modelgate_version_swaps_total', 'Primary version swaps by kind');
  readonly shadowRequests = new Counter('modelgate_shadow_requests_total', 'Shadow inferences by shadow version and outcome');
  readonly modelVersionInfo = new Gauge('modelgate_model_version_info', '1 for the version holding each role');
  readonly modelsLoaded = new Gauge('modelgate_models_loaded', 'Versions resident in the warm pool');
  readonly requestLatency = new Histogram('modelgate_request_latency_seconds', 'End to end latency of /predict', [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1]);
  readonly predictionsEta = new Histogram('modelgate_prediction_eta_minutes', 'Distribution of predicted ETAs', [2, 5, 10, 15, 20, 30, 45, 60]);
  readonly shadowDivergence = new Histogram('modelgate_shadow_divergence_minutes', 'Absolute shadow minus primary ETA', [0.25, 0.5, 1, 2, 3, 5, 10]);

  expose(): string {
    return [
      ...this.requests.expose(),
      ...this.inputRejections.expose(),
      ...this.droppedRequests.expose(),
      ...this.versionSwaps.expose(),
      ...this.shadowRequests.expose(),
      ...this.modelVersionInfo.expose(),
      ...this.modelsLoaded.expose(),
      ...this.requestLatency.expose(),
      ...this.predictionsEta.expose(),
      ...this.shadowDivergence.expose(),
    ].join('\n');
  }
}
