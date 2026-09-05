// Kafka-like topic model. Every dispatchgrid topic has six partitions and is
// keyed by city id, so a city's events stay ordered on one partition.
// Partition choice is Kafka's default: murmur2 over the key bytes, masked
// positive, mod partition count.
export const PARTITIONS = 6;
export const TOPIC_RIDE_REQUESTS = 'ride-requests';
export const TOPIC_DRIVER_POSITIONS = 'driver-positions';
export const TOPIC_RIDE_MATCHES = 'ride-matches';
export const TOPIC_RIDE_UNMATCHED = 'ride-unmatched';

export function murmur2(data: Uint8Array): number {
  const length = data.length;
  const seed = 0x9747b28c;
  const m = 0x5bd1e995;
  const r = 24;
  let h = (seed ^ length) | 0;
  const length4 = Math.floor(length / 4);
  for (let i = 0; i < length4; i++) {
    const i4 = i * 4;
    let k = (data[i4] & 0xff) + ((data[i4 + 1] & 0xff) << 8) + ((data[i4 + 2] & 0xff) << 16) + ((data[i4 + 3] & 0xff) << 24);
    k = Math.imul(k, m);
    k ^= k >>> r;
    k = Math.imul(k, m);
    h = Math.imul(h, m);
    h ^= k;
  }
  const tail = length & ~3;
  const rem = length % 4;
  if (rem >= 3) h ^= (data[tail + 2] & 0xff) << 16;
  if (rem >= 2) h ^= (data[tail + 1] & 0xff) << 8;
  if (rem >= 1) {
    h ^= data[tail] & 0xff;
    h = Math.imul(h, m);
  }
  h ^= h >>> 13;
  h = Math.imul(h, m);
  h ^= h >>> 15;
  return h | 0;
}

const encoder = new TextEncoder();

export function partitionFor(key: string, partitions = PARTITIONS): number {
  return (murmur2(encoder.encode(key)) & 0x7fffffff) % partitions;
}

export interface TopicRecord<V> {
  offset: number;
  partition: number;
  key: string;
  value: V;
  timestamp: number;
}

export class Topic<V> {
  readonly name: string;
  readonly partitionCount: number;
  readonly partitions: TopicRecord<V>[][];
  private produced = 0;

  constructor(name: string, partitionCount = PARTITIONS) {
    this.name = name;
    this.partitionCount = partitionCount;
    this.partitions = Array.from({ length: partitionCount }, () => []);
  }

  append(key: string, value: V, timestamp: number): TopicRecord<V> {
    const partition = partitionFor(key, this.partitionCount);
    const log = this.partitions[partition];
    const rec: TopicRecord<V> = { offset: log.length, partition, key, value, timestamp };
    log.push(rec);
    this.produced++;
    // Keep the browser log bounded; offsets keep counting.
    if (log.length > 400) log.splice(0, log.length - 400);
    return rec;
  }

  get total(): number {
    return this.produced;
  }

  endOffset(partition: number): number {
    const log = this.partitions[partition];
    return log.length ? log[log.length - 1].offset + 1 : 0;
  }
}

// One consumer group member: tracks a committed offset per partition.
export class Consumer<V> {
  readonly topic: Topic<V>;
  readonly offsets: number[];

  constructor(topic: Topic<V>) {
    this.topic = topic;
    this.offsets = new Array<number>(topic.partitionCount).fill(0);
  }

  // Records visible up to (and including) the given timestamp, in partition order.
  poll(upToTimestamp: number, max = Infinity): TopicRecord<V>[] {
    const out: TopicRecord<V>[] = [];
    for (let p = 0; p < this.topic.partitionCount; p++) {
      const log = this.topic.partitions[p];
      const base = log.length ? log[0].offset : 0;
      while (this.offsets[p] - base < log.length && out.length < max) {
        const rec = log[this.offsets[p] - base];
        if (rec.timestamp > upToTimestamp) break;
        out.push(rec);
        this.offsets[p]++;
      }
    }
    return out;
  }

  lag(): number {
    let lag = 0;
    for (let p = 0; p < this.topic.partitionCount; p++) lag += this.topic.endOffset(p) - this.offsets[p];
    return lag;
  }
}
